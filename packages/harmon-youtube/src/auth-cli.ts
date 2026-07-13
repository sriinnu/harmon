/**
 * I bootstrap, refresh, and report Google OAuth for the YouTube Music provider pack.
 */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readJson, writeJson, type JsonValue } from './token-store.js';

export interface YouTubePackConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
  apiKey?: string;
}

export interface YouTubeAuthState {
  provider: 'youtube-music';
  updatedAt: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
  tokenType: string;
}

interface GoogleTokenPayload {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

const authPath = resolveAuthPath('youtube-oauth.json');
const tokenUrl = 'https://oauth2.googleapis.com/token';
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * I keep Google OAuth state under user-local storage instead of the package
 * tree so installed packs stay immutable and publish-safe.
 */
function resolveAuthPath(fileName: string): string {
  const overrideRoot = process.env.HARMON_PACK_STATE_DIR?.trim();
  const stateRoot = overrideRoot && overrideRoot.length > 0
    ? overrideRoot
    : path.join(os.homedir(), '.chitragupta', 'harmon', 'provider-packs');
  return path.join(stateRoot, 'harmon-youtube', fileName);
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

function readConfig(): YouTubePackConfig {
  const port = Number.parseInt(process.env.YOUTUBE_MUSIC_AUTH_PORT || '8789', 10);
  return {
    clientId: process.env.YOUTUBE_MUSIC_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_MUSIC_CLIENT_SECRET,
    redirectUri: process.env.YOUTUBE_MUSIC_REDIRECT_URI || `http://127.0.0.1:${port}/callback`,
    scopes: (process.env.YOUTUBE_MUSIC_OAUTH_SCOPES || 'https://www.googleapis.com/auth/youtube.readonly').split(/\s+/).filter(Boolean),
    apiKey: process.env.YOUTUBE_MUSIC_API_KEY,
  };
}

function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function exchangeCode(config: YouTubePackConfig, code: string, verifier: string): Promise<GoogleTokenPayload> {
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
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }
  return await response.json() as GoogleTokenPayload;
}

export async function refreshToken(config: YouTubePackConfig, state: YouTubeAuthState): Promise<YouTubeAuthState> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: state.refreshToken || '',
  });
  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json() as GoogleTokenPayload;
  return {
    ...state,
    accessToken: payload.access_token,
    // Google may rotate the refresh token; preserve the new one when present.
    refreshToken: payload.refresh_token ?? state.refreshToken,
    scope: payload.scope || state.scope,
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (payload.expires_in || 3600) * 1000).toISOString(),
    tokenType: payload.token_type || state.tokenType || 'Bearer',
  };
}

/**
 * I validate the current YouTube auth posture against the public Data API.
 */
async function validateYouTube(state: YouTubeAuthState | null, apiKey?: string): Promise<void> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('q', 'ambient');
  url.searchParams.set('type', 'video');
  const headers: Record<string, string> = {};
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

/**
 * I escape text interpolated into locally served HTML pages.
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
 * I wait for the localhost Google OAuth callback and exchange the auth code.
 */
async function waitForCallback(
  config: YouTubePackConfig,
  verifier: string,
  expectedState: string,
): Promise<GoogleTokenPayload> {
  const redirectUrl = new URL(config.redirectUri);
  return await new Promise<GoogleTokenPayload>((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url || '/', redirectUrl);
      if (requestUrl.pathname !== redirectUrl.pathname) {
        response.writeHead(404).end('Not found');
        return;
      }
      const code = requestUrl.searchParams.get('code');
      const state = requestUrl.searchParams.get('state');
      if (!code) {
        response.writeHead(400).end('Missing code');
        reject(new Error('Google OAuth callback did not include a code.'));
        server.close();
        return;
      }
      if (!state) {
        response.writeHead(400).end('Missing state');
        reject(new Error('Google OAuth callback did not include a state parameter.'));
        server.close();
        return;
      }
      if (state !== expectedState) {
        response.writeHead(400).end('Invalid state');
        reject(new Error('Google OAuth state did not match the login attempt.'));
        server.close();
        return;
      }
      // Only tell the browser we succeeded once the code exchange actually
      // completed; otherwise show the failure.
      void exchangeCode(config, code, verifier)
        .then(payload => {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end('<h1>YouTube Music auth complete</h1><p>I saved your token locally. You can close this tab.</p>');
          resolve(payload);
        }, (error: unknown) => {
          response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(`<h1>YouTube Music auth failed</h1><pre>${escapeHtml(String(error instanceof Error ? error.message : error))}</pre>`);
          reject(error instanceof Error ? error : new Error(String(error)));
        })
        .finally(() => {
          server.close();
        });
    });
    server.on('error', reject);
    server.listen(Number(redirectUrl.port || 80), redirectUrl.hostname);
  });
}

/**
 * I print the current YouTube auth posture in a machine-friendly format.
 */
async function printStatus(state: YouTubeAuthState | null, lifecycle: string, apiKey?: string): Promise<void> {
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

async function bootstrap(): Promise<void> {
  const config = readConfig();
  const existing = await readJson<YouTubeAuthState>(authPath);
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
  const oauthState = randomBytes(24).toString('base64url');
  const url = new URL(authUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', oauthState);
  console.error(`YouTube Music login URL: ${url.toString()}`);
  const callback = waitForCallback(config, verifier, oauthState);
  await openUrl(url.toString());
  const payload = await callback;
  const authState: YouTubeAuthState = {
    provider: 'youtube-music',
    updatedAt: new Date().toISOString(),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || existing?.refreshToken || null,
    expiresAt: new Date(Date.now() + (payload.expires_in || 3600) * 1000).toISOString(),
    scope: payload.scope || config.scopes.join(' '),
    tokenType: payload.token_type || 'Bearer',
  };
  await validateYouTube(authState, config.apiKey);
  await writeJson(authPath, authState as unknown as JsonValue);
  await printStatus(authState, 'bootstrapped', config.apiKey);
}

async function refresh(): Promise<void> {
  const config = readConfig();
  const existing = await readJson<YouTubeAuthState>(authPath);
  if (!existing?.refreshToken) {
    throw new Error('I cannot refresh YouTube Music auth without a stored refresh token. Run npm run auth first.');
  }
  if (!config.clientId) {
    throw new Error('YOUTUBE_MUSIC_CLIENT_ID is required to refresh the stored Google token.');
  }
  const state = await refreshToken(config, existing);
  await validateYouTube(state, config.apiKey);
  await writeJson(authPath, state as unknown as JsonValue);
  await printStatus(state, 'refreshed', config.apiKey);
}

async function status(): Promise<void> {
  const config = readConfig();
  const state = await readJson<YouTubeAuthState>(authPath);
  if (state?.accessToken || config.apiKey) {
    await validateYouTube(state, config.apiKey);
  }
  await printStatus(state, 'status', config.apiKey);
}

// Only act as a CLI when executed directly, so tests can import the exported
// helpers without triggering a bootstrap.
const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const action = process.argv[2] || 'bootstrap';
  const handlers: Record<string, () => Promise<void>> = { bootstrap, refresh, status };

  if (!handlers[action]) {
    console.error(`Unknown YouTube Music auth command: ${action}`);
    process.exitCode = 1;
  } else {
    handlers[action]().catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}
