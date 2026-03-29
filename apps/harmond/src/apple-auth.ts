/**
 * apple-auth.ts — Apple Music auth for the Harmon daemon
 *
 * Manages developer tokens (with optional JWT auto-regeneration from key
 * material) and user tokens (obtained via MusicKit JS bootstrap).
 *
 * @module apple-auth
 */

import { createPrivateKey, createSign } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppleAuthConfig {
  /** Pre-generated developer token (JWT). */
  developerToken?: string;
  /** User token for library access. */
  userToken?: string;
  /** Apple Music storefront (default: "us"). */
  storefront?: string;
  /** For JWT auto-generation (optional): */
  teamId?: string;
  keyId?: string;
  privateKey?: string; // PEM-encoded ES256 key
  /** How long generated JWTs last in seconds (default: 30 days). */
  tokenTtlSeconds?: number;
  /** Persistent token store. */
  tokenStore: AppleTokenStore;
}

export interface AppleTokens {
  developerToken: string;
  developerTokenExpiresAt?: number;
  userToken?: string;
  storefront: string;
}

export interface AppleTokenStore {
  get(): Promise<AppleTokens | null>;
  set(tokens: AppleTokens | null): Promise<void>;
}

export type AppleAuthMode = 'none' | 'developer-token' | 'developer-and-user-token';

export interface AppleAuth {
  /** Get a valid developer token, auto-regenerating JWT if key material is available. */
  getDeveloperToken(): Promise<string | null>;
  /** Get the user token (may be undefined if not bootstrapped). */
  getUserToken(): string | undefined;
  /** Set user token (from MusicKit JS bootstrap). */
  setUserToken(token: string): Promise<void>;
  /** Clear all tokens (logout). */
  logout(): Promise<void>;
  /** Load tokens from store on startup. */
  loadTokens(): Promise<void>;
  /** Check if authenticated (has at least a developer token). */
  isConnected(): boolean;
  /** Get auth mode. */
  getAuthMode(): AppleAuthMode;
  /** Get the storefront. */
  getStorefront(): string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_TTL_SECONDS = 15_777_000; // ~6 months, Apple's hard cap
const REFRESH_BUFFER_MS = 60 * 60 * 1000; // regenerate if expiring within 1 hour

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class AppleAuthImpl implements AppleAuth {
  private readonly tokenStore: AppleTokenStore;
  private readonly teamId?: string;
  private readonly keyId?: string;
  private readonly privateKey?: string;
  private readonly tokenTtlSeconds: number;
  private readonly defaultStorefront: string;

  private tokens: AppleTokens | null = null;
  private tokensLoaded = false;
  private regeneratePromise: Promise<void> | null = null;

  constructor(config: AppleAuthConfig) {
    this.tokenStore = config.tokenStore;
    this.teamId = config.teamId;
    this.keyId = config.keyId;
    this.privateKey = config.privateKey?.replace(/\\n/g, '\n');
    this.tokenTtlSeconds = Math.min(
      config.tokenTtlSeconds ?? DEFAULT_TTL_SECONDS,
      MAX_TTL_SECONDS,
    );
    this.defaultStorefront = config.storefront ?? 'us';

    // Seed in-memory tokens from static config when provided.
    if (config.developerToken) {
      this.tokens = {
        developerToken: config.developerToken,
        userToken: config.userToken,
        storefront: this.defaultStorefront,
      };
    }
  }

  // -- Public API -----------------------------------------------------------

  async getDeveloperToken(): Promise<string | null> {
    if (!this.tokensLoaded) {
      await this.loadTokens();
    }

    if (!this.tokens?.developerToken) {
      // Attempt initial generation if key material is available.
      if (this.canGenerateToken()) {
        await this.regenerateAndPersist();
      }
      return this.tokens?.developerToken ?? null;
    }

    // Auto-refresh if close to expiry and we have key material.
    if (this.canGenerateToken() && this.isNearExpiry()) {
      await this.regenerateAndPersist();
    }

    return this.tokens.developerToken;
  }

  getUserToken(): string | undefined {
    return this.tokens?.userToken;
  }

  async setUserToken(token: string): Promise<void> {
    if (!this.tokensLoaded) {
      await this.loadTokens();
    }

    if (!this.tokens) {
      throw new Error(
        'Cannot set user token without a developer token. Bootstrap developer auth first.',
      );
    }

    this.tokens = { ...this.tokens, userToken: token };
    await this.tokenStore.set(this.tokens);
  }

  async logout(): Promise<void> {
    this.tokens = null;
    this.tokensLoaded = true;
    await this.tokenStore.set(null);
  }

  async loadTokens(): Promise<void> {
    if (this.tokensLoaded) return;
    const stored = await this.tokenStore.get();
    if (stored) {
      // Merge: in-memory seed (from env) wins over stored values for developer
      // token when the caller provided one explicitly.
      this.tokens = this.tokens
        ? { ...stored, ...this.tokens, userToken: this.tokens.userToken ?? stored.userToken }
        : stored;
    }
    this.tokensLoaded = true;
  }

  isConnected(): boolean {
    return this.tokens?.developerToken != null;
  }

  getAuthMode(): AppleAuthMode {
    if (!this.tokens?.developerToken) return 'none';
    return this.tokens.userToken
      ? 'developer-and-user-token'
      : 'developer-token';
  }

  getStorefront(): string {
    return this.tokens?.storefront ?? this.defaultStorefront;
  }

  // -- JWT generation -------------------------------------------------------

  private canGenerateToken(): boolean {
    return Boolean(this.teamId && this.keyId && this.privateKey);
  }

  private isNearExpiry(): boolean {
    if (!this.tokens?.developerTokenExpiresAt) return false;
    return this.tokens.developerTokenExpiresAt - Date.now() <= REFRESH_BUFFER_MS;
  }

  private generateDeveloperToken(): string {
    try {
      const header = Buffer.from(
        JSON.stringify({ alg: 'ES256', kid: this.keyId }),
      ).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(
        JSON.stringify({ iss: this.teamId, iat: now, exp: now + this.tokenTtlSeconds }),
      ).toString('base64url');

      const signingInput = `${header}.${payload}`;
      const signer = createSign('SHA256');
      signer.update(signingInput);
      signer.end();
      const signature = signer.sign(
        { key: createPrivateKey(this.privateKey!), dsaEncoding: 'ieee-p1363' },
      );

      return `${signingInput}.${signature.toString('base64url')}`;
    } catch (error) {
      throw new Error(
        `Failed to generate Apple Music developer token: ${error instanceof Error ? error.message : String(error)}. ` +
        'Verify APPLE_MUSIC_PRIVATE_KEY is a valid ES256 PEM key.',
      );
    }
  }

  private async regenerateAndPersist(): Promise<void> {
    // Dedup concurrent callers — only one regeneration runs at a time.
    if (this.regeneratePromise) {
      return this.regeneratePromise;
    }
    this.regeneratePromise = this._doRegenerate();
    try {
      await this.regeneratePromise;
    } finally {
      this.regeneratePromise = null;
    }
  }

  private async _doRegenerate(): Promise<void> {
    const newToken = this.generateDeveloperToken();
    const expiresAt = Date.now() + this.tokenTtlSeconds * 1000;
    this.tokens = {
      developerToken: newToken,
      developerTokenExpiresAt: expiresAt,
      userToken: this.tokens?.userToken,
      storefront: this.tokens?.storefront ?? this.defaultStorefront,
    };
    await this.tokenStore.set(this.tokens);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAppleAuth(config: AppleAuthConfig): AppleAuth {
  return new AppleAuthImpl(config);
}
