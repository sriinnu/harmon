/**
 * I bootstrap and validate Apple Music auth for the standalone provider pack.
 */

import { spawn } from 'node:child_process';
import { createPrivateKey, createSign, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createAppleMusicClient } from './index.js';
import { readJson, writeJson, type JsonValue } from './token-store.js';

interface ApplePackConfig {
  appName: string;
  appBuild: string;
  bootstrapUrl: string;
  storefront: string;
  developerToken?: string;
  userToken?: string;
  keyId?: string;
  teamId?: string;
  privateKeyPath?: string;
  privateKey?: string;
  ttlSeconds: number;
}

interface AppleBootstrapTokenPayload {
  state?: string;
  userToken?: string;
  storefront?: string;
}

interface AppleAuthState {
  provider: 'apple-music';
  updatedAt: string;
  developerToken: string;
  developerTokenSource: string;
  developerTokenExpiresAt: string | null;
  userToken: string | null;
  storefront: string;
  appName: string;
  appBuild: string;
}

const authPath = resolveAuthPath('apple-music.json');

/**
 * I keep Apple Music auth state under user-local storage instead of the
 * package tree so published packs never carry live tokens.
 */
function resolveAuthPath(fileName: string): string {
  const overrideRoot = process.env.HARMON_PACK_STATE_DIR?.trim();
  const stateRoot = overrideRoot && overrideRoot.length > 0
    ? overrideRoot
    : path.join(os.homedir(), '.chitragupta', 'harmon', 'provider-packs');
  return path.join(stateRoot, 'harmon-apple', fileName);
}

async function openUrl(url: string): Promise<void> {
  if (process.env.HARMON_NO_BROWSER === '1') {
    return;
  }
  const opener: [string, string[]] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  await new Promise<void>(resolve => {
    const child = spawn(opener[0], opener[1], { stdio: 'ignore' });
    child.on('error', () => resolve());
    child.on('close', () => resolve());
  });
}

function readConfig(): ApplePackConfig {
  const port = Number.parseInt(process.env.APPLE_MUSIC_BOOTSTRAP_PORT || '8788', 10);
  return {
    appName: process.env.APPLE_MUSIC_APP_NAME || 'Harmon',
    appBuild: process.env.APPLE_MUSIC_APP_BUILD || '0.1.0',
    bootstrapUrl: process.env.APPLE_MUSIC_BOOTSTRAP_URL || `http://127.0.0.1:${port}/`,
    storefront: process.env.APPLE_MUSIC_STOREFRONT || 'us',
    developerToken: process.env.APPLE_MUSIC_DEVELOPER_TOKEN,
    userToken: process.env.APPLE_MUSIC_USER_TOKEN,
    keyId: process.env.APPLE_MUSIC_KEY_ID,
    teamId: process.env.APPLE_MUSIC_TEAM_ID,
    privateKeyPath: process.env.APPLE_MUSIC_PRIVATE_KEY_PATH,
    privateKey: process.env.APPLE_MUSIC_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    ttlSeconds: Math.min(Number.parseInt(process.env.APPLE_MUSIC_DEVELOPER_TOKEN_TTL_SECONDS || `${30 * 24 * 60 * 60}`, 10), 15_777_000),
  };
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

/**
 * I resolve the Apple developer token from direct env input, local key material, or stored state.
 */
async function resolveDeveloperToken(config: ApplePackConfig, existingState: AppleAuthState | null): Promise<{ token: string; source: string; expiresAt: string | null } | null> {
  if (config.developerToken) {
    return { token: config.developerToken, source: 'env', expiresAt: null };
  }
  if (config.keyId && config.teamId && (config.privateKey || config.privateKeyPath)) {
    const privateKeyPath = config.privateKeyPath;
    const privateKey = config.privateKey || (privateKeyPath ? await readFile(privateKeyPath, 'utf8') : null);
    if (!privateKey) {
      throw new Error('APPLE_MUSIC_PRIVATE_KEY_PATH must point to a valid private key file.');
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: config.teamId, iat: now, exp: now + config.ttlSeconds };
    const encoded = `${base64Url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }))}.${base64Url(JSON.stringify(payload))}`;
    const signer = createSign('SHA256');
    signer.update(encoded);
    signer.end();
    const signature = signer.sign({
      key: createPrivateKey(privateKey),
      dsaEncoding: 'ieee-p1363',
    });
    return {
      token: `${encoded}.${signature.toString('base64url')}`,
      source: 'generated',
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }
  if (existingState?.developerToken) {
    return {
      token: existingState.developerToken,
      source: existingState.developerTokenSource,
      expiresAt: existingState.developerTokenExpiresAt,
    };
  }
  return null;
}

/**
 * I validate both the catalog token and the optional user token against the live Apple Music API.
 */
async function validateApple(state: AppleAuthState): Promise<void> {
  const client = createAppleMusicClient({
    developerToken: state.developerToken,
    userToken: state.userToken || undefined,
    storefront: state.storefront,
  });
  await client.search('ambient', ['songs'], { limit: 1 });
  if (state.userToken) {
    await client.getLibraryPlaylists({ limit: 1 });
  }
}

/**
 * I escape text interpolated into HTML markup on locally served pages.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * I serialize values for inline <script> blocks, escaping '<' so a value
 * containing '</script>' cannot break out of the script context.
 */
function jsonForScript(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function renderBootstrapPage(
  developerToken: string,
  appName: string,
  appBuild: string,
  tokenPath: string,
  state: string,
): string {
  const safeAppName = escapeHtml(appName);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeAppName} Apple Music Auth</title>
    <script src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"></script>
  </head>
  <body>
    <main>
      <h1>${safeAppName} Apple Music Auth</h1>
      <p>I use MusicKit JS to mint a user token for the local provider pack.</p>
      <button id="authorize">Authorize Apple Music</button>
      <pre id="status"></pre>
    </main>
    <script>
      const developerToken = ${jsonForScript(developerToken)};
      const appName = ${jsonForScript(appName)};
      const appBuild = ${jsonForScript(appBuild)};
      const state = ${jsonForScript(state)};
      const tokenPath = ${jsonForScript(tokenPath)};
      const status = document.getElementById('status');
      document.getElementById('authorize').addEventListener('click', async () => {
        try {
          MusicKit.configure({ developerToken, app: { name: appName, build: appBuild } });
          const music = MusicKit.getInstance();
          const userToken = await music.authorize();
          const storefront = music.storefrontId || null;
          await fetch(tokenPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, userToken, storefront }),
          });
          status.textContent = 'Apple Music auth complete. I saved your token locally.';
        } catch (error) {
          status.textContent = String(error && error.message ? error.message : error);
        }
      });
    </script>
  </body>
</html>`;
}

/**
 * I serve a local MusicKit bootstrap page and wait for the browser to post the user token back.
 */
async function captureUserToken(config: ApplePackConfig, developerToken: string): Promise<AppleBootstrapTokenPayload> {
  const bootstrapUrl = new URL(config.bootstrapUrl);
  const bootstrapState = randomBytes(24).toString('base64url');
  const tokenPath = bootstrapUrl.pathname === '/'
    ? '/token'
    : `${bootstrapUrl.pathname.replace(/\/$/, '')}/token`;
  return new Promise<AppleBootstrapTokenPayload>((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url || '/', bootstrapUrl);
      if (request.method === 'GET' && requestUrl.pathname === bootstrapUrl.pathname) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(renderBootstrapPage(
          developerToken,
          config.appName,
          config.appBuild,
          tokenPath,
          bootstrapState,
        ));
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === tokenPath) {
        let body = '';
        request.on('data', chunk => { body += chunk.toString(); });
        request.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}') as AppleBootstrapTokenPayload;
            const origin = request.headers.origin;
            if (origin && origin !== bootstrapUrl.origin) {
              throw new Error('Apple Music bootstrap origin did not match the local bootstrap server.');
            }
            if (payload.state !== bootstrapState) {
              throw new Error('Apple Music bootstrap state did not match the login attempt.');
            }
            response.writeHead(200).end('ok');
            resolve(payload);
          } catch (error) {
            response.writeHead(400).end('invalid bootstrap request');
            reject(error);
          } finally {
            server.close();
          }
        });
        return;
      }
      response.writeHead(404).end('Not found');
    });
    server.on('error', reject);
    server.listen(Number(bootstrapUrl.port || 80), bootstrapUrl.hostname);
  });
}

/**
 * I print the current Apple Music auth posture in a machine-friendly format.
 */
async function printStatus(state: AppleAuthState | null, lifecycle: string): Promise<void> {
  console.log(JSON.stringify({
    provider: 'apple-music',
    state: lifecycle,
    connected: Boolean(state?.developerToken),
    hasDeveloperToken: Boolean(state?.developerToken),
    hasUserToken: Boolean(state?.userToken),
    mode: !state?.developerToken ? 'disconnected' : state.userToken ? 'catalog-and-library' : 'catalog-only',
    storefront: state?.storefront || null,
    developerTokenSource: state?.developerTokenSource || null,
    developerTokenExpiresAt: state?.developerTokenExpiresAt || null,
    authFile: authPath,
  }, null, 2));
}

async function bootstrap(): Promise<void> {
  const config = readConfig();
  const existing = await readJson<AppleAuthState>(authPath);
  const developer = await resolveDeveloperToken(config, existing);
  if (!developer) {
    throw new Error('Set APPLE_MUSIC_DEVELOPER_TOKEN or APPLE_MUSIC_TEAM_ID / APPLE_MUSIC_KEY_ID / APPLE_MUSIC_PRIVATE_KEY_PATH.');
  }
  if (existing?.userToken && process.env.HARMON_AUTH_FORCE !== '1' && !config.userToken) {
    const current: AppleAuthState = {
      ...existing,
      storefront: config.storefront || existing.storefront,
      developerToken: developer.token,
      developerTokenSource: developer.source,
      developerTokenExpiresAt: developer.expiresAt,
    };
    try {
      await validateApple(current);
      await writeJson(authPath, current as unknown as JsonValue);
      await printStatus(current, 'already-authenticated');
      return;
    } catch {
      // I fall through to MusicKit bootstrap so rerunning auth can repair an
      // expired stored user token without requiring an undocumented force flag.
    }
  }
  console.error(`Apple Music bootstrap URL: ${config.bootstrapUrl}`);
  const tokenPromise = config.userToken
    ? Promise.resolve({ userToken: config.userToken, storefront: config.storefront })
    : captureUserToken(config, developer.token);
  if (!config.userToken) {
    await openUrl(config.bootstrapUrl);
  }
  const tokenPayload = await tokenPromise;
  const state: AppleAuthState = {
    provider: 'apple-music',
    updatedAt: new Date().toISOString(),
    developerToken: developer.token,
    developerTokenSource: developer.source,
    developerTokenExpiresAt: developer.expiresAt,
    userToken: tokenPayload.userToken || null,
    storefront: tokenPayload.storefront || config.storefront,
    appName: config.appName,
    appBuild: config.appBuild,
  };
  await validateApple(state);
  await writeJson(authPath, state as unknown as JsonValue);
  await printStatus(state, 'bootstrapped');
}

async function refresh(): Promise<void> {
  const config = readConfig();
  const existing = await readJson<AppleAuthState>(authPath);
  const developer = await resolveDeveloperToken(config, existing);
  if (!developer) {
    throw new Error('I cannot refresh Apple Music auth without a developer token or key material.');
  }
  const state: AppleAuthState = {
    provider: 'apple-music',
    updatedAt: new Date().toISOString(),
    developerToken: developer.token,
    developerTokenSource: developer.source,
    developerTokenExpiresAt: developer.expiresAt,
    userToken: config.userToken || existing?.userToken || null,
    storefront: config.storefront || existing?.storefront || 'us',
    appName: config.appName,
    appBuild: config.appBuild,
  };
  await validateApple(state);
  await writeJson(authPath, state as unknown as JsonValue);
  await printStatus(state, 'refreshed');
}

async function status(): Promise<void> {
  const state = await readJson<AppleAuthState>(authPath);
  await printStatus(state, 'status');
}

const action = process.argv[2] || 'bootstrap';
const handlers: Record<string, () => Promise<void>> = { bootstrap, refresh, status };

if (!handlers[action]) {
  console.error(`Unknown Apple Music auth command: ${action}`);
  process.exitCode = 1;
} else {
  handlers[action]().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
