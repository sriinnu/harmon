/**
 * I bootstrap, refresh, and report Spotify auth for the standalone provider pack.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  createSpotifyAuth,
  createSpotifyClient,
  type SpotifyAuth,
  type SpotifyCookieRecord,
  type SpotifyTokens,
} from './index.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface SpotifyPackConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
}

interface CookiePayload {
  cookies: SpotifyCookieRecord[];
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const authDir = path.join(packageRoot, '.chitragupta-ecosystem', 'auth');
const tokensPath = path.join(authDir, 'spotify.tokens.json');
const cookiesPath = path.join(authDir, 'spotify.cookies.json');

/**
 * I load JSON state from disk when it exists.
 */
async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * I persist JSON state and remove the file when the value is null.
 */
async function writeJson(filePath: string, value: JsonValue | null): Promise<void> {
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

/**
 * I normalize cookie import input from either JSON files, JSON strings, or sp_dc/sp_key env vars.
 */
async function readCookieBootstrapInput(): Promise<SpotifyCookieRecord[] | null> {
  if (process.env.SPOTIFY_COOKIE_JSON) {
    return normalizeCookiePayload(JSON.parse(process.env.SPOTIFY_COOKIE_JSON) as unknown);
  }
  if (process.env.SPOTIFY_COOKIES_PATH) {
    return normalizeCookiePayload(JSON.parse(await readFile(process.env.SPOTIFY_COOKIES_PATH, 'utf8')) as unknown);
  }
  const cookies: SpotifyCookieRecord[] = [];
  if (process.env.SPOTIFY_SP_DC) {
    cookies.push(makeCookieRecord('sp_dc', process.env.SPOTIFY_SP_DC));
  }
  if (process.env.SPOTIFY_SP_KEY) {
    cookies.push(makeCookieRecord('sp_key', process.env.SPOTIFY_SP_KEY));
  }
  return cookies.length > 0 ? cookies : null;
}

function makeCookieRecord(name: string, value: string): SpotifyCookieRecord {
  return {
    domain: '.spotify.com',
    name,
    path: '/',
    value,
    isSecure: true,
    isHTTPOnly: true,
  };
}

function normalizeCookiePayload(payload: unknown): SpotifyCookieRecord[] {
  if (Array.isArray(payload)) {
    return payload as SpotifyCookieRecord[];
  }
  if (isCookiePayload(payload)) {
    return payload.cookies;
  }
  throw new Error('Spotify cookie input must be a JSON array or an object with a cookies array.');
}

function isCookiePayload(payload: unknown): payload is CookiePayload {
  return Boolean(payload) && typeof payload === 'object' && Array.isArray((payload as CookiePayload).cookies);
}

function readConfig(): SpotifyPackConfig {
  const port = Number.parseInt(process.env.SPOTIFY_AUTH_PORT || '8787', 10);
  const scopes = (process.env.SPOTIFY_OAUTH_SCOPES || '').split(/\s+/).filter(Boolean);
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${port}/callback`,
    scopes: scopes.length > 0 ? scopes : undefined,
  };
}

async function createAuth(): Promise<SpotifyAuth> {
  const config = readConfig();
  const tokenStore = {
    get: () => readJson<SpotifyTokens>(tokensPath),
    set: (value: SpotifyTokens | null) => writeJson(tokensPath, value as JsonValue | null),
  };
  const cookieStore = {
    get: () => readJson<SpotifyCookieRecord[]>(cookiesPath),
    set: (value: SpotifyCookieRecord[] | null) => writeJson(cookiesPath, value as JsonValue[] | null),
  };
  const auth = createSpotifyAuth({ ...config, tokenStore, cookieStore });
  await auth.loadTokens();
  return auth;
}

/**
 * I validate the stored Spotify auth state against a real API call.
 */
async function validateSpotify(auth: SpotifyAuth): Promise<void> {
  const client = createSpotifyClient({ auth });
  await client.search('Tycho', ['track'], { limit: 1 });
}

/**
 * I wait for the localhost PKCE callback and complete the token exchange.
 */
async function waitForCallback(auth: SpotifyAuth, redirectUri: string): Promise<void> {
  const callbackUrl = new URL(redirectUri);
  if (!['127.0.0.1', 'localhost'].includes(callbackUrl.hostname)) {
    throw new Error('Spotify bootstrap requires a localhost redirect URI.');
  }
  await new Promise<void>((resolve, reject) => {
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
        response.end(`<h1>Spotify auth failed</h1><pre>${String(error instanceof Error ? error.message : error)}</pre>`);
        reject(error);
      } finally {
        server.close();
      }
    });
    server.on('error', reject);
    server.listen(Number(callbackUrl.port || 80), callbackUrl.hostname);
  });
}

/**
 * I print the current Spotify auth posture in a machine-friendly format.
 */
async function printStatus(auth: SpotifyAuth, state: string): Promise<void> {
  const tokens = await readJson<SpotifyTokens>(tokensPath);
  const cookies = await readJson<SpotifyCookieRecord[]>(cookiesPath);
  console.log(JSON.stringify({
    provider: 'spotify',
    state,
    authMode: auth.getAuthMode(),
    connected: auth.isConnected(),
    hasRefreshToken: Boolean(tokens?.refreshToken),
    tokenExpiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
    cookieCount: Array.isArray(cookies) ? cookies.length : 0,
    authFiles: { tokensPath, cookiesPath },
  }, null, 2));
}

async function bootstrap(): Promise<void> {
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
  const config = readConfig();
  if (!config.clientId) {
    throw new Error('Set SPOTIFY_CLIENT_ID for PKCE OAuth, or provide cookie input via SPOTIFY_COOKIES_PATH / SPOTIFY_COOKIE_JSON / SPOTIFY_SP_DC.');
  }
  const loginUrl = auth.getLoginUrl();
  const callback = waitForCallback(auth, config.redirectUri);
  console.error(`Spotify login URL: ${loginUrl}`);
  await openUrl(loginUrl);
  await callback;
  await validateSpotify(auth);
  await printStatus(auth, 'oauth-bootstrapped');
}

async function refresh(): Promise<void> {
  const auth = await createAuth();
  await auth.refresh();
  await validateSpotify(auth);
  await printStatus(auth, 'refreshed');
}

async function status(): Promise<void> {
  const auth = await createAuth();
  await printStatus(auth, 'status');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === 'object' && 'code' in error;
}

const action = process.argv[2] || 'bootstrap';
const handlers: Record<string, () => Promise<void>> = { bootstrap, refresh, status };

if (!handlers[action]) {
  console.error(`Unknown Spotify auth command: ${action}`);
  process.exitCode = 1;
} else {
  handlers[action]().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
