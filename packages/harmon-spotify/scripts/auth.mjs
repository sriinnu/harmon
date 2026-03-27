/**
 * I bootstrap, refresh, and report Spotify auth for the standalone provider pack.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createSpotifyAuth, createSpotifyClient } from '../dist/index.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const authDir = path.join(packageRoot, '.chitragupta-ecosystem', 'auth');
const tokensPath = path.join(authDir, 'spotify.tokens.json');
const cookiesPath = path.join(authDir, 'spotify.cookies.json');

/**
 * I load JSON state from disk when it exists.
 */
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

/**
 * I persist JSON state and remove the file when the value is null.
 */
async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  if (value == null) {
    await rm(filePath, { force: true });
    return;
  }
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * I open the browser when the host OS supports it and otherwise fall back to logging the URL.
 */
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

/**
 * I normalize cookie import input from either JSON files, JSON strings, or sp_dc/sp_key env vars.
 */
async function readCookieBootstrapInput() {
  if (process.env.SPOTIFY_COOKIE_JSON) {
    return normalizeCookiePayload(JSON.parse(process.env.SPOTIFY_COOKIE_JSON));
  }
  if (process.env.SPOTIFY_COOKIES_PATH) {
    return normalizeCookiePayload(JSON.parse(await readFile(process.env.SPOTIFY_COOKIES_PATH, 'utf8')));
  }
  const cookies = [];
  if (process.env.SPOTIFY_SP_DC) {
    cookies.push(makeCookieRecord('sp_dc', process.env.SPOTIFY_SP_DC));
  }
  if (process.env.SPOTIFY_SP_KEY) {
    cookies.push(makeCookieRecord('sp_key', process.env.SPOTIFY_SP_KEY));
  }
  return cookies.length > 0 ? cookies : null;
}

function makeCookieRecord(name, value) {
  return {
    domain: '.spotify.com',
    name,
    path: '/',
    value,
    isSecure: true,
    isHTTPOnly: true,
  };
}

function normalizeCookiePayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.cookies)) {
    return payload.cookies;
  }
  throw new Error('Spotify cookie input must be a JSON array or an object with a cookies array.');
}

function readConfig() {
  const port = Number.parseInt(process.env.SPOTIFY_AUTH_PORT || '8787', 10);
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${port}/callback`,
    scopes: (process.env.SPOTIFY_OAUTH_SCOPES || '').split(/\s+/).filter(Boolean),
  };
}

async function createAuth() {
  const config = readConfig();
  const tokenStore = { get: () => readJson(tokensPath), set: value => writeJson(tokensPath, value) };
  const cookieStore = { get: () => readJson(cookiesPath), set: value => writeJson(cookiesPath, value) };
  const auth = createSpotifyAuth({ ...config, tokenStore, cookieStore });
  await auth.loadTokens();
  return auth;
}

/**
 * I validate the stored Spotify auth state against a real API call.
 */
async function validateSpotify(auth) {
  const client = createSpotifyClient({ auth });
  await client.search('Tycho', ['track'], { limit: 1 });
}

async function waitForCallback(auth, redirectUri) {
  const callbackUrl = new URL(redirectUri);
  if (!['127.0.0.1', 'localhost'].includes(callbackUrl.hostname)) {
    throw new Error('Spotify bootstrap requires a localhost redirect URI.');
  }
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const requestUrl = new URL(request.url || '/', callbackUrl);
      if (requestUrl.pathname !== callbackUrl.pathname) {
        response.writeHead(404).end('Not found');
        return;
      }
      try {
        await auth.handleCallback(
          requestUrl.searchParams.get('code') || '',
          requestUrl.searchParams.get('state') || undefined,
        );
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<h1>Spotify auth complete</h1><p>I saved your auth state locally. You can close this tab.</p>');
        resolve();
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(`<h1>Spotify auth failed</h1><pre>${String(error.message || error)}</pre>`);
        reject(error);
      } finally {
        server.close();
      }
    });
    server.on('error', reject);
    server.listen(Number(callbackUrl.port || 80), callbackUrl.hostname);
  });
}

async function printStatus(auth, state) {
  const tokens = await readJson(tokensPath);
  const cookies = await readJson(cookiesPath);
  console.log(JSON.stringify({
    provider: 'spotify',
    state,
    authMode: auth.getAuthMode(),
    connected: auth.isConnected(),
    hasRefreshToken: Boolean(tokens?.refreshToken),
    tokenExpiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
    cookieCount: Array.isArray(cookies) ? cookies.length : 0,
    authFiles: {
      tokensPath,
      cookiesPath,
    },
  }, null, 2));
}

async function bootstrap() {
  const auth = await createAuth();
  const importedCookies = await readCookieBootstrapInput();
  if (auth.isConnected() && process.env.HARMON_AUTH_FORCE !== '1' && !importedCookies) {
    await validateSpotify(auth);
    await printStatus(auth, 'already-authenticated');
    return;
  }
  if (importedCookies) {
    await auth.setCookies(importedCookies);
    await validateSpotify(auth);
    await printStatus(auth, 'cookie-imported');
    return;
  }
  if (!readConfig().clientId) {
    throw new Error('Set SPOTIFY_CLIENT_ID for PKCE OAuth, or provide cookie input via SPOTIFY_COOKIES_PATH / SPOTIFY_COOKIE_JSON / SPOTIFY_SP_DC.');
  }
  const loginUrl = auth.getLoginUrl();
  const callback = waitForCallback(auth, readConfig().redirectUri);
  console.error(`Spotify login URL: ${loginUrl}`);
  await openUrl(loginUrl);
  await callback;
  await validateSpotify(auth);
  await printStatus(auth, 'oauth-bootstrapped');
}

async function refresh() {
  const auth = await createAuth();
  await auth.refresh();
  await validateSpotify(auth);
  await printStatus(auth, 'refreshed');
}

async function status() {
  const auth = await createAuth();
  await printStatus(auth, 'status');
}

const action = process.argv[2] || 'bootstrap';
const handlers = { bootstrap, refresh, status };

if (!handlers[action]) {
  console.error(`Unknown Spotify auth command: ${action}`);
  process.exitCode = 1;
} else {
  handlers[action]().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
