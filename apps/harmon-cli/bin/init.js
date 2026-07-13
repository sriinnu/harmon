/**
 * `harmon init` — guided, validating onboarding.
 *
 * Walks security → providers → verification. Each step shows the dashboard
 * link and the exact values to register, validates every pasted credential
 * before moving on, offers macOS Keychain storage for secrets, and finishes
 * by starting/health-checking the daemon and running the OAuth logins with
 * a connected-poll so the user ends with providers actually working.
 */

import { createInterface } from 'node:readline';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import {
  validateGoogleClientId,
  validateGoogleClientSecret,
  validateSpotifyClientId,
} from './runtime.js';

const REDIRECT_SPOTIFY = 'http://127.0.0.1:17373/v1/auth/spotify/callback';
const REDIRECT_YOUTUBE = 'http://127.0.0.1:17373/v1/auth/youtube/callback';

export async function runInit({ createCLI, getDefaultEndpoint, outputPath = '.env' }) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
  const askUntilValid = async (prompt, validate, { allowSkip = true } = {}) => {
    for (;;) {
      const value = await ask(prompt);
      if (!value && allowSkip) return null;
      const result = validate(value);
      if (result.ok) return value;
      console.log(`    ✗ ${result.message}`);
      if (allowSkip) console.log('    (press Enter to skip)');
    }
  };

  const isMac = process.platform === 'darwin';
  const env = {};
  const keychainStored = [];

  const storeSecret = async (name, value) => {
    if (isMac && useKeychain) {
      try {
        execFileSync('security', ['add-generic-password', '-s', 'harmon', '-a', name, '-w', value, '-U'], { stdio: 'ignore' });
        keychainStored.push(name);
        console.log(`    ✓ ${name} → macOS Keychain`);
        return;
      } catch {
        console.log(`    ! Keychain write failed — falling back to ${outputPath}`);
      }
    }
    env[name] = value;
  };

  console.log('');
  console.log('  harmon setup — step-by-step, with validation.');
  console.log('  Press Enter on any prompt to skip that item.');
  console.log('');

  // ── Step 1: security ──────────────────────────────────────────────────
  console.log('── Step 1/5 · Security ───────────────────────────────');
  let useKeychain = false;
  if (isMac) {
    useKeychain = (await ask('  Store secrets in the macOS Keychain instead of .env? (Y/n) ')).toLowerCase() !== 'n';
  }
  await storeSecret('HARMON_API_TOKEN', randomBytes(32).toString('base64'));
  await storeSecret('HARMON_ENCRYPTION_SECRET', randomBytes(32).toString('base64'));
  console.log('  ✓ API token + encryption secret generated');

  // ── Step 2: Spotify ───────────────────────────────────────────────────
  console.log('');
  console.log('── Step 2/5 · Spotify (recommended first provider) ───');
  console.log('  1. Open https://developer.spotify.com/dashboard → Create app');
  console.log('  2. Redirect URI (exact):');
  console.log(`       ${REDIRECT_SPOTIFY}`);
  console.log('  3. API used: Web API only. Client secret NOT needed (PKCE).');
  const spotifyId = await askUntilValid('  Spotify Client ID (Enter to skip): ', validateSpotifyClientId);
  if (spotifyId) {
    env.SPOTIFY_CLIENT_ID = spotifyId;
    env.SPOTIFY_REDIRECT_URI = REDIRECT_SPOTIFY;
    console.log('  ✓ Spotify configured (playback needs Spotify Premium)');
  } else {
    console.log('  ⊘ Skipped');
  }

  // ── Step 3: YouTube Music ─────────────────────────────────────────────
  console.log('');
  console.log('── Step 3/5 · YouTube Music ──────────────────────────');
  console.log('  Guide: docs/youtube-music.md. Short version:');
  console.log('  1. console.cloud.google.com → enable "YouTube Data API v3"');
  console.log('  2. OAuth consent screen → External, Testing mode —');
  console.log('     ⚠ ADD YOURSELF UNDER "Test users" or login 403s.');
  console.log('  3. Credentials → OAuth client ID → type "Web application"');
  console.log('     Authorized redirect URI (exact):');
  console.log(`       ${REDIRECT_YOUTUBE}`);
  console.log('  4. Copy Client ID and Client Secret (shown ONCE).');
  const ytId = await askUntilValid('  Google Client ID (Enter to skip): ', validateGoogleClientId);
  if (ytId) {
    env.YOUTUBE_MUSIC_CLIENT_ID = ytId;
    const ytSecret = await askUntilValid('  Google Client Secret (GOCSPX-…): ', validateGoogleClientSecret, { allowSkip: false });
    await storeSecret('YOUTUBE_MUSIC_CLIENT_SECRET', ytSecret);
    console.log('  ✓ YouTube Music configured');
  } else {
    console.log('  ⊘ Skipped');
  }

  // ── Step 4: Apple Music ───────────────────────────────────────────────
  console.log('');
  console.log('── Step 4/5 · Apple Music ────────────────────────────');
  console.log('  Requires: Apple Developer Program ($99/yr) + Apple Music');
  console.log('  subscription. Skip unless you already pay for both.');
  console.log('  Guide: docs/apple-music.md (Media ID must start with "media.")');
  const appleTeam = await askUntilValid('  Apple Team ID (10 chars, Enter to skip): ', (v) =>
    /^[A-Z0-9]{10}$/i.test(v) ? { ok: true } : { ok: false, message: 'Team IDs are 10 alphanumeric characters (Membership details page).' });
  if (appleTeam) {
    const appleKey = await askUntilValid('  MusicKit Key ID (10 chars): ', (v) =>
      /^[A-Z0-9]{10}$/i.test(v) ? { ok: true } : { ok: false, message: 'Key IDs are 10 alphanumeric characters (shown on the key page).' }, { allowSkip: false });
    const p8Path = await ask('  Path to the downloaded .p8 file: ');
    try {
      const pem = await fs.readFile(p8Path.replace(/^~/, process.env.HOME || '~'), 'utf8');
      if (!pem.includes('BEGIN PRIVATE KEY')) throw new Error('not a PEM private key');
      env.APPLE_MUSIC_TEAM_ID = appleTeam;
      env.APPLE_MUSIC_KEY_ID = appleKey;
      await storeSecret('APPLE_MUSIC_PRIVATE_KEY', pem);
      console.log('  ✓ Apple Music configured (daemon auto-mints the JWT)');
    } catch (error) {
      console.log(`    ✗ Could not read the .p8 (${error.message}) — Apple skipped; rerun init later.`);
    }
  } else {
    console.log('  ⊘ Skipped');
  }

  // ── Write .env (non-secrets + any secrets that declined keychain) ─────
  console.log('');
  let existing = '';
  try { existing = await fs.readFile(outputPath, 'utf8'); } catch { /* new file */ }
  const keep = existing
    .split('\n')
    .filter((line) => {
      const key = line.split('=')[0];
      return line.trim() && !Object.hasOwn(env, key);
    });
  const lines = [...keep, ...Object.entries(env).map(([k, v]) => `${k}=${v}`)];
  await fs.writeFile(outputPath, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`  ✓ Config written to ${outputPath} (mode 600)${keychainStored.length ? `; secrets in Keychain: ${keychainStored.join(', ')}` : ''}`);

  // ── Step 5: verify ────────────────────────────────────────────────────
  console.log('');
  console.log('── Step 5/5 · Verify ─────────────────────────────────');
  const verify = (await ask('  Start the daemon and verify now? (Y/n) ')).toLowerCase() !== 'n';
  if (verify) {
    const endpoint = getDefaultEndpoint();
    const health = async () => {
      try {
        const res = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
      } catch { return false; }
    };

    if (!(await health())) {
      console.log('  Starting harmond…');
      const child = spawn(process.execPath, [new URL('./harmond.js', import.meta.url).pathname], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      for (let i = 0; i < 10 && !(await health()); i++) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (await health()) {
      console.log('  ✓ Daemon is up');
      const token = env.HARMON_API_TOKEN
        ?? (isMac ? tryKeychainRead('HARMON_API_TOKEN') : undefined);
      const cli = createCLI({ endpoint, token, timeoutMs: 10000 });

      for (const [provider, configured, login] of [
        ['spotify', Boolean(env.SPOTIFY_CLIENT_ID), () => cli.authLogin()],
        ['youtube', Boolean(env.YOUTUBE_MUSIC_CLIENT_ID), () => cli.youtubeAuthLogin()],
      ]) {
        if (!configured) continue;
        const go = (await ask(`  Log in to ${provider} now? (Y/n) `)).toLowerCase() !== 'n';
        if (!go) continue;
        try {
          const { url } = await login();
          if (url) {
            console.log('  Opening browser — approve access…');
            spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
            const connected = await pollConnected(cli, provider, 60);
            console.log(connected ? `  ✓ ${provider} connected` : `  ! ${provider} not confirmed yet — finish in the browser, then run: harmon auth status`);
          }
        } catch (error) {
          console.log(`  ✗ ${provider} login failed: ${error.message}`);
        }
      }
      console.log('');
      console.log('  Done. Try:  harmon smart-play "your favourite song"');
    } else {
      console.log('  ! Daemon did not come up — start it with: pnpm start:daemon (or harmond)');
    }
  } else {
    console.log('  Next: start the daemon (harmond), then: harmon auth spotify login');
  }

  console.log('');
  rl.close();
}

function tryKeychainRead(name) {
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'harmon', '-a', name, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\n$/, '');
  } catch {
    return undefined;
  }
}

async function pollConnected(cli, provider, seconds) {
  for (let i = 0; i < seconds / 2; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const status = await cli.status();
      if (status?.providers?.[provider]?.connected) return true;
    } catch { /* daemon busy — keep polling */ }
  }
  return false;
}
