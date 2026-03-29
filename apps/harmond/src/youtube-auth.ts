/**
 * youtube-auth.ts — YouTube Music OAuth with PKCE and auto-refresh
 *
 * Provides a daemon-resident YouTubeAuth that manages Google OAuth
 * tokens with PKCE, automatic refresh before expiry, and encrypted
 * persistence via a pluggable token store.
 *
 * Follows the same structural patterns as SpotifyAuth in
 * @sriinnu/harmon-spotify.
 *
 * @module youtube-auth
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// ============================================================================
// Constants
// ============================================================================

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const LOGIN_ATTEMPT_TTL_MS = 10 * 60_000;
const MAX_PENDING_LOGIN_ATTEMPTS = 10;

// ============================================================================
// Types
// ============================================================================

export interface YouTubeAuthConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  apiKey?: string;
  tokenStore: YouTubeTokenStore;
}

export interface YouTubeTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
}

export interface YouTubeTokenStore {
  get(): Promise<YouTubeTokens | null>;
  set(tokens: YouTubeTokens | null): Promise<void>;
}

export interface YouTubeAuth {
  /** Get a valid access token, auto-refreshing if needed. Returns null if not authenticated. */
  getAccessToken(): Promise<string | null>;
  /** Get the API key (for unauthenticated catalog search). */
  getApiKey(): string | undefined;
  /** Generate the OAuth login URL with PKCE. */
  getLoginUrl(): string;
  /** Handle the OAuth callback -- exchange code for tokens. */
  handleCallback(code: string, state?: string): Promise<void>;
  /** Manually refresh the access token. */
  refresh(): Promise<void>;
  /** Clear all tokens (logout). */
  logout(): Promise<void>;
  /** Load tokens from store on startup. */
  loadTokens(): Promise<void>;
  /** Check if authenticated (has valid tokens). */
  isConnected(): boolean;
  /** Get auth mode: 'none' | 'oauth' | 'api-key' */
  getAuthMode(): 'none' | 'oauth' | 'api-key';
}

// ============================================================================
// Google token response shape
// ============================================================================

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

// ============================================================================
// Implementation
// ============================================================================

class YouTubeAuthImpl implements YouTubeAuth {
  private clientId: string;
  private clientSecret?: string;
  private redirectUri: string;
  private apiKey?: string;
  private tokenStore: YouTubeTokenStore;
  private tokens: YouTubeTokens | null = null;
  private tokensLoaded = false;
  private refreshPromise: Promise<void> | null = null;
  private pendingLoginAttempts = new Map<string, { codeVerifier: string; createdAt: number }>();

  constructor(config: YouTubeAuthConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.apiKey = config.apiKey;
    this.tokenStore = config.tokenStore;
  }

  // ---------- public API ----------

  async loadTokens(): Promise<void> {
    await this.ensureTokensLoaded();
  }

  isConnected(): boolean {
    return this.tokens !== null || !!this.apiKey;
  }

  getAuthMode(): 'none' | 'oauth' | 'api-key' {
    if (this.tokens?.refreshToken) return 'oauth';
    if (this.tokens !== null) return 'oauth';
    if (this.apiKey) return 'api-key';
    return 'none';
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getLoginUrl(): string {
    this.ensureConfigured();
    this.cleanupPendingLoginAttempts();

    const codeVerifier = generateCodeVerifier();
    const state = generateState();

    this.pendingLoginAttempts.set(state, {
      codeVerifier,
      createdAt: Date.now(),
    });
    this.trimPendingLoginAttempts();

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: DEFAULT_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: generateCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, state?: string): Promise<void> {
    this.ensureConfigured();

    if (!code) {
      throw new Error('Missing authorization code');
    }
    if (!state) {
      throw new Error('Missing OAuth state parameter');
    }

    this.cleanupPendingLoginAttempts();
    const pending = this.findAndValidateState(state);
    if (!pending) {
      throw new Error('Invalid OAuth state');
    }

    const tokens = await this.exchangeCode(code, pending.codeVerifier);
    await this.saveTokens(tokens);
    this.pendingLoginAttempts.delete(state);
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this._doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async logout(): Promise<void> {
    this.tokens = null;
    this.tokensLoaded = true;
    await this.tokenStore.set(null);
  }

  async getAccessToken(): Promise<string | null> {
    await this.ensureTokensLoaded();

    if (!this.tokens) {
      return null;
    }

    if (this.tokens.expiresAt - Date.now() <= 60_000) {
      await this.refresh();
    }

    return this.tokens?.accessToken ?? null;
  }

  // ---------- private helpers ----------

  private async _doRefresh(): Promise<void> {
    await this.ensureTokensLoaded();

    if (!this.tokens?.refreshToken) {
      throw new Error('No YouTube refresh token available');
    }

    this.ensureConfigured();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refreshToken,
      client_id: this.clientId,
    });
    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret);
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`YouTube token refresh failed: ${response.status} ${detail}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;
    const refreshed: YouTubeTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      scope: data.scope ?? this.tokens.scope,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };

    await this.saveTokens(refreshed);
  }

  private async exchangeCode(code: string, codeVerifier: string): Promise<YouTubeTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier,
    });
    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret);
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`YouTube token exchange failed: ${response.status} ${detail}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  }

  private ensureConfigured(): void {
    if (!this.clientId || !this.redirectUri) {
      throw new Error('YouTube configuration missing (client ID or redirect URI).');
    }
  }

  private async ensureTokensLoaded(): Promise<void> {
    if (this.tokensLoaded) return;
    this.tokens = (await this.tokenStore.get()) ?? null;
    this.tokensLoaded = true;
  }

  private async saveTokens(tokens: YouTubeTokens): Promise<void> {
    this.tokens = tokens;
    this.tokensLoaded = true;
    await this.tokenStore.set(tokens);
  }

  /**
   * Timing-safe state lookup: iterate all pending states and compare
   * with constant-time equality so timing cannot leak valid state values.
   */
  private findAndValidateState(
    state: string,
  ): { codeVerifier: string; createdAt: number } | undefined {
    const incoming = Buffer.from(state);
    for (const [candidate, attempt] of this.pendingLoginAttempts.entries()) {
      const stored = Buffer.from(candidate);
      if (incoming.length === stored.length && timingSafeEqual(incoming, stored)) {
        return attempt;
      }
    }
    return undefined;
  }

  private cleanupPendingLoginAttempts(): void {
    const cutoff = Date.now() - LOGIN_ATTEMPT_TTL_MS;
    for (const [state, attempt] of this.pendingLoginAttempts.entries()) {
      if (attempt.createdAt < cutoff) {
        this.pendingLoginAttempts.delete(state);
      }
    }
  }

  private trimPendingLoginAttempts(): void {
    while (this.pendingLoginAttempts.size > MAX_PENDING_LOGIN_ATTEMPTS) {
      const oldestState = this.pendingLoginAttempts.keys().next().value;
      if (!oldestState) return;
      this.pendingLoginAttempts.delete(oldestState);
    }
  }
}

// ============================================================================
// PKCE helpers
// ============================================================================

function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(64));
}

function generateState(): string {
  return base64UrlEncode(randomBytes(16));
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

// ============================================================================
// Factory
// ============================================================================

export function createYouTubeAuth(config: YouTubeAuthConfig): YouTubeAuth {
  return new YouTubeAuthImpl(config);
}
