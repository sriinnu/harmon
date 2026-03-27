/**
 * I bootstrap, refresh, and report Google OAuth for the YouTube Music provider pack.
 */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const authPath = path.join(packageRoot, '.chitragupta-ecosystem', 'auth', 'youtube-oauth.json');
const tokenUrl = 'https://oauth2.googleapis.com/token';
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  if (value == null) {
    await rm(filePath, { force: true });
    return;
  }
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function openUrl(url) {
  if (process.env.HARMON_NO_BROWSER === '1') {
    return;
  }
  const opener = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  await new Promise(resolve => {
    const child = spawn(opener[0], opener[1], { stdio: 'ignore' });
    child.on('error', () => resolve());
    child.on('close', () => resolve());
  });
}

function readConfig() {
  const port = Number.parseInt(process.env.YOUTUBE_MUSIC_AUTH_PORT || '8789', 10);
  return {
    clientId: process.env.YOUTUBE_MUSIC_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_MUSIC_CLIENT_SECRET,
    redirectUri: process.env.YOUTUBE_MUSIC_REDIRECT_URI || `http://127.0.0.1:${port}/callback`,
    scopes: (process.env.YOUTUBE_MUSIC_OAUTH_SCOPES || 'https://www.googleapis.com/auth/youtube.readonly').split(/\s+/).filter(Boolean),
    apiKey: process.env.YOUTUBE_MUSIC_API_KEY,
  };
}

function createPkcePair() {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function exchangeCode(config, code, verifier) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  });
  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }
  const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function refreshToken(config, state) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: state.refreshToken,
  });
  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }
  const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  return {
    ...state,
    accessToken: payload.access_token,
    scope: payload.scope || state.scope,
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (payload.expires_in || 3600) * 1000).toISOString(),
    tokenType: payload.token_type || state.tokenType || 'Bearer',
  };
}

async function validateYouTube(state, apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('q', 'ambient');
  url.searchParams.set('type', 'video');
  const headers = {};
  if (state?.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  } else if (apiKey) {
    url.searchParams.set('key', apiKey);
  } else {
    throw new Error('YouTube auth status requires either OAuth state or YOUTUBE_MUSIC_API_KEY.');
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`YouTube validation failed: ${response.status} ${await response.text()}`);
  }
}

async function waitForCallback(config, verifier) {
  const redirectUrl = new URL(config.redirectUri);
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url || '/', redirectUrl);
      if (requestUrl.pathname !== redirectUrl.pathname) {
        response.writeHead(404).end('Not found');
        return;
      }
      const code = requestUrl.searchParams.get('code');
      if (!code) {
        response.writeHead(400).end('Missing code');
        reject(new Error('Google OAuth callback did not include a code.'));
        server.close();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<h1>YouTube Music auth complete</h1><p>I saved your token locally. You can close this tab.</p>');
      resolve(exchangeCode(config, code, verifier));
      server.close();
    });
    server.on('error', reject);
    server.listen(Number(redirectUrl.port || 80), redirectUrl.hostname);
  });
}

async function printStatus(state, lifecycle, apiKey) {
  console.log(JSON.stringify({
    provider: 'youtube-music',
    state: lifecycle,
    mode: state?.accessToken ? 'oauth' : apiKey ? 'api-key' : 'disconnected',
    connected: Boolean(state?.accessToken || apiKey),
    hasRefreshToken: Boolean(state?.refreshToken),
    expiresAt: state?.expiresAt || null,
    scope: state?.scope || null,
    authFile: authPath,
    apiKeyConfigured: Boolean(apiKey),
  }, null, 2));
}

async function bootstrap() {
  const config = readConfig();
  const existing = await readJson(authPath);
  if (existing?.accessToken && process.env.HARMON_AUTH_FORCE !== '1') {
    await validateYouTube(existing, config.apiKey);
    await printStatus(existing, 'already-authenticated', config.apiKey);
    return;
  }
  if (!config.clientId) {
    if (config.apiKey) {
      await validateYouTube(null, config.apiKey);
      await printStatus(null, 'api-key-only', config.apiKey);
      return;
    }
    throw new Error('Set YOUTUBE_MUSIC_CLIENT_ID for OAuth bootstrap, or configure YOUTUBE_MUSIC_API_KEY for catalog-only mode.');
  }
  const { verifier, challenge } = createPkcePair();
  const url = new URL(authUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  console.error(`YouTube Music login URL: ${url.toString()}`);
  const callback = waitForCallback(config, verifier);
  await openUrl(url.toString());
  const payload = await callback;
  const state = {
    provider: 'youtube-music',
    updatedAt: new Date().toISOString(),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || existing?.refreshToken || null,
    expiresAt: new Date(Date.now() + (payload.expires_in || 3600) * 1000).toISOString(),
    scope: payload.scope || config.scopes.join(' '),
    tokenType: payload.token_type || 'Bearer',
  };
  await validateYouTube(state, config.apiKey);
  await writeJson(authPath, state);
  await printStatus(state, 'bootstrapped', config.apiKey);
}

async function refresh() {
  const config = readConfig();
  const existing = await readJson(authPath);
  if (!existing?.refreshToken) {
    throw new Error('I cannot refresh YouTube Music auth without a stored refresh token. Run npm run auth first.');
  }
  if (!config.clientId) {
    throw new Error('YOUTUBE_MUSIC_CLIENT_ID is required to refresh the stored Google token.');
  }
  const state = await refreshToken(config, existing);
  await validateYouTube(state, config.apiKey);
  await writeJson(authPath, state);
  await printStatus(state, 'refreshed', config.apiKey);
}

async function status() {
  const config = readConfig();
  const state = await readJson(authPath);
  if (state?.accessToken || config.apiKey) {
    await validateYouTube(state, config.apiKey);
  }
  await printStatus(state, 'status', config.apiKey);
}

const action = process.argv[2] || 'bootstrap';
const handlers = { bootstrap, refresh, status };

if (!handlers[action]) {
  console.error(`Unknown YouTube Music auth command: ${action}`);
  process.exitCode = 1;
} else {
  handlers[action]().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
