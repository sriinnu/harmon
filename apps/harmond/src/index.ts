/**
 * Harmond — The Harmon daemon orchestrator
 *
 * Wires providers, session engines, middleware, and route modules into
 * a single Express HTTP+SSE server.  Route definitions live in routes/*.ts;
 * parsing helpers live in helpers.ts.  This file owns the lifecycle:
 * construction, startup, shutdown, and the session control plane.
 */

import express, { Request, Response } from 'express';
import { HarmonStore } from '@sriinnu/harmon-store';
import { createEngine, type MusicProvider, type SessionEngine, type EngineEvent } from '@sriinnu/harmon-core';
import { createLogger, type Logger } from '@sriinnu/harmon-logger';
import { createEncryptor, type Encryptor } from '@sriinnu/harmon-crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Socket } from 'node:net';
import {
  MusicProviderName,
  SessionPolicy,
  type Event,
  type DaemonStatus,
} from '@sriinnu/harmon-protocol';
import {
  createSpotifyAuth,
  createSpotifyClient,
  createSpotifyProvider,
  createSpotifyPlayback,
  type SpotifyAuth,
  type SpotifyClient,
  type SpotifyCookieRecord,
} from '@sriinnu/harmon-spotify';
import {
  createAppleMusicClient,
  createAppleMusicProvider,
  type AppleMusicClient,
} from '@sriinnu/harmon-apple';
import {
  createYouTubeMusicClient,
  createYouTubeMusicProvider,
  type YouTubeMusicClient,
} from '@sriinnu/harmon-youtube';
import {
  ConfigurationError,
  ProviderUnavailableError,
  SessionNotFoundError,
  ValidationError,
  errorHandler,
} from './errors.js';
import { validateDaemonEnvironment } from './config.js';
import { getDaemonVersion } from './version.js';
import {
  getBrowserLaunchSupport,
  createAppleMusicPlaybackController,
  createRuntimePlaybackController,
  createYouTubeMusicPlaybackController,
  type BrowserLaunchSupport,
  type ProviderRuntime,
} from './provider-runtime.js';
import {
  createApplePlaybackOnlyProvider,
  createAppleRemoteBridge,
  createAppleRemotePlaybackController,
  createAppleUnifiedPlaybackController,
  type AppleRemoteBridge,
} from './apple-remote.js';
import { createHistoryBackedProvider } from './history-provider.js';

// -- Extracted modules --------------------------------------------------------
import {
  getSpotifyProviderStatus as _getSpotifyProviderStatus,
  getAppleProviderStatus as _getAppleProviderStatus,
  getYouTubeProviderStatus as _getYouTubeProviderStatus,
} from './provider-status.js';
import {
  createSpotifyTokenStore,
  createSpotifyCookieStore,
  createYouTubeTokenStore,
  createAppleTokenStore,
  type CredentialLoadFlags,
} from './credential-stores.js';
import { createYouTubeAuth, type YouTubeAuth } from './youtube-auth.js';
import { createAppleAuth, type AppleAuth } from './apple-auth.js';
import {
  validateSessionPolicyForProvider,
  normalizeSessionPolicy,
  assertProviderReady as _assertProviderReady,
  getProviderPlaybackUnavailableMessage,
  validateImportedSpotifyCookies as _validateImportedSpotifyCookies,
} from './session-policy.js';
import { handleRouteError as _handleRouteError } from './error-classification.js';
import { applyMiddleware, createAuthMiddleware } from './middleware.js';

// -- Route modules -----------------------------------------------------------
import { registerAuthRoutes } from './routes/auth.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerSpotifyRoutes } from './routes/spotify.js';
import { registerAppleRoutes } from './routes/apple.js';
import { registerYouTubeRoutes } from './routes/youtube.js';
import { registerSmartRoutes } from './routes/smart.js';
import { registerRecognizeRoutes } from './routes/recognize.js';
import { registerPlayerRoutes } from './routes/player.js';

// -- Shared types ------------------------------------------------------------
import type { DaemonContext, ProviderStatusDetails } from './daemon-context.js';

// -- Configuration -----------------------------------------------------------
const DEFAULT_PORT = 17373;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DB_PATH = '.harmon.db';
const DEFAULT_DEV_CORS_ORIGINS = ['http://127.0.0.1:4173', 'http://localhost:4173'];
const SSE_HEARTBEAT_MS = 30000;
const SHUTDOWN_TIMEOUT_MS = 5000;
const TRACK_POLL_INTERVAL_MS = 5000;
const DAEMON_VERSION = getDaemonVersion();

interface DaemonConfig {
  port?: number;
  host?: string;
  dbPath?: string;
  enableSSE?: boolean;
  apiToken?: string;
  corsOrigins?: string[];
}

function parsePort(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCorsOrigins(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function getDefaultCorsOrigins(nodeEnv?: string): string[] {
  if (nodeEnv === 'production') {
    return [];
  }
  return [...DEFAULT_DEV_CORS_ORIGINS];
}

// -- Harmond Implementation --------------------------------------------------
export class Harmond implements DaemonContext {
  private app: express.Application;

  // -- DaemonContext fields (public so route modules can read them) -----------
  readonly logger: Logger;
  readonly store: HarmonStore;
  readonly encryptor?: Encryptor;
  readonly spotifyAuth: SpotifyAuth;
  readonly spotifyClient: SpotifyClient;
  readonly spotifyRuntime: ProviderRuntime;
  readonly spotifyRedirectUri: string;
  spotifyTokenLoadFailure = false;
  spotifyCookieLoadFailure = false;
  youtubeTokenLoadFailure = false;
  appleTokenLoadFailure = false;

  readonly appleMusicClient?: AppleMusicClient;
  readonly appleRuntime?: ProviderRuntime;
  readonly appleRemoteBridge?: AppleRemoteBridge;
  readonly appleRemoteToken?: string;
  readonly appleCatalogEnabled: boolean;
  readonly appleLibraryEnabled: boolean;
  readonly appleLocalPlaybackEnabled = process.platform === 'darwin';

  readonly youtubeMusicClient?: YouTubeMusicClient;
  readonly youtubeRuntime?: ProviderRuntime;
  readonly youtubeBrowserSupport: BrowserLaunchSupport;
  readonly youtubeAccessToken?: string;
  readonly youtubeApiKey?: string;

  readonly youtubeAuth?: YouTubeAuth;
  readonly appleAuth?: AppleAuth;

  readonly engines = new Map<MusicProviderName, SessionEngine>();
  activeProvider: MusicProviderName | null = null;

  readonly sseClients: Set<Response> = new Set();
  readonly enableSSE: boolean;

  // -- Private fields --------------------------------------------------------
  private requestLogger: Logger;
  private port: number;
  private host: string;
  readonly apiToken?: string;
  private corsOrigins: Set<string>;
  private allowAllOrigins = false;
  private openSockets: Set<Socket> = new Set();
  private server: ReturnType<express.Application['listen']> | null = null;
  private sseHeartbeat: ReturnType<typeof setInterval> | null = null;
  private trackPollInterval: ReturnType<typeof setInterval> | null = null;
  private lastTrackId: string | null = null;
  private isPolling = false;
  private sessionStartInFlight = false;

  constructor(config: DaemonConfig = {}) {
    const envPort = parsePort(process.env.HARMON_PORT);
    const envHost = process.env.HARMON_BIND_ADDRESS;
    const envDbPath = process.env.HARMON_DB_PATH;
    const envCorsOrigins = parseCorsOrigins(process.env.HARMON_CORS_ORIGINS);
    const configuredCorsOrigins = config.corsOrigins ?? envCorsOrigins;
    const corsOrigins = configuredCorsOrigins.length > 0
      ? configuredCorsOrigins
      : getDefaultCorsOrigins(process.env.NODE_ENV);

    this.port = config.port ?? envPort ?? DEFAULT_PORT;
    this.host = config.host || envHost || DEFAULT_HOST;
    this.apiToken = config.apiToken || process.env.HARMON_API_TOKEN;
    this.allowAllOrigins = corsOrigins.includes('*');
    this.corsOrigins = new Set(corsOrigins.filter((origin) => origin !== '*'));
    this.enableSSE = config.enableSSE ?? true;

    // Initialize logging
    this.logger = createLogger({ name: 'harmond' });
    this.requestLogger = this.logger.child({ module: 'http' });

    this.app = express();

    // Use HarmonStore directly (not async createStore) — migrate() called in start()
    this.store = new HarmonStore({ dbPath: config.dbPath ?? envDbPath ?? DEFAULT_DB_PATH });

    // Initialize encryption if secret provided
    const encryptionSecret = process.env.HARMON_ENCRYPTION_SECRET;
    const validatedEnvironment = validateDaemonEnvironment({
      apiToken: this.apiToken,
      corsOrigins,
      encryptionSecret,
      host: this.host,
      nodeEnv: process.env.NODE_ENV,
      port: this.port,
      spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
      spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI,
    });
    this.spotifyRedirectUri = validatedEnvironment.spotifyRedirectUri;

    if (encryptionSecret) {
      this.encryptor = createEncryptor({ secret: encryptionSecret });
      this.logger.info('Credential encryption enabled');
    } else {
      this.logger.warn('Credential encryption disabled — development only');
    }

    // ── Spotify provider init ──────────────────────────────────────────
    const credentialFlags: CredentialLoadFlags = this;
    const tokenStore = createSpotifyTokenStore(this.store, this.encryptor, this.logger, credentialFlags);
    const cookieStore = createSpotifyCookieStore(this.store, this.encryptor, this.logger, credentialFlags);
    this.spotifyAuth = createSpotifyAuth({
      clientId: process.env.SPOTIFY_CLIENT_ID || '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri: this.spotifyRedirectUri,
      tokenStore,
      cookieStore,
    });
    this.spotifyClient = createSpotifyClient({ auth: this.spotifyAuth });
    this.spotifyRuntime = {
      name: 'spotify',
      provider: createSpotifyProvider(this.spotifyClient),
      playback: createRuntimePlaybackController(createSpotifyPlayback(this.spotifyClient)),
      playbackMode: 'native',
      autoStartSession: true,
    };
    this.registerRuntime(this.spotifyRuntime);

    // ── Apple Music provider init ──────────────────────────────────────
    const appleDeveloperToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    const appleUserToken = process.env.APPLE_MUSIC_USER_TOKEN;
    this.appleRemoteToken = process.env.APPLE_MUSIC_REMOTE_TOKEN;
    const appleRemotePlaybackEnabled =
      typeof this.appleRemoteToken === 'string' &&
      this.appleRemoteToken.length > 0;
    if (appleRemotePlaybackEnabled) {
      this.appleRemoteBridge = createAppleRemoteBridge();
    }
    this.appleCatalogEnabled = Boolean(appleDeveloperToken);
    this.appleLibraryEnabled = false;
    if (appleDeveloperToken) {
      this.appleLibraryEnabled =
        typeof appleUserToken === 'string' &&
        appleUserToken.length > 0;
      this.appleMusicClient = createAppleMusicClient({
        developerToken: appleDeveloperToken,
        userToken: appleUserToken,
        storefront: process.env.APPLE_MUSIC_STOREFRONT || 'us',
      });
    }
    const appleProvider = this.appleMusicClient
      ? createHistoryBackedProvider({
          baseProvider: createAppleMusicProvider(this.appleMusicClient),
          provider: 'apple',
          recentPlaysMode: 'delegate-or-local',
          store: this.store,
        })
      : createApplePlaybackOnlyProvider();
    const appleLocalPlayback =
      this.appleLocalPlaybackEnabled && this.appleMusicClient
        ? createAppleMusicPlaybackController(this.appleMusicClient)
        : undefined;
    const appleRemotePlayback =
      appleRemotePlaybackEnabled && this.appleRemoteBridge
        ? createAppleRemotePlaybackController({
            bridge: this.appleRemoteBridge,
            client: this.appleMusicClient,
          })
        : undefined;
    if (appleLocalPlayback || appleRemotePlayback) {
      this.appleRuntime = {
        name: 'apple',
        provider: appleProvider,
        playback:
          appleLocalPlayback && appleRemotePlayback
            ? createAppleUnifiedPlaybackController({
                bridge: this.appleRemoteBridge,
                local: appleLocalPlayback,
                remote: appleRemotePlayback,
              })
            : appleLocalPlayback ?? appleRemotePlayback!,
        playbackMode: appleLocalPlayback ? 'applescript' : 'remote',
        autoStartSession: true,
      };
      this.registerRuntime(this.appleRuntime);
    }

    // ── YouTube Music provider init ────────────────────────────────────
    this.youtubeAccessToken = process.env.YOUTUBE_MUSIC_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN;
    this.youtubeApiKey = process.env.YOUTUBE_MUSIC_API_KEY || process.env.YT_API_KEY;
    this.youtubeBrowserSupport = getBrowserLaunchSupport();
    if (this.youtubeAccessToken || this.youtubeApiKey) {
      this.youtubeMusicClient = createYouTubeMusicClient({
        accessToken: this.youtubeAccessToken,
        apiKey: this.youtubeApiKey,
      });
      if (this.youtubeBrowserSupport.available) {
        this.youtubeRuntime = {
          name: 'youtube',
          provider: createHistoryBackedProvider({
            baseProvider: createYouTubeMusicProvider(this.youtubeMusicClient),
            provider: 'youtube',
            recentPlaysMode: 'local',
            store: this.store,
          }),
          playback: createYouTubeMusicPlaybackController(),
          playbackMode: 'browser-handoff',
          autoStartSession: true,
        };
        this.registerRuntime(this.youtubeRuntime);
      }
    }

    // ── YouTube auth ──────────────────────────────────────────────────
    const youtubeClientId = process.env.YOUTUBE_MUSIC_CLIENT_ID;
    const youtubeRedirectUri = process.env.YOUTUBE_MUSIC_REDIRECT_URI || 'http://127.0.0.1:17373/v1/auth/youtube/callback';
    if (youtubeClientId) {
      const youtubeTokenStore = createYouTubeTokenStore(this.store, this.encryptor, this);
      this.youtubeAuth = createYouTubeAuth({
        clientId: youtubeClientId,
        clientSecret: process.env.YOUTUBE_MUSIC_CLIENT_SECRET,
        redirectUri: youtubeRedirectUri,
        apiKey: this.youtubeApiKey,
        tokenStore: youtubeTokenStore,
      });
    }

    // ── Apple auth ────────────────────────────────────────────────────
    const appleTeamId = process.env.APPLE_MUSIC_TEAM_ID;
    const appleKeyId = process.env.APPLE_MUSIC_KEY_ID;
    const applePrivateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;
    if (appleDeveloperToken || (appleTeamId && appleKeyId && applePrivateKey)) {
      const appleTokenStore = createAppleTokenStore(this.store, this.encryptor, this);
      this.appleAuth = createAppleAuth({
        developerToken: appleDeveloperToken,
        userToken: appleUserToken,
        storefront: process.env.APPLE_MUSIC_STOREFRONT || 'us',
        teamId: appleTeamId,
        keyId: appleKeyId,
        privateKey: applePrivateKey,
        tokenStore: appleTokenStore,
      });
    }

    this.logger.info({ port: this.port, host: this.host }, 'Daemon initializing');

    this.setupMiddleware();
    this.setupRoutes();
  }

  // -- Provider Runtime Registration ------------------------------------------
  /**
   * Register one playback-capable provider runtime and bind a dedicated
   * session engine to it.
   */
  private registerRuntime(runtime: ProviderRuntime): void {
    this.engines.set(runtime.name, createEngine({
      provider: runtime.provider,
      playback: runtime.playback,
      store: this.store,
      onEvent: this.handleEngineEvent.bind(this),
      logger: this.logger,
    }));
  }

  private handleEngineEvent(event: EngineEvent): void {
    const provider = this.getActiveProvider();
    this.broadcastEvent(event.type, provider ? { provider, ...event.payload } : event.payload);
  }

  // -- Middleware (delegates to middleware module) -----------------------------
  private setupMiddleware(): void {
    applyMiddleware(this.app, {
      requestLogger: this.requestLogger,
      allowAllOrigins: this.allowAllOrigins,
      corsOrigins: this.corsOrigins,
    });
  }

  // -- Route Setup (delegates to extracted route modules) ---------------------
  private setupRoutes(): void {
    // Health check — no auth required
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', version: DAEMON_VERSION, timestamp: new Date().toISOString() });
    });

    // Player pages — no auth required (browser-facing UI)
    registerPlayerRoutes(this.app, this);

    // Auth middleware for all /v1 routes
    this.app.use('/v1', createAuthMiddleware(this.apiToken, this.appleRemoteToken));

    // Register route modules
    registerAuthRoutes(this.app, this);
    registerSessionRoutes(this.app, this);
    registerSpotifyRoutes(this.app, this);
    registerAppleRoutes(this.app, this);
    registerYouTubeRoutes(this.app, this);
    registerSmartRoutes(this.app, this);
    registerRecognizeRoutes(this.app, this);

    // Error handler (must be last)
    this.app.use(errorHandler(this.logger));
  }

  // -- SSE (Server-Sent Events) -----------------------------------------------
  private setupSSE(): void {
    if (!this.enableSSE) {
      return;
    }

    this.sseHeartbeat = setInterval(() => {
      const event = this.createEvent('heartbeat', { timestamp: new Date().toISOString() });
      const message = `data: ${JSON.stringify(event)}\n\n`;
      const deadClients: Response[] = [];

      for (const client of this.sseClients) {
        try {
          if (!client.write(message)) deadClients.push(client);
        } catch { deadClients.push(client); }
      }

      for (const client of deadClients) {
        this.sseClients.delete(client);
        try { client.end(); } catch { /* ignore */ }
      }
    }, SSE_HEARTBEAT_MS);
  }

  /** Broadcast an SSE event to all connected clients. */
  broadcastEvent(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.enableSSE) {
      return;
    }

    const event = this.createEvent(type, payload);
    const message = `data: ${JSON.stringify(event)}\n\n`;
    const deadClients: Response[] = [];

    for (const client of this.sseClients) {
      try { client.write(message); }
      catch { deadClients.push(client); }
    }

    for (const client of deadClients) {
      this.sseClients.delete(client);
      try { client.end(); } catch { /* ignore */ }
    }
  }

  /** Create a typed Event envelope with fresh ID and timestamp. */
  createEvent(type: string, payload: Record<string, unknown> = {}): Event {
    return {
      id: `e_${uuidv4().slice(0, 8)}`,
      ts: Date.now(),
      type: type as Event['type'],
      payload,
    };
  }

  // -- Provider Resolution (DaemonContext methods) ----------------------------
  /** Return the currently active provider name, or null. */
  getActiveProvider(): MusicProviderName | null {
    if (this.activeProvider) {
      return this.activeProvider;
    }

    for (const [provider, engine] of this.engines.entries()) {
      if (engine.getState()) {
        this.activeProvider = provider;
        return provider;
      }
    }

    return null;
  }

  /** Return the active session engine, or null. */
  getActiveEngine(): SessionEngine | null {
    const provider = this.getActiveProvider();
    return provider ? this.engines.get(provider) ?? null : null;
  }

  /** Return the active provider runtime, or null. */
  getActiveRuntime(): ProviderRuntime | null {
    const provider = this.getActiveProvider();
    return provider ? this.getRuntime(provider) : null;
  }

  /** Get a provider's full runtime (provider + playback), or null. */
  getRuntime(provider: MusicProviderName): ProviderRuntime | null {
    if (provider === 'spotify') {
      return this.spotifyRuntime;
    }
    if (provider === 'apple') {
      return this.appleRuntime ?? null;
    }
    return this.youtubeRuntime ?? null;
  }

  /**
   * Resolve a provider's read-only MusicProvider (works even without local
   * playback on the current host).
   */
  getReadProvider(provider: MusicProviderName): MusicProvider {
    if (provider === 'spotify') {
      return this.spotifyRuntime.provider;
    }

    if (provider === 'apple') {
      return this.appleRuntime?.provider ?? createHistoryBackedProvider({
        baseProvider: createAppleMusicProvider(this.getAppleMusicClient()),
        provider: 'apple',
        recentPlaysMode: 'delegate-or-local',
        store: this.store,
      });
    }

    return this.youtubeRuntime?.provider ?? createHistoryBackedProvider({
      baseProvider: createYouTubeMusicProvider(this.getYouTubeMusicClient()),
      provider: 'youtube',
      recentPlaysMode: 'local',
      store: this.store,
    });
  }

  /** Get a provider's runtime, throwing ProviderUnavailableError if missing. */
  getPlaybackRuntime(provider: MusicProviderName): ProviderRuntime {
    const runtime = this.getRuntime(provider);
    if (!runtime) {
      throw new ProviderUnavailableError(
        getProviderPlaybackUnavailableMessage(provider as Extract<MusicProviderName, 'apple' | 'youtube'>, this),
      );
    }
    return runtime;
  }

  /** Get the Apple Music client, throwing ConfigurationError if not configured. */
  getAppleMusicClient(): AppleMusicClient {
    if (!this.appleMusicClient) {
      throw new ConfigurationError('Apple Music not configured (set APPLE_MUSIC_DEVELOPER_TOKEN).');
    }
    return this.appleMusicClient;
  }

  /** Get the YouTube Music client, throwing ConfigurationError if not configured. */
  getYouTubeMusicClient(): YouTubeMusicClient {
    if (!this.youtubeMusicClient) {
      throw new ConfigurationError(
        'YouTube Music not configured (set YOUTUBE_MUSIC_API_KEY, YT_API_KEY, or YOUTUBE_MUSIC_ACCESS_TOKEN).',
      );
    }
    return this.youtubeMusicClient;
  }

  /** Get the Apple remote bridge, throwing ProviderUnavailableError if not configured. */
  getAppleRemoteBridge(): AppleRemoteBridge {
    if (!this.appleRemoteBridge) {
      throw new ProviderUnavailableError('Apple Music remote playback is not configured on this daemon instance.');
    }
    return this.appleRemoteBridge;
  }

  /** Create a fresh Apple Music MusicProvider for catalog-only operations. */
  createAppleMusicProviderFallback(): MusicProvider {
    return createAppleMusicProvider(this.getAppleMusicClient());
  }

  // -- Provider Pre-flight & Status --------------------------------------------
  /** Pre-flight check that a provider is ready for an operation. */
  async assertProviderReady(
    provider: MusicProviderName,
    operation: string,
    policy?: SessionPolicy,
  ): Promise<void> {
    return _assertProviderReady(provider, operation, this, policy);
  }

  /** Probe Spotify provider status (async — may refresh tokens). */
  async getSpotifyProviderStatus(): Promise<ProviderStatusDetails> {
    return _getSpotifyProviderStatus(this);
  }

  /** Get Apple Music provider status (sync). */
  getAppleProviderStatus(): ProviderStatusDetails {
    return _getAppleProviderStatus(this);
  }

  /** Get YouTube Music provider status (sync). */
  getYouTubeProviderStatus(): ProviderStatusDetails {
    return _getYouTubeProviderStatus(this);
  }

  // -- Session Lifecycle (start, stop, nudge, skip) ---------------------------
  /** Start a new session with the given policy. */
  async startSession(policy: SessionPolicy): Promise<{ success: boolean; sessionId: string }> {
    if (this.sessionStartInFlight) {
      throw new ValidationError('Session start already in progress.');
    }
    if (this.getActiveEngine()) {
      throw new ValidationError('Session already active. Stop current session first.');
    }

    this.sessionStartInFlight = true;
    try {
      const normalizedPolicy = normalizeSessionPolicy(policy, this);
      const provider = normalizedPolicy.provider ?? 'spotify';
      const engine = this.engines.get(provider);
      const runtime = this.getRuntime(provider);
      if (!engine || !runtime) {
        throw new ProviderUnavailableError(
          this.getProviderPlaybackUnavailableMessage(provider as Extract<MusicProviderName, 'apple' | 'youtube'>),
        );
      }

      validateSessionPolicyForProvider(normalizedPolicy, this);
      await this.assertProviderReady(provider, 'starting a session', normalizedPolicy);
      await this.resetRuntimeState(provider);
      await engine.start(normalizedPolicy);

      const state = engine.getState();
      if (!state || state.queuedTracks.length === 0) {
        await this.rollbackFailedSessionStart(engine, provider);
        throw new ProviderUnavailableError(
          `No tracks were queued for ${provider}. Possible causes: provider not authenticated, policy too restrictive, or all sources returned empty. Check 'harmon auth status' and review your session policy.`,
        );
      }

      const sessionId = state?.id || 'unknown';

      try {
        if (runtime.autoStartSession) {
          await runtime.playback.play();
        }
      } catch (error) {
        await this.rollbackFailedSessionStart(engine, provider);
        throw error;
      }

      this.activeProvider = provider;
      this.startTrackPolling();
      return { success: true, sessionId };
    } finally {
      this.sessionStartInFlight = false;
    }
  }

  /**
   * Unwind a failed session start and surface rollback failures instead of
   * hiding them behind the original startup error.
   */
  private async rollbackFailedSessionStart(engine: SessionEngine, provider: MusicProviderName): Promise<void> {
    const rollbackErrors: unknown[] = [];

    try {
      await engine.stop();
    } catch (error) {
      rollbackErrors.push(error);
    }

    try {
      await this.resetRuntimeState(provider);
    } catch (error) {
      rollbackErrors.push(error);
    }

    this.activeProvider = null;
    this.stopTrackPolling();

    if (rollbackErrors.length > 0) {
      throw rollbackErrors[0];
    }
  }

  /** Stop the active session. */
  async stopSession(): Promise<{ success: boolean }> {
    const provider = this.getActiveProvider();
    const runtime = provider ? this.getRuntime(provider) : null;
    const engine = this.getActiveEngine();
    const state = engine?.getState();
    if (!state || !engine) throw new SessionNotFoundError();

    await engine.stop();
    if (provider && runtime) {
      await runtime.playback.resetSessionState();
    }
    this.stopTrackPolling();
    this.activeProvider = null;

    return { success: true };
  }

  /** Nudge the active session calmer or sharper. */
  async nudgeSession(
    direction: 'calmer' | 'sharper',
    amount?: number
  ): Promise<{ success: boolean; newWeights?: Record<string, number | undefined> }> {
    const provider = this.getActiveProvider();
    const runtime = this.getActiveRuntime();
    const engine = this.getActiveEngine();
    const state = engine?.getState();
    if (!state || !engine || !provider || !runtime) throw new SessionNotFoundError();

    const previousQueue = [...state.queuedTracks];
    await this.assertProviderReady(provider, 'nudging a session', state.policy);
    await runtime.playback.resetSessionState({
      preserveCurrentTrack: true,
      preserveHistory: true,
    });
    try {
      await engine.nudge(direction, amount);
    } catch (error) {
      for (const track of previousQueue) {
        if (track.uri) {
          await runtime.playback.addToQueue(track.uri, track);
        }
      }
      throw error;
    }

    this.broadcastEvent('session.nudged', {
      sessionId: state.id,
      direction,
      amount: amount || 0.1,
    });

    return { success: true, newWeights: engine.getState()?.policy.soft?.weights };
  }

  /** Skip the current track. */
  async skipTrack(reason?: string): Promise<{ success: boolean }> {
    const provider = this.getActiveProvider();
    const runtime = this.getActiveRuntime();
    const engine = this.getActiveEngine();
    const state = engine?.getState();
    if (!state || !engine || !provider || !runtime) throw new SessionNotFoundError();

    await this.assertProviderReady(provider, 'skipping a track');
    await runtime.playback.next();
    this.broadcastEvent('track.skipped', { sessionId: state.id, reason });

    return { success: true };
  }

  // -- Track Change Polling (feeds engine.recordPlay()) ----------------------
  /** Start track-change polling (called after session start). */
  startTrackPolling(): void {
    if (this.trackPollInterval) return;
    this.trackPollInterval = setInterval(async () => {
      if (this.isPolling) return;
      this.isPolling = true;
      try {
        const playback = this.getActiveRuntime()?.playback;
        if (!playback) return;
        const track = await playback.getNowPlaying();
        if (track && track.id !== this.lastTrackId) {
          this.lastTrackId = track.id;
          await this.getActiveEngine()?.recordPlay(track);
          this.broadcastEvent('track.started', { track });
        }
      } catch { /* polling failure is non-fatal */ }
      finally {
        this.isPolling = false;
      }
    }, TRACK_POLL_INTERVAL_MS);
  }

  /** Stop track-change polling (called after session stop). */
  stopTrackPolling(): void {
    if (this.trackPollInterval) {
      clearInterval(this.trackPollInterval);
      this.trackPollInterval = null;
    }
    this.lastTrackId = null;
    this.isPolling = false;
  }

  // -- Daemon Status -----------------------------------------------------------
  /** Get full daemon status. */
  async getStatus(): Promise<DaemonStatus> {
    const engineState = this.getActiveEngine()?.getState() ?? null;
    const activeProvider = this.getActiveProvider();
    const spotify = await this.getSpotifyProviderStatus();
    const apple = this.getAppleProviderStatus();
    const youtube = this.getYouTubeProviderStatus();
    const providers = {
      spotify,
      apple,
      youtube,
    } as DaemonStatus['providers'];

    return {
      isRunning: this.server !== null,
      version: DAEMON_VERSION,
      spotifyConnected: spotify.connected,
      features: {
        sse: this.enableSSE,
      },
      providers,
      session: engineState
        ? {
            id: engineState.id,
            isActive: engineState.status === 'running',
            provider: activeProvider ?? undefined,
            currentTrack: engineState.currentTrack || null,
            queueDepth: engineState.queuedTracks.length,
            policy: engineState.policy,
            elapsedMs: Date.now() - engineState.startedAt,
            startedAt: engineState.startedAt,
          }
        : undefined,
    } as DaemonStatus;
  }

  // -- Error Handling (delegates to error-classification module) --------------
  /** Normalize a route handler error into an HTTP response. */
  handleRouteError(res: Response, error: unknown, asText = false): void {
    _handleRouteError(res, error, asText);
  }

  // -- Server Lifecycle -------------------------------------------------------
  async start(): Promise<void> {
    // Run migrations (WAL mode + tables)
    await this.store.migrate();

    // Enable WAL mode for concurrent read/write
    try {
      await (this.store as any).client?.execute('PRAGMA journal_mode=WAL');
    } catch { /* WAL not supported in memory mode */ }

    await this.spotifyAuth.loadTokens();
    await this.youtubeAuth?.loadTokens();
    await this.appleAuth?.loadTokens();

    // Start SSE heartbeat
    this.setupSSE();

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, this.host, () => {
        this.logger.info({ port: this.port, host: this.host }, 'Harmond listening');
        resolve();
      });
      this.server.on('connection', (socket: Socket) => {
        this.trackServerSocket(socket);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.logger.error({ port: this.port }, 'Port already in use — is another harmond running?');
        }
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    this.logger.info('Shutting down...');
    let shutdownError: unknown = null;

    // Stop track polling
    this.stopTrackPolling();

    // Stop engine (clears refill interval)
    for (const [provider, engine] of this.engines.entries()) {
      try {
        await engine.stop();
        if (this.activeProvider === provider) {
          this.activeProvider = null;
        }
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'No active session') {
          shutdownError = error;
        }
      }
    }

    // Close SSE clients
    for (const client of this.sseClients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.sseClients.clear();
    if (this.sseHeartbeat) {
      clearInterval(this.sseHeartbeat);
      this.sseHeartbeat = null;
    }

    // Stop server with timeout
    if (this.server) {
      try {
        await this.closeServer();
      } catch (error) {
        shutdownError ??= error;
      }
    }

    // Close store
    try {
      await this.store.close();
    } catch (error) {
      shutdownError ??= error;
    }

    // Destroy encryptor (zero sensitive state)
    this.encryptor?.destroy();

    if (shutdownError) {
      throw shutdownError;
    }
  }


  // -- Session Policy Helpers --------------------------------------------------
  /**
   * Clear daemon-owned playback state between sessions so queue and history do
   * not leak across session boundaries or nudges.
   */
  private async resetRuntimeState(
    provider: MusicProviderName,
    options?: { preserveCurrentTrack?: boolean; preserveHistory?: boolean },
  ): Promise<void> {
    const runtime = this.getRuntime(provider);
    if (!runtime) {
      return;
    }
    await runtime.playback.resetSessionState(options);
  }

  /** Validate imported Spotify cookies against the Spotify API before persisting. */
  async validateImportedSpotifyCookies(cookies: SpotifyCookieRecord[]): Promise<void> {
    return _validateImportedSpotifyCookies(cookies, this);
  }

  /**
   * Keep playback-unavailable errors explicit about the missing local runtime.
   * Also used by session-policy module via the SessionProbeDeps interface.
   */
  getProviderPlaybackUnavailableMessage(
    provider: Extract<MusicProviderName, 'apple' | 'youtube'>,
  ): string {
    return getProviderPlaybackUnavailableMessage(provider, this);
  }

  // -- Public Accessors (used by tests) ----------------------------------------
  getStore(): HarmonStore {
    return this.store;
  }

  // -- Socket & Server Helpers ------------------------------------------------
  /**
   * Track live sockets so shutdown can destroy keep-alive connections if the
   * HTTP server does not drain on its own before the timeout.
   */
  private trackServerSocket(socket: Socket): void {
    this.openSockets.add(socket);
    socket.on('close', () => {
      this.openSockets.delete(socket);
    });
  }

  /**
   * Close the HTTP server and destroy lingering sockets if it misses the
   * graceful shutdown deadline.
   */
  private async closeServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;

    const closePromise = new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const timedOut = await Promise.race([
      closePromise.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), SHUTDOWN_TIMEOUT_MS)),
    ]);

    if (timedOut) {
      this.logger.warn('Shutdown timeout — destroying remaining sockets');
      for (const socket of this.openSockets) {
        try {
          socket.destroy();
        } catch {
          // I ignore destroy failures because the shutdown deadline already elapsed.
        }
      }
    }

    await closePromise;
    this.openSockets.clear();
  }
}

export function createDaemon(config?: DaemonConfig): Harmond {
  return new Harmond(config);
}
