/**
 * Harmond - The Harmon daemon with HTTP+SSE API
 *
 * Hardened: engine wired, payload validation, AppleScript injection fixed,
 * WAL mode, shutdown timeout, SSE cap, body limits, signal handling.
 */

import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HarmonStore } from '@sriinnu/harmon-store';
import { createEngine, type MusicProvider, type SessionEngine, type EngineEvent } from '@sriinnu/harmon-core';
import { createLogger, type Logger } from '@sriinnu/harmon-logger';
import { createEncryptor, type Encryptor } from '@sriinnu/harmon-crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import {
  parseCommandSafe,
  MusicProviderName,
  SessionStartCommand,
  SessionNudgeCommand,
  SessionPolicy,
  TrackInfo as TrackInfoSchema,
  type Command,
  type Event,
  type DaemonStatus,
  type DeviceInfo,
  type TrackInfo,
} from '@sriinnu/harmon-protocol';
import {
  createSpotifyAuth,
  createSpotifyClient,
  createSpotifyProvider,
  createSpotifyPlayback,
  type SpotifyAuth,
  type SpotifyClient,
  type SpotifyTokens,
  type TokenStore,
  type CookieStore,
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
  ApiError,
  ConfigurationError,
  ProviderUnavailableError,
  SessionNotFoundError,
  UnsupportedPlatformError,
  UpstreamServiceError,
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

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_PORT = 17373;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DB_PATH = '.harmon.db';
const DEFAULT_DEV_CORS_ORIGINS = ['http://127.0.0.1:4173', 'http://localhost:4173'];
const SSE_HEARTBEAT_MS = 30000;
const MAX_SSE_CLIENTS = 50;
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

interface JournalEntryInput {
  content: string;
  context?: Record<string, unknown>;
  device: string;
  energyLevel?: string;
  moodTags: string[];
  policy?: SessionPolicy;
  sessionId?: string;
  source: string;
}

interface ProviderStatusDetails {
  connected: boolean;
  name?: string;
  status?: 'missing' | 'configured' | 'ready' | 'degraded';
  auth?: 'none' | 'oauth' | 'cookies' | 'api-key' | 'developer-token' | 'developer-and-user-token';
  playbackMode?: 'native' | 'applescript' | 'browser-handoff' | 'remote';
  capabilities?: Record<string, boolean>;
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

// ============================================================================
// Harmond Implementation
// ============================================================================

export class Harmond {
  private app: express.Application;
  private logger: Logger;
  private requestLogger: Logger;
  private store: HarmonStore;
  private spotifyAuth: SpotifyAuth;
  private spotifyClient: SpotifyClient;
  private spotifyRuntime: ProviderRuntime;
  private appleRuntime?: ProviderRuntime;
  private youtubeRuntime?: ProviderRuntime;
  private appleMusicClient?: AppleMusicClient;
  private youtubeMusicClient?: YouTubeMusicClient;
  private engines = new Map<MusicProviderName, SessionEngine>();
  private activeProvider: MusicProviderName | null = null;
  private encryptor?: Encryptor;
  private port: number;
  private host: string;
  private apiToken?: string;
  private spotifyRedirectUri: string;
  private corsOrigins: Set<string>;
  private allowAllOrigins = false;
  private enableSSE: boolean;
  private appleCatalogEnabled = false;
  private appleLibraryEnabled = false;
  private appleLocalPlaybackEnabled = process.platform === 'darwin';
  private appleRemoteBridge?: AppleRemoteBridge;
  private appleRemoteToken?: string;
  private openSockets: Set<Socket> = new Set();
  private sseClients: Set<Response> = new Set();
  private server: ReturnType<express.Application['listen']> | null = null;
  private sseHeartbeat: ReturnType<typeof setInterval> | null = null;
  private trackPollInterval: ReturnType<typeof setInterval> | null = null;
  private lastTrackId: string | null = null;
  private spotifyTokenLoadFailure = false;
  private spotifyCookieLoadFailure = false;
  private youtubeBrowserSupport: BrowserLaunchSupport;
  private youtubeAccessToken?: string;
  private youtubeApiKey?: string;

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

    const tokenStore = this.createSpotifyTokenStore();
    const cookieStore = this.createSpotifyCookieStore();
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

    const appleDeveloperToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    const appleUserToken = process.env.APPLE_MUSIC_USER_TOKEN;
    this.appleRemoteToken = process.env.APPLE_MUSIC_REMOTE_TOKEN;
    const appleRemotePlaybackEnabled =
      typeof this.appleRemoteToken === 'string' &&
      this.appleRemoteToken.length > 0;
    if (appleRemotePlaybackEnabled) {
      this.appleRemoteBridge = createAppleRemoteBridge();
    }
    if (appleDeveloperToken) {
      this.appleCatalogEnabled = true;
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

    this.logger.info({ port: this.port, host: this.host }, 'Daemon initializing');

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * I register one playback-capable provider runtime and bind a dedicated
   * session engine to it.
   */
  private registerRuntime(runtime: ProviderRuntime): void {
    this.engines.set(runtime.name, createEngine({
      provider: runtime.provider,
      playback: runtime.playback,
      store: this.store,
      onEvent: this.handleEngineEvent.bind(this),
    }));
  }

  private handleEngineEvent(event: EngineEvent): void {
    const provider = this.getActiveProvider();
    this.broadcastEvent(event.type, provider ? { provider, ...event.payload } : event.payload);
  }

  private setupMiddleware(): void {
    // Explicit body size limit
    this.app.use(express.json({ limit: '100kb' }));

    // Request ID + logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      const requestId = uuidv4();
      res.setHeader('X-Request-Id', requestId);

      res.on('finish', () => {
        if (process.env.NODE_ENV === 'test') {
          return;
        }
        this.requestLogger.info({
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: Date.now() - start,
        }, 'HTTP request');
      });

      next();
    });

    // Security headers
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cache-Control', 'no-store');
      next();
    });

    // Rate limiting — more generous for a music daemon
    const globalLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 120,            // 120/min = 2/sec average
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: 'Too many requests' },
      skip: (req) => req.path === '/health' || req.path === '/v1/events',
    });

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { success: false, error: 'Too many authentication attempts' },
      // I keep the OAuth callback outside the auth attempt budget so a
      // valid browser redirect is not stranded behind earlier retries.
      skip: (req) => req.path === '/spotify/callback',
    });

    const commandLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      message: { success: false, error: 'Command rate limit exceeded' },
    });

    this.app.use(globalLimiter);
    this.app.use('/v1/auth', authLimiter);
    this.app.use('/v1/command', commandLimiter);

    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.header('origin');
      if (!origin) { next(); return; }

      if (!this.isOriginAllowed(origin)) {
        res.status(403).json({ success: false, error: 'Origin not allowed' });
        return;
      }

      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Max-Age', '86400');

      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
      next();
    });
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return false;
    if (this.allowAllOrigins) {
      if (process.env.NODE_ENV === 'production') return false;
      return true;
    }
    return this.corsOrigins.has(origin);
  }

  private setupRoutes(): void {
    this.app.use('/v1', this.requireAuth.bind(this));

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', version: DAEMON_VERSION, timestamp: new Date().toISOString() });
    });

    // Status
    this.app.get('/v1/status', async (_req: Request, res: Response) => {
      try {
        res.json(await this.getStatus());
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Devices
    this.app.get('/v1/devices', async (_req: Request, res: Response) => {
      try {
        res.json(await this.spotifyClient.getDevices());
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Command endpoint — with per-type payload validation
    this.app.post('/v1/command', async (req: Request, res: Response) => {
      try {
        const parsed = parseCommandSafe(req.body);
        if (!parsed.success) {
          res.status(400).json({ success: false, error: 'Invalid command', issues: parsed.error.issues });
          return;
        }
        const result = await this.handleCommand(parsed.data);
        res.json(result);
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Device use
    this.app.post('/v1/device/use', async (req: Request, res: Response) => {
      try {
        const { deviceId } = req.body;
        if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
          res.status(400).json({ success: false, error: 'Invalid deviceId' });
          return;
        }
        await this.spotifyClient.transferTo(deviceId);
        this.broadcastEvent('device.changed', { deviceId });
        res.json({ success: true });
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Auth
    this.app.post('/v1/auth/spotify/login', (_req: Request, res: Response) => {
      try {
        res.json({ url: this.spotifyAuth.getLoginUrl() });
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    this.app.get('/v1/auth/spotify/callback', async (req: Request, res: Response) => {
      try {
        const code = req.query.code as string | undefined;
        const state = req.query.state as string | undefined;
        if (!code) { res.status(400).send('Missing code.'); return; }
        await this.spotifyAuth.handleCallback(code, state);
        this.broadcastEvent('spotify.connected', {});
        res.status(200).send('Spotify connected. You can close this window.');
      } catch (error) {
        this.handleRouteError(res, error, true);
      }
    });

    this.app.post('/v1/auth/spotify/logout', async (_req: Request, res: Response) => {
      try {
        await this.spotifyAuth.logout();
        this.broadcastEvent('spotify.disconnected', {});
        res.json({ success: true });
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Cookie import — with schema validation
    this.app.post('/v1/auth/spotify/import', async (req: Request, res: Response) => {
      try {
        const cookies = req.body?.cookies;
        if (!Array.isArray(cookies) || cookies.length === 0) {
          res.status(400).json({ success: false, error: 'Missing cookies array' });
          return;
        }
        const validated = this.sanitizeImportedSpotifyCookies(cookies);
        if (validated.length === 0) {
          res.status(400).json({
            success: false,
            error: 'No supported Spotify auth cookies found. Import sp_dc and/or sp_key from spotify.com.',
          });
          return;
        }
        await this.validateImportedSpotifyCookies(validated);
        await this.spotifyAuth.setCookies(validated);
        res.json({ success: true, cookiesImported: validated.length });
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Journal — with bounds
    this.app.get('/v1/journal', async (req: Request, res: Response) => {
      try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit as string, 10) || 50, 1), 500);
        res.json(await this.store.getJournalEntries(limit));
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    this.app.post('/v1/journal', async (req: Request, res: Response) => {
      try {
        const entry = this.parseJournalEntry(req.body);
        const id = await this.store.addJournalEntry({
          filename: `api-${uuidv4()}.md`,
          timestamp: new Date().toISOString(),
          source: entry.source,
          device: entry.device,
          sessionId: entry.sessionId,
          moodTags: entry.moodTags.join(', '),
          energyLevel: entry.energyLevel,
          context: this.serializeJournalField(entry.context, 'context', 2000),
          content: entry.content,
          policy: this.serializeJournalField(entry.policy, 'policy', 5000),
        });
        res.json({ id, success: true });
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // SSE events
    this.app.get('/v1/events', (req: Request, res: Response) => {
      try {
        if (this.sseClients.size >= MAX_SSE_CLIENTS) {
          res.status(503).json({ success: false, error: 'Too many SSE connections' });
          return;
        }
        this.setupSSEClient(req, res);
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Stats
    this.app.get('/v1/stats', async (_req: Request, res: Response) => {
      try {
        res.json(await this.store.getStats());
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Spotify search
    this.app.get('/v1/spotify/search', async (req: Request, res: Response) => {
      try {
        const query = req.query.q;
        if (typeof query !== 'string' || query.trim().length === 0) {
          res.status(400).json({ success: false, error: 'Missing query (q)' });
          return;
        }
        const typeParam = typeof req.query.type === 'string' ? req.query.type : 'track';
        const types = this.parseSearchTypes(typeParam);
        const limit = this.clampNumber(req.query.limit, 1, 50);
        const offset = this.clampNumber(req.query.offset, 0, 10000);
        const result = await this.spotifyClient.search(query, types, { limit, offset });
        res.json(result);
      } catch (error) {
        this.handleRouteError(res, error);
      }
    });

    // Spotify playback
    this.app.get('/v1/spotify/now-playing', async (_req: Request, res: Response) => {
      try { res.json(await this.spotifyClient.getNowPlaying()); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/play', async (req: Request, res: Response) => {
      try {
        const uri = this.parseBodyString(req.body?.uri);
        const contextUri = this.parseBodyString(req.body?.contextUri);
        await this.spotifyClient.play({ uri, contextUri });
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/pause', async (_req, res) => {
      try { await this.spotifyClient.pause(); res.json({ success: true }); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/next', async (_req, res) => {
      try { await this.spotifyClient.next(); res.json({ success: true }); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/prev', async (_req, res) => {
      try { await this.spotifyClient.previous(); res.json({ success: true }); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/seek', async (req, res) => {
      try {
        const positionMs = this.parseBodyNumber(req.body?.positionMs);
        if (positionMs === undefined || positionMs < 0) { res.status(400).json({ success: false, error: 'Invalid positionMs' }); return; }
        await this.spotifyClient.seek(positionMs);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/volume', async (req, res) => {
      try {
        const vol = this.parseBodyNumber(req.body?.volumePercent);
        if (vol === undefined || vol < 0 || vol > 100) { res.status(400).json({ success: false, error: 'Invalid volumePercent: must be 0-100' }); return; }
        await this.spotifyClient.setVolume(vol);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/shuffle', async (req, res) => {
      try {
        const state = this.parseBodyBoolean(req.body?.state);
        if (state === undefined) { res.status(400).json({ success: false, error: 'Invalid state' }); return; }
        await this.spotifyClient.setShuffle(state);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/repeat', async (req, res) => {
      try {
        const state = this.parseBodyString(req.body?.state);
        if (state !== 'off' && state !== 'track' && state !== 'context') { res.status(400).json({ success: false, error: 'Invalid state: must be off|track|context' }); return; }
        await this.spotifyClient.setRepeat(state);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/spotify/queue', async (req, res) => {
      try {
        const uri = this.parseBodyString(req.body?.uri);
        if (!uri) { res.status(400).json({ success: false, error: 'Missing uri' }); return; }
        await this.spotifyClient.addToQueue(uri);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    // Spotify library/playlists
    this.app.get('/v1/spotify/playlists', async (req, res) => {
      try { res.json(await this.spotifyClient.getPlaylists({ limit: this.clampNumber(req.query.limit, 1, 50), offset: this.clampNumber(req.query.offset, 0, 10000) })); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/spotify/playlists/:id/tracks', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid playlist id' }); return; }
        res.json(await this.spotifyClient.getPlaylistTracks(id, { limit: this.clampNumber(req.query.limit, 1, 100), offset: this.clampNumber(req.query.offset, 0, 10000) }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/spotify/history', async (req, res) => {
      try {
        const limit = this.clampNumber(req.query.limit, 1, 50);
        res.json(await this.spotifyClient.getRecentlyPlayed({ limit }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/spotify/library/tracks', async (req, res) => {
      try { res.json(await this.spotifyClient.getSavedTracks({ limit: this.clampNumber(req.query.limit, 1, 50), offset: this.clampNumber(req.query.offset, 0, 10000) })); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/spotify/library/albums', async (req, res) => {
      try { res.json(await this.spotifyClient.getSavedAlbums({ limit: this.clampNumber(req.query.limit, 1, 50), offset: this.clampNumber(req.query.offset, 0, 10000) })); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/spotify/recommendations', async (req, res) => {
      try {
        const seedTrackIds = await this.resolveSpotifyRecommendationSeeds(
          typeof req.query.seed === 'string' ? req.query.seed : undefined,
        );
        res.json(await this.spotifyRuntime.provider.getRecommendations({
          seedTrackIds,
          limit: this.clampNumber(req.query.limit, 1, 50),
        }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    // Apple Music
    this.app.get('/v1/apple/search', async (req, res) => {
      try {
        const client = this.getAppleMusicClient();
        const query = req.query.q;
        if (typeof query !== 'string' || !query.trim()) { res.status(400).json({ success: false, error: 'Missing query (q)' }); return; }
        const types = this.parseAppleSearchTypes(typeof req.query.type === 'string' ? req.query.type : 'songs');
        res.json(await client.search(query, types, {
          limit: this.clampNumber(req.query.limit, 1, 25),
          offset: this.clampNumber(req.query.offset, 0, 10000),
        }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/songs/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getSong(id));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/albums/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getAlbum(id));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/artists/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getArtist(id));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/playlists/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getPlaylist(id));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/playlists/:id/tracks', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getPlaylistTracks(id, { limit: this.clampNumber(req.query.limit, 1, 100) }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/library/songs', async (req, res) => {
      try { res.json(await this.getAppleMusicClient().getLibrarySongs({ limit: this.clampNumber(req.query.limit, 1, 100) })); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/library/albums', async (req, res) => {
      try { res.json(await this.getAppleMusicClient().getLibraryAlbums({ limit: this.clampNumber(req.query.limit, 1, 100) })); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/library/playlists', async (req, res) => {
      try { res.json(await this.getAppleMusicClient().getLibraryPlaylists({ limit: this.clampNumber(req.query.limit, 1, 100) })); }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/history', async (req, res) => {
      try {
        res.json(await this.getReadProvider('apple').getRecentlyPlayed({ limit: this.clampNumber(req.query.limit, 1, 100) }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/recommendations', async (req, res) => {
      try {
        if (!this.appleCatalogEnabled) {
          throw new ProviderUnavailableError('Apple Music is not configured on this daemon instance.');
        }
        const provider = this.appleRuntime?.provider ?? createAppleMusicProvider(this.getAppleMusicClient());
        const seedTrackIds = typeof req.query.seed === 'string'
          ? req.query.seed.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
          : [];
        if (seedTrackIds.length === 0 && !this.appleLibraryEnabled) {
          throw new ProviderUnavailableError(
            'Apple Music recommendations without an explicit seed require APPLE_MUSIC_USER_TOKEN.',
          );
        }
        res.json(await provider.getRecommendations({
          seedTrackIds,
          limit: this.clampNumber(req.query.limit, 1, 50),
        }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/now-playing', async (_req, res) => {
      try {
        const playback = this.getPlaybackRuntime('apple').playback;
        res.json(await playback.getNowPlaying());
      } catch (error) { this.handleRouteError(res, error); }
    });

    // Apple Music playback
    this.app.post('/v1/apple/play', async (req, res) => {
      try {
        const url = this.parseBodyString(req.body?.url);
        await this.assertProviderReady('apple', 'starting Apple Music playback');
        const playback = this.getPlaybackRuntime('apple').playback;
        await playback.play(url ? { uri: url } : undefined);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/apple/pause', async (_req, res) => {
      try {
        await this.assertProviderReady('apple', 'pausing Apple Music playback');
        await this.getPlaybackRuntime('apple').playback.pause();
        res.json({ success: true });
      }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/apple/next', async (_req, res) => {
      try {
        await this.assertProviderReady('apple', 'skipping Apple Music playback');
        await this.getPlaybackRuntime('apple').playback.next();
        res.json({ success: true });
      }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/apple/prev', async (_req, res) => {
      try {
        await this.assertProviderReady('apple', 'rewinding Apple Music playback');
        await this.getPlaybackRuntime('apple').playback.previous();
        res.json({ success: true });
      }
      catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/remote/status', async (_req, res) => {
      try {
        res.json(this.getAppleRemoteBridge().getStatus());
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/apple/remote/connect', async (req, res) => {
      try {
        const deviceId = this.parseBodyString(req.body?.deviceId);
        if (!deviceId) {
          res.status(400).json({ success: false, error: 'Missing deviceId' });
          return;
        }
        res.json({
          success: true,
          status: this.getAppleRemoteBridge().registerCompanion({
            appVersion: this.parseBodyString(req.body?.appVersion),
            deviceId,
            name: this.parseBodyString(req.body?.name),
            platform: this.parseBodyString(req.body?.platform),
          }),
        });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/apple/remote/commands', async (req, res) => {
      try {
        const deviceId = this.parseBodyString(req.query.deviceId);
        if (!deviceId) {
          res.status(400).json({ success: false, error: 'Missing deviceId' });
          return;
        }
        res.json({
          commands: this.getAppleRemoteBridge().listCommands(deviceId),
          success: true,
        });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/apple/remote/commands/:id/ack', async (req, res) => {
      try {
        const deviceId = this.parseBodyString(req.body?.deviceId);
        if (!deviceId) {
          res.status(400).json({ success: false, error: 'Missing deviceId' });
          return;
        }
        this.getAppleRemoteBridge().acknowledgeCommand(deviceId, req.params.id);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/apple/remote/state', async (req, res) => {
      try {
        const deviceId = this.parseBodyString(req.body?.deviceId);
        if (!deviceId) {
          res.status(400).json({ success: false, error: 'Missing deviceId' });
          return;
        }
        const playbackState = this.parseAppleRemotePlaybackState(req.body?.playbackState);
        const currentTrackResult =
          req.body?.currentTrack === undefined
            ? { success: true as const, data: undefined }
            : req.body?.currentTrack === null
              ? { success: true as const, data: null }
              : TrackInfoSchema.safeParse(req.body.currentTrack);
        if (!currentTrackResult.success) {
          res.status(400).json({ success: false, error: 'Invalid currentTrack', issues: currentTrackResult.error.issues });
          return;
        }
        if (currentTrackResult.data && currentTrackResult.data.provider && currentTrackResult.data.provider !== 'apple') {
          res.status(400).json({ success: false, error: 'Apple remote currentTrack must use provider apple' });
          return;
        }
        res.json({
          success: true,
          status: this.getAppleRemoteBridge().updateState({
            ackCommandId: this.parseBodyString(req.body?.ackCommandId),
            currentTrack:
              currentTrackResult.data && currentTrackResult.data !== null
                ? {
                    ...currentTrackResult.data,
                    playbackTruth: undefined,
                    provider: 'apple',
                  }
                : currentTrackResult.data,
            deviceId,
            playbackState,
          }),
        });
      } catch (error) { this.handleRouteError(res, error); }
    });

    // YouTube Music
    this.app.get('/v1/youtube/search', async (req, res) => {
      try {
        const client = this.getYouTubeMusicClient();
        const query = req.query.q;
        if (typeof query !== 'string' || !query.trim()) { res.status(400).json({ success: false, error: 'Missing query (q)' }); return; }
        const type = typeof req.query.type === 'string' ? req.query.type : 'songs';
        const types = this.parseYouTubeSearchTypes(type);
        res.json(await client.search(query, types, { limit: this.clampNumber(req.query.limit, 1, 25) }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/youtube/songs/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getYouTubeMusicClient().getSong(id));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/youtube/playlists/:id/tracks', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getYouTubeMusicClient().getPlaylistTracks(id, { limit: this.clampNumber(req.query.limit, 1, 100) }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/youtube/playlists', async (req, res) => {
      try {
        res.json(await this.getYouTubeMusicClient().getPlaylists({ limit: this.clampNumber(req.query.limit, 1, 50) }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/youtube/library/tracks', async (req, res) => {
      try {
        res.json(await this.getYouTubeMusicClient().getLibrarySongs({ limit: this.clampNumber(req.query.limit, 1, 100) }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/youtube/recommendations', async (req, res) => {
      try {
        const provider = this.getReadProvider('youtube');
        const seedTrackIds = typeof req.query.seed === 'string'
          ? req.query.seed.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
          : [];
        res.json(await provider.getRecommendations({
          seedTrackIds,
          limit: this.clampNumber(req.query.limit, 1, 50),
        }));
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.get('/v1/youtube/now-playing', async (_req, res) => {
      try {
        const playback = this.getPlaybackRuntime('youtube').playback;
        res.json(await playback.getNowPlaying());
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/youtube/play', async (req, res) => {
      try {
        const uri = this.parseBodyString(req.body?.uri);
        const playback = this.getPlaybackRuntime('youtube').playback;
        await playback.play(uri ? { uri } : undefined);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/youtube/pause', async (_req, res) => {
      try {
        await this.getPlaybackRuntime('youtube').playback.pause();
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/youtube/next', async (_req, res) => {
      try {
        await this.getPlaybackRuntime('youtube').playback.next();
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/youtube/prev', async (_req, res) => {
      try {
        await this.getPlaybackRuntime('youtube').playback.previous();
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    this.app.post('/v1/youtube/queue', async (req, res) => {
      try {
        const uri = this.parseBodyString(req.body?.uri);
        if (!uri) { res.status(400).json({ success: false, error: 'Missing uri' }); return; }
        await this.getPlaybackRuntime('youtube').playback.addToQueue(uri);
        res.json({ success: true });
      } catch (error) { this.handleRouteError(res, error); }
    });

    // Error handler
    this.app.use(errorHandler(this.logger));
  }

  // ============================================================================
  // SSE
  // ============================================================================

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

  private setupSSEClient(req: Request, res: Response): void {
    if (!this.enableSSE) {
      throw new ApiError(404, 'SSE is disabled for this daemon instance.', 'SSE_DISABLED');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(this.createEvent('connected', {}))}\n\n`);
    this.sseClients.add(res);
    req.on('close', () => { this.sseClients.delete(res); });
  }

  private broadcastEvent(type: string, payload: Record<string, unknown> = {}): void {
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

  private createEvent(type: string, payload: Record<string, unknown> = {}): Event {
    return {
      id: `e_${uuidv4().slice(0, 8)}`,
      ts: Date.now(),
      type: type as Event['type'],
      payload,
    };
  }

  /**
   * I return the currently active provider if a session engine has claimed one.
   */
  private getActiveProvider(): MusicProviderName | null {
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

  private getActiveEngine(): SessionEngine | null {
    const provider = this.getActiveProvider();
    return provider ? this.engines.get(provider) ?? null : null;
  }

  private getActiveRuntime(): ProviderRuntime | null {
    const provider = this.getActiveProvider();
    return provider ? this.getRuntime(provider) : null;
  }

  private getRuntime(provider: MusicProviderName): ProviderRuntime | null {
    if (provider === 'spotify') {
      return this.spotifyRuntime;
    }
    if (provider === 'apple') {
      return this.appleRuntime ?? null;
    }
    return this.youtubeRuntime ?? null;
  }

  /**
   * I resolve a provider's read surface even when local playback is not
   * available on the current host.
   */
  private getReadProvider(provider: MusicProviderName): MusicProvider {
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

  private getPlaybackRuntime(provider: MusicProviderName): ProviderRuntime {
    const runtime = this.getRuntime(provider);
    if (!runtime) {
      throw new ProviderUnavailableError(
        this.getProviderPlaybackUnavailableMessage(provider as Extract<MusicProviderName, 'apple' | 'youtube'>),
      );
    }
    return runtime;
  }

  /**
   * I clear daemon-owned playback state between sessions so queue and history do
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

  /**
   * I reject provider/policy combinations the current runtime cannot honor,
   * rather than silently degrading them into empty sessions.
   */
  private validateSessionPolicyForProvider(policy: SessionPolicy): void {
    const provider = policy.provider ?? 'spotify';
    const sources = policy.sources ?? {};

    if (sources.seedArtists && sources.seedArtists.length > 0) {
      throw new ValidationError('Session policy source seedArtists is not implemented in this build.');
    }

    if (provider === 'spotify') {
      return;
    }

    if (this.hasFeatureDependentPolicy(policy)) {
      throw new ValidationError(
        `${provider === 'apple' ? 'Apple Music' : 'YouTube Music'} sessions do not support audio-feature hard constraints or soft weights in this build.`,
      );
    }

    if (provider === 'apple') {
      if (sources.likedTracks && !this.appleLibraryEnabled) {
        throw new ProviderUnavailableError(
          'Apple Music likedTracks sessions require APPLE_MUSIC_USER_TOKEN to enable the library surface.',
        );
      }

      return;
    }

    if (sources.likedTracks && !this.youtubeAccessToken) {
      throw new ProviderUnavailableError(
        'YouTube Music likedTracks require YOUTUBE_MUSIC_ACCESS_TOKEN.',
      );
    }
  }

  private hasFeatureDependentPolicy(policy: SessionPolicy): boolean {
    const hard = policy.hard;
    const weights = policy.soft?.weights;

    return Boolean(
      hard?.noVocals ||
      hard?.tempo ||
      hard?.energy ||
      hard?.instrumentalnessMin !== undefined ||
      typeof weights?.energy === 'number' ||
      typeof weights?.instrumentalness === 'number' ||
      typeof weights?.speechiness === 'number' ||
      typeof weights?.valence === 'number' ||
      typeof weights?.acousticness === 'number' ||
      typeof weights?.tempo === 'number',
    );
  }

  private async probeSessionProvider(
    provider: MusicProviderName,
    policy: SessionPolicy,
  ): Promise<void> {
    const sources = policy.sources ?? {};
    const providerRuntime = this.getRuntime(provider);
    if (!providerRuntime) {
      throw new ProviderUnavailableError(
        this.getProviderPlaybackUnavailableMessage(provider as Extract<MusicProviderName, 'apple' | 'youtube'>),
      );
    }
    const musicProvider = this.getReadProvider(provider);

    const probes: Array<Promise<unknown>> = [];

    if (sources.seedPlaylists?.length) {
      probes.push(musicProvider.getPlaylistTracks(
        this.extractSessionSourceId(sources.seedPlaylists[0]),
        { limit: 1 },
      ));
    }
    if (sources.likedTracks) {
      probes.push(musicProvider.getLibraryTracks({ limit: 1 }));
    }
    if (sources.topTracks) {
      probes.push(musicProvider.getTopTracks({ limit: 1 }));
    }
    if (sources.recentPlays) {
      probes.push(musicProvider.getRecentlyPlayed({ limit: 1 }));
    }

    const query = sources.searchQueries?.find((value) => typeof value === 'string' && value.trim().length > 0)
      ?? (probes.length === 0 ? this.modeSearchQuery(policy.mode) : undefined);
    if (query) {
      probes.push(musicProvider.search(query, 1));
    }

    if (probes.length === 0) {
      throw new ValidationError(`No supported session sources were configured for ${provider}.`);
    }

    for (const probe of probes) {
      await probe;
    }
  }

  private extractSessionSourceId(value: string): string {
    if (value.startsWith('spotify:') || value.startsWith('youtube:playlist:') || value.startsWith('apple:playlist:')) {
      return value.split(':').pop() || value;
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        const url = new URL(value);
        const playlistId = url.searchParams.get('list');
        if (playlistId) {
          return playlistId;
        }
        const segments = url.pathname.split('/').filter(Boolean);
        return segments[segments.length - 1] || value;
      } catch {
        return value;
      }
    }

    return value;
  }

  /**
   * I resolve Spotify recommendation seeds from explicit input first, then fall
   * back to the strongest personal listening signals the provider exposes.
   */
  private async resolveSpotifyRecommendationSeeds(seed: string | undefined): Promise<string[]> {
    const explicitSeeds = seed
      ? seed
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
          .map((entry) => this.extractSessionSourceId(entry))
      : [];
    if (explicitSeeds.length > 0) {
      return explicitSeeds.slice(0, 5);
    }

    const provider = this.spotifyRuntime.provider;
    const candidates = [
      ...(await provider.getTopTracks({ limit: 1 })),
      ...(await provider.getRecentlyPlayed({ limit: 1 })),
      ...(await provider.getLibraryTracks({ limit: 1 })),
    ];
    const fallbackSeedIds = candidates
      .map((track) => track.id)
      .filter((trackId, index, all) => typeof trackId === 'string' && trackId.length > 0 && all.indexOf(trackId) === index);
    if (fallbackSeedIds.length === 0) {
      throw new ProviderUnavailableError(
        'Spotify recommendations require a seed track or personal listening history.',
      );
    }
    return fallbackSeedIds.slice(0, 5);
  }

  /**
   * I fill in provider-aware source defaults so API callers do not need to know
   * each provider's partial surface to get a working session.
   */
  private normalizeSessionPolicy(policy: SessionPolicy): SessionPolicy {
    const provider = policy.provider ?? 'spotify';
    const sources = policy.sources && Object.keys(policy.sources).length > 0
      ? policy.sources
      : this.defaultSourcesForProvider(provider, policy.mode);

    return {
      ...policy,
      provider,
      sources,
    };
  }

  private defaultSourcesForProvider(
    provider: MusicProviderName,
    mode: SessionPolicy['mode'],
  ): NonNullable<SessionPolicy['sources']> {
    const modeQuery = this.modeSearchQuery(mode);

    if (provider === 'apple') {
      return {
        likedTracks: this.appleLibraryEnabled,
        recentPlays: this.appleLibraryEnabled,
        searchQueries: [modeQuery],
      };
    }

    if (provider === 'youtube') {
      return {
        likedTracks: Boolean(this.youtubeAccessToken),
        searchQueries: [modeQuery],
      };
    }

    return {
      likedTracks: true,
      topTracks: true,
      recentPlays: true,
      discovery: { enabled: true, ratio: 0.15 },
    };
  }

  private modeSearchQuery(mode?: SessionPolicy['mode']): string {
    switch (mode) {
      case 'relax':
        return 'calm instrumental music';
      case 'energize':
        return 'high energy workout music';
      case 'meditate':
        return 'meditation ambient music';
      case 'workout':
        return 'workout mix';
      case 'custom':
        return 'focus music';
      case 'focus':
      default:
        return 'focus instrumental music';
    }
  }

  // ============================================================================
  // Command Handlers — with per-type payload validation
  // ============================================================================

  private async handleCommand(command: Command): Promise<{ success: boolean; sessionId?: string; newWeights?: Record<string, number | undefined> }> {
    await this.store.logEvent('command', { type: command.type, commandId: command.id });

    switch (command.type) {
      case 'session.start': {
        // Validate payload has a policy
        const payloadResult = SessionStartCommand.safeParse(command.payload || {});
        if (!payloadResult.success) {
          throw new ValidationError(
            `Invalid session.start payload: ${payloadResult.error.issues.map((issue) => issue.message).join(', ')}`,
            payloadResult.error.issues,
          );
        }
        return this.startSession(payloadResult.data.policy);
      }

      case 'session.stop':
        return this.stopSession();

      case 'session.nudge': {
        const nudgeResult = SessionNudgeCommand.safeParse(command.payload || {});
        if (!nudgeResult.success) {
          throw new ValidationError(
            `Invalid session.nudge payload: ${nudgeResult.error.issues.map((issue) => issue.message).join(', ')}`,
            nudgeResult.error.issues,
          );
        }
        return this.nudgeSession(nudgeResult.data.direction, nudgeResult.data.amount);
      }

      case 'skip':
        return this.skipTrack((command.payload as Record<string, unknown>)?.reason as string | undefined);

      default:
        throw new ValidationError(`Unknown command type: ${command.type}`);
    }
  }

  // Wire to ENGINE — the real session management
  private async startSession(policy: SessionPolicy): Promise<{ success: boolean; sessionId: string }> {
    if (this.getActiveEngine()) {
      throw new ValidationError('Session already active. Stop current session first.');
    }

    const normalizedPolicy = this.normalizeSessionPolicy(policy);
    const provider = normalizedPolicy.provider ?? 'spotify';
    const engine = this.engines.get(provider);
    const runtime = this.getRuntime(provider);
    if (!engine || !runtime) {
      throw new ProviderUnavailableError(
        this.getProviderPlaybackUnavailableMessage(provider as Extract<MusicProviderName, 'apple' | 'youtube'>),
      );
    }

    this.validateSessionPolicyForProvider(normalizedPolicy);
    await this.assertProviderReady(provider, 'starting a session', normalizedPolicy);
    await this.resetRuntimeState(provider);
    await engine.start(normalizedPolicy);

    const state = engine.getState();
    if (!state || state.queuedTracks.length === 0) {
      await this.rollbackFailedSessionStart(engine, provider);
      throw new ProviderUnavailableError(
        `No tracks were available from ${provider} for this session policy. Adjust the policy sources and try again.`,
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
  }

  /**
   * I unwind a failed session start and surface rollback failures instead of
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

  private async stopSession(): Promise<{ success: boolean }> {
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

  private async nudgeSession(
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

  private async skipTrack(reason?: string): Promise<{ success: boolean }> {
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

  // ============================================================================
  // Track Change Polling — feeds engine.recordPlay()
  // ============================================================================

  private startTrackPolling(): void {
    if (this.trackPollInterval) return;
    this.trackPollInterval = setInterval(async () => {
      try {
        const playback = this.getActiveRuntime()?.playback;
        if (!playback) {
          return;
        }

        const track = await playback.getNowPlaying();
        if (track && track.id !== this.lastTrackId) {
          this.lastTrackId = track.id;
          await this.getActiveEngine()?.recordPlay(track);
          this.broadcastEvent('track.started', { track });
        }
      } catch { /* polling failure is non-fatal */ }
    }, TRACK_POLL_INTERVAL_MS);
  }

  private stopTrackPolling(): void {
    if (this.trackPollInterval) {
      clearInterval(this.trackPollInterval);
      this.trackPollInterval = null;
    }
    this.lastTrackId = null;
  }

  // ============================================================================
  // Status
  // ============================================================================

  private async getStatus(): Promise<DaemonStatus> {
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

  // ============================================================================
  // Server Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    // Run migrations (WAL mode + tables)
    await this.store.migrate();

    // Enable WAL mode for concurrent read/write
    try {
      await (this.store as any).client?.execute('PRAGMA journal_mode=WAL');
    } catch { /* WAL not supported in memory mode */ }

    await this.spotifyAuth.loadTokens();

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

  // ============================================================================
  // Auth middleware — HMAC-based timing-safe comparison
  // ============================================================================

  private requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/auth/spotify/callback') { next(); return; }
    const token = this.extractAuthorizationToken(req);

    if (req.path.startsWith('/apple/remote')) {
      const authorized = this.appleRemoteToken
        ? this.tokensMatch(this.appleRemoteToken, token)
        : this.tokensMatch(this.apiToken, token);
      if (authorized) {
        next();
        return;
      }
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!this.apiToken) { next(); return; }

    if (!this.tokensMatch(this.apiToken, token)) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    next();
  }

  private extractAuthorizationToken(req: Request): string {
    const authHeader = req.header('authorization') || '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  }

  private tokensMatch(expected: string | undefined, provided: string): boolean {
    if (!expected) {
      return false;
    }
    const hmacKey = 'harmon-auth-compare';
    const expectedMac = createHmac('sha256', hmacKey).update(expected).digest();
    const providedMac = createHmac('sha256', hmacKey).update(provided).digest();
    return timingSafeEqual(expectedMac, providedMac);
  }

  // ============================================================================
  // Token/Cookie Storage
  // ============================================================================

  private createSpotifyTokenStore(): TokenStore {
    return {
      get: async () => {
        const raw = await this.store.getSetting('spotify.tokens');
        if (!raw) return null;
        try {
          const decrypted = this.encryptor ? this.encryptor.decrypt(raw) : raw;
          this.spotifyTokenLoadFailure = false;
          return JSON.parse(decrypted) as SpotifyTokens;
        } catch (error) {
          this.spotifyTokenLoadFailure = true;
          this.logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Stored Spotify tokens are unreadable; treating them as degraded auth state',
          );
          return null;
        }
      },
      set: async (tokens) => {
        if (!tokens) {
          this.spotifyTokenLoadFailure = false;
          await this.store.deleteSetting('spotify.tokens');
          return;
        }
        const json = JSON.stringify(tokens);
        const value = this.encryptor ? this.encryptor.encrypt(json) : json;
        this.spotifyTokenLoadFailure = false;
        await this.store.setSetting('spotify.tokens', value);
      },
    };
  }

  private createSpotifyCookieStore(): CookieStore {
    return {
      get: async () => {
        const raw = await this.store.getSetting('spotify.cookies');
        if (!raw) return null;
        try {
          const decrypted = this.encryptor ? this.encryptor.decrypt(raw) : raw;
          this.spotifyCookieLoadFailure = false;
          return JSON.parse(decrypted) as SpotifyCookieRecord[];
        } catch (error) {
          this.spotifyCookieLoadFailure = true;
          this.logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Stored Spotify cookies are unreadable; treating them as degraded auth state',
          );
          return null;
        }
      },
      set: async (cookies) => {
        if (!cookies || cookies.length === 0) {
          this.spotifyCookieLoadFailure = false;
          await this.store.deleteSetting('spotify.cookies');
          return;
        }
        const json = JSON.stringify(cookies);
        const value = this.encryptor ? this.encryptor.encrypt(json) : json;
        this.spotifyCookieLoadFailure = false;
        await this.store.setSetting('spotify.cookies', value);
      },
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * I normalize route failures in one place so callers can distinguish bad input
   * from missing session/provider state and upstream provider failures.
   */
  private handleRouteError(res: Response, error: unknown, asText = false): void {
    const apiError = this.toApiError(error);
    const message =
      apiError.code === 'INTERNAL_ERROR' && process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : apiError.message;

    if (asText) {
      res.status(apiError.statusCode).send(message);
      return;
    }

    res.status(apiError.statusCode).json({
      success: false,
      error: message,
      code: apiError.code,
      details: apiError.details,
    });
  }

  /**
   * I classify known daemon/provider failures into stable HTTP semantics.
   */
  private toApiError(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const upstreamStatusCode = this.extractUpstreamStatusCode(message);

    if (upstreamStatusCode !== undefined) {
      return new UpstreamServiceError(message, upstreamStatusCode);
    }

    if (
      message.includes('configuration missing') ||
      message.includes('not configured')
    ) {
      return new ConfigurationError(message);
    }

    if (
      message.includes('not connected') ||
      message.includes('session expired') ||
      message.includes('No refresh token available') ||
      message.includes('user token required') ||
      message.includes('requires YOUTUBE_MUSIC_ACCESS_TOKEN')
    ) {
      return new ProviderUnavailableError(message);
    }

    if (message === 'No active session') {
      return new SessionNotFoundError();
    }

    if (message === 'Apple Music local playback is only supported on macOS.') {
      return new UnsupportedPlatformError(message);
    }

    if (message.includes('not supported in browser-handoff mode')) {
      return new ApiError(501, message, 'UNSUPPORTED_OPERATION');
    }

    if (
      message.startsWith('Invalid ') ||
      message.startsWith('Missing ') ||
      message.includes('Login flow expired') ||
      message.includes('must be one of') ||
      message.includes('must use') ||
      message.includes('queue is empty') ||
      message.includes('playback history is empty') ||
      message.includes('could not be resolved to a playable URL') ||
      message.includes('Maximum 5 total seeds allowed') ||
      message.includes('At least one seed')
    ) {
      return new ValidationError(message);
    }

    return new ApiError(500, message, 'INTERNAL_ERROR');
  }

  /**
   * I reuse provider error prefixes instead of maintaining per-route parsing logic.
   */
  private extractUpstreamStatusCode(message: string): number | undefined {
    const match = message.match(
      /^(Spotify API error|Spotify token refresh failed|Spotify token exchange failed|Spotify cookie token failed|Apple Music API error|YouTube API error): (\d+)/
    );

    if (!match) {
      return undefined;
    }

    return Number.parseInt(match[2], 10);
  }

  private clampNumber(value: unknown, min: number, max: number): number | undefined {
    if (typeof value !== 'string') return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.min(max, Math.max(min, parsed));
  }

  private parseBodyString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * I keep journal metadata limited to plain objects so persistence stays
   * deterministic and the stored JSON can be parsed back safely later.
   */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * I reject oversize structured journal fields instead of truncating JSON
   * mid-token and persisting corrupted blobs to SQLite.
   */
  private serializeJournalField(
    value: Record<string, unknown> | SessionPolicy | undefined,
    fieldName: 'context' | 'policy',
    maxBytes: number
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw new ValidationError(`Invalid journal entry: ${fieldName} must be JSON serializable`);
    }

    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      throw new ValidationError(`Invalid journal entry: ${fieldName} exceeds ${maxBytes} bytes once serialized`);
    }

    return serialized;
  }

  private parseBodyNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value !== 'string') return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parseBodyBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  private parseAppleRemotePlaybackState(value: unknown): 'paused' | 'playing' | 'stopped' | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === 'paused' || value === 'playing' || value === 'stopped') {
      return value;
    }
    throw new ValidationError('Invalid Apple remote playbackState');
  }

  private async assertProviderReady(
    provider: MusicProviderName,
    operation: string,
    policy?: SessionPolicy,
  ): Promise<void> {
    if (provider === 'spotify') {
      const spotify = await this.getSpotifyProviderStatus();
      if (spotify.connected) {
        return;
      }

      const message =
        spotify.auth === 'none'
          ? `Spotify is not connected. Complete authentication before ${operation}.`
          : `Spotify is not ready. Refresh authentication before ${operation}.`;
      throw new ProviderUnavailableError(message);
    }

    if (provider === 'apple') {
      const apple = this.getAppleProviderStatus();
      if (policy) {
        if (apple.capabilities?.sessionControl) {
          await this.probeSessionProvider(provider, policy);
          return;
        }
      } else if (apple.capabilities?.playback) {
        return;
      }
      throw new ProviderUnavailableError(`Apple Music is not ready. Complete setup before ${operation}.`);
    }

    const youtube = this.getYouTubeProviderStatus();
    if (policy) {
      if (youtube.capabilities?.sessionControl) {
        await this.probeSessionProvider(provider, policy);
        return;
      }
    } else if (youtube.capabilities?.playback) {
      return;
    }

    throw new ProviderUnavailableError(
      this.youtubeBrowserSupport.available
        ? `YouTube Music is not ready. Complete setup before ${operation}.`
        : `${this.youtubeBrowserSupport.reason ?? 'Browser handoff is not available on this host.'} Complete setup before ${operation}.`,
    );
  }

  /**
   * I keep playback-unavailable errors explicit about the missing local runtime.
   */
  private getProviderPlaybackUnavailableMessage(
    provider: Extract<MusicProviderName, 'apple' | 'youtube'>,
  ): string {
    if (provider === 'apple') {
      if (this.appleRemoteBridge) {
        return this.appleRemoteBridge.isConnected()
          ? 'Apple Music remote playback is not available on this daemon instance.'
          : 'Apple Music remote playback is configured, but no iOS companion is connected.';
      }
      return 'Apple Music playback is not available on this daemon instance.';
    }

    return this.youtubeBrowserSupport.reason
      ? `YouTube Music playback is not available on this daemon instance: ${this.youtubeBrowserSupport.reason}`
      : 'YouTube Music playback is not available on this daemon instance.';
  }

  private parseJournalEntry(value: unknown): JournalEntryInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ValidationError('Invalid journal entry');
    }

    const entry = value as Record<string, unknown>;
    const content = this.parseBodyString(entry.content);
    if (!content) {
      throw new ValidationError('Invalid journal entry: content is required');
    }

    if (entry.moodTags !== undefined && !Array.isArray(entry.moodTags)) {
      throw new ValidationError('Invalid journal entry: moodTags must be an array');
    }

    const moodTags = Array.isArray(entry.moodTags)
      ? entry.moodTags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
          .slice(0, 20)
      : [];

    if (entry.context !== undefined && !this.isPlainObject(entry.context)) {
      throw new ValidationError('Invalid journal entry: context must be an object');
    }

    let policy: SessionPolicy | undefined;
    if (entry.policy !== undefined) {
      if (!this.isPlainObject(entry.policy)) {
        throw new ValidationError('Invalid journal entry: policy must be an object');
      }
      const policyResult = SessionPolicy.safeParse(entry.policy);
      if (!policyResult.success) {
        throw new ValidationError(
          `Invalid journal entry: policy ${policyResult.error.issues.map((issue) => issue.message).join(', ')}`,
          policyResult.error.issues,
        );
      }
      policy = policyResult.data;
    }

    return {
      content: content.slice(0, 10000),
      context: entry.context as Record<string, unknown> | undefined,
      device: (this.parseBodyString(entry.device) || 'linux').slice(0, 50),
      energyLevel: this.parseBodyString(entry.energyLevel)?.slice(0, 50),
      moodTags,
      policy,
      sessionId: this.parseBodyString(entry.sessionId),
      source: (this.parseBodyString(entry.source) || 'cli').slice(0, 50),
    };
  }

  private parseSearchTypes(value: string): Array<'track' | 'album' | 'artist' | 'playlist' | 'episode' | 'show'> {
    const allowed = new Set(['track', 'album', 'artist', 'playlist', 'episode', 'show']);
    const requested = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    if (requested.length === 0) {
      throw new ValidationError('Search type must be one of: track, album, artist, playlist, episode, show');
    }
    if (requested.some((entry) => !allowed.has(entry))) {
      throw new ValidationError('Search type must be one of: track, album, artist, playlist, episode, show');
    }
    return requested as Array<'track' | 'album' | 'artist' | 'playlist' | 'episode' | 'show'>;
  }

  private parseAppleSearchTypes(value: string): Array<'songs' | 'albums' | 'artists' | 'playlists'> {
    const allowed = new Set(['songs', 'albums', 'artists', 'playlists']);
    const requested = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    if (requested.length === 0) {
      throw new ValidationError('Apple search type must be one of: songs, albums, artists, playlists');
    }
    if (requested.some((entry) => !allowed.has(entry))) {
      throw new ValidationError('Apple search type must be one of: songs, albums, artists, playlists');
    }
    return requested as Array<'songs' | 'albums' | 'artists' | 'playlists'>;
  }

  private parseYouTubeSearchTypes(value: string): Array<'songs' | 'albums' | 'artists' | 'playlists'> {
    const requested = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    const normalized = requested.map((entry) => {
      if (entry === 'song' || entry === 'songs' || entry === 'track' || entry === 'tracks') return 'songs';
      if (entry === 'album' || entry === 'albums') return 'albums';
      if (entry === 'artist' || entry === 'artists') return 'artists';
      if (entry === 'playlist' || entry === 'playlists') return 'playlists';
      return null;
    });
    if (normalized.length === 0 || normalized.some((entry) => entry === null)) {
      throw new ValidationError('YouTube search type must be one of: song, songs, track, tracks, album, albums, artist, artists, playlist, playlists');
    }
    return Array.from(new Set(normalized.filter((entry): entry is 'songs' | 'albums' | 'artists' | 'playlists' => entry !== null)));
  }

  private getAppleMusicClient(): AppleMusicClient {
    if (!this.appleMusicClient) {
      throw new ConfigurationError('Apple Music not configured (set APPLE_MUSIC_DEVELOPER_TOKEN).');
    }
    return this.appleMusicClient;
  }

  private getYouTubeMusicClient(): YouTubeMusicClient {
    if (!this.youtubeMusicClient) {
      throw new ConfigurationError(
        'YouTube Music not configured (set YOUTUBE_MUSIC_API_KEY, YT_API_KEY, or YOUTUBE_MUSIC_ACCESS_TOKEN).',
      );
    }
    return this.youtubeMusicClient;
  }

  /**
   * I probe Spotify auth material before reporting provider readiness so
   * status reflects more than stored credentials alone.
   */
  private async getSpotifyProviderStatus(): Promise<ProviderStatusDetails> {
    const authMode = this.getSpotifyAuthMode();
    const loadFailure = this.spotifyTokenLoadFailure || this.spotifyCookieLoadFailure;
    const capabilities = {
      cookieImport: true,
      deviceTransfer: true,
      library: true,
      playback: true,
      queue: true,
      search: true,
      sessionControl: true,
    };

    if (authMode === 'none') {
      return {
        connected: false,
        name: 'Spotify',
        status: loadFailure ? 'degraded' : 'missing',
        auth: authMode,
        playbackMode: 'native',
        capabilities,
      };
    }

    try {
      const accessToken = await this.spotifyAuth.getAccessToken();
      const isReady = typeof accessToken === 'string' && accessToken.length > 0;

      return {
        connected: isReady,
        name: 'Spotify',
        status: isReady ? 'ready' : 'degraded',
        auth: authMode,
        playbackMode: 'native',
        capabilities,
      };
    } catch {
      return {
        connected: false,
        name: 'Spotify',
        status: 'degraded',
        auth: authMode,
        playbackMode: 'native',
        capabilities,
      };
    }
  }

  /**
   * I split Apple catalog, library, and local playback readiness so provider
   * status stays truthful about which subset of the Apple surface is usable.
   */
  private getAppleProviderStatus(): ProviderStatusDetails {
    const playbackRuntime = this.appleRuntime;
    const remoteBridgeStatus = this.appleRemoteBridge?.getStatus();
    const localPlaybackReady =
      this.appleLocalPlaybackEnabled &&
      Boolean(this.appleMusicClient);
    const remotePlaybackReady = Boolean(remoteBridgeStatus?.connected);
    const playbackReady = localPlaybackReady || remotePlaybackReady;
    const auth =
      this.appleLibraryEnabled
        ? 'developer-and-user-token'
        : this.appleCatalogEnabled
          ? 'developer-token'
          : 'none';
    const hasAppleCapability =
      this.appleCatalogEnabled ||
      this.appleLibraryEnabled ||
      !!playbackRuntime ||
      !!this.appleRemoteBridge;
    const playbackMode =
      remotePlaybackReady
        ? 'remote'
        : localPlaybackReady
          ? 'applescript'
          : this.appleRemoteBridge
            ? 'remote'
            : playbackRuntime?.playbackMode;
    const ready = playbackReady;

    return {
      connected: hasAppleCapability,
      name: 'Apple Music',
      status: !hasAppleCapability ? 'missing' : ready ? 'ready' : 'configured',
      auth,
      playbackMode,
      capabilities: {
        catalog: this.appleCatalogEnabled,
        companion: Boolean(remoteBridgeStatus?.connected),
        library: this.appleLibraryEnabled,
        next: playbackReady,
        pause: playbackReady,
        previous: playbackReady,
        playback: playbackReady,
        recommendations: this.appleCatalogEnabled,
        recentPlays: this.appleCatalogEnabled,
        search: this.appleCatalogEnabled,
        sessionControl: playbackReady && (this.appleCatalogEnabled || this.appleLibraryEnabled),
        topTracks: this.appleCatalogEnabled,
      },
    };
  }

  private getAppleRemoteBridge(): AppleRemoteBridge {
    if (!this.appleRemoteBridge) {
      throw new ProviderUnavailableError('Apple Music remote playback is not configured on this daemon instance.');
    }
    return this.appleRemoteBridge;
  }

  private getYouTubeProviderStatus(): ProviderStatusDetails {
    const configured = !!this.youtubeMusicClient;
    const runtime = !!this.youtubeRuntime && this.youtubeBrowserSupport.available;
    const auth: ProviderStatusDetails['auth'] =
      this.youtubeAccessToken ? 'oauth' : this.youtubeApiKey ? 'api-key' : 'none';

    return {
      connected: configured,
      name: 'YouTube Music',
      status: !configured ? 'missing' : runtime ? 'ready' : 'configured',
      auth,
      playbackMode: runtime ? 'browser-handoff' : undefined,
      capabilities: {
        library: Boolean(this.youtubeAccessToken),
        playback: runtime,
        pause: false,
        playlists: Boolean(this.youtubeAccessToken),
        previous: runtime,
        queue: runtime,
        recommendations: configured,
        search: configured,
        sessionControl: runtime && configured,
        songLookup: configured,
        topTracks: configured,
        recentPlays: configured,
      },
    };
  }

  /**
   * I keep the daemon-side cookie import contract aligned with the Spotify
   * package's auth-cookie allowlist so only supported auth material crosses
   * the HTTP boundary.
   */
  private sanitizeImportedSpotifyCookies(records: unknown[]): SpotifyCookieRecord[] {
    const sanitized = new Map<string, SpotifyCookieRecord>();

    for (const record of records) {
      if (!record || typeof record !== 'object') {
        continue;
      }

      const value = record as Partial<SpotifyCookieRecord>;
      const domain = typeof value.domain === 'string' ? value.domain.trim().toLowerCase().replace(/^\.+/, '') : '';
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      const path = typeof value.path === 'string' ? value.path.trim() : '/';

      if (!['spotify.com', 'open.spotify.com'].includes(domain)) {
        continue;
      }
      if (!['sp_dc', 'sp_key'].includes(name)) {
        continue;
      }
      if (!path.startsWith('/')) {
        continue;
      }
      if (typeof value.value !== 'string') {
        continue;
      }

      sanitized.set(`${domain}:${path}:${name}`, {
        domain,
        name,
        path,
        value: value.value.slice(0, 4096),
        expires: typeof value.expires === 'string' ? value.expires : null,
        isSecure: value.isSecure === true,
        isHTTPOnly: value.isHTTPOnly === true,
      });
    }

    return Array.from(sanitized.values());
  }

  /**
   * I read the richer auth mode when the Spotify package exposes it, while
   * keeping an honest fallback for older type surfaces.
   */
  private getSpotifyAuthMode(): 'none' | 'oauth' | 'cookies' {
    const auth = this.spotifyAuth as SpotifyAuth & {
      getAuthMode?: () => 'none' | 'oauth' | 'cookies';
    };

    return auth.getAuthMode?.() ?? (auth.isConnected() ? 'oauth' : 'none');
  }

  /**
   * I probe imported Spotify cookies before persisting them so invalid browser
   * exports cannot wipe a working daemon auth state.
   */
  private async validateImportedSpotifyCookies(cookies: SpotifyCookieRecord[]): Promise<void> {
    const probeAuth = createSpotifyAuth({
      clientId: process.env.SPOTIFY_CLIENT_ID || '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri: this.spotifyRedirectUri,
    });

    await probeAuth.setCookies(cookies);

    try {
      const accessToken = await probeAuth.getAccessToken();
      if (!accessToken) {
        throw new ValidationError('Imported Spotify cookies did not produce an access token.');
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      throw new ValidationError(
        'Imported Spotify cookies were rejected by Spotify. Export a fresh spotify.com session and try again.',
      );
    }
  }

  getStore(): HarmonStore {
    return this.store;
  }

  /**
   * I track live sockets so shutdown can destroy keep-alive connections if the
   * HTTP server does not drain on its own before the timeout.
   */
  private trackServerSocket(socket: Socket): void {
    this.openSockets.add(socket);
    socket.on('close', () => {
      this.openSockets.delete(socket);
    });
  }

  /**
   * I close the HTTP server and destroy lingering sockets if it misses the
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

// Run as standalone
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  let daemon: Harmond;
  try {
    daemon = createDaemon();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    console.error('Failed to initialize harmond:', message);
    process.exit(1);
  }
  const failFast = async (label: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(label, message);
    try {
      await daemon.stop();
    } catch {
      // I ignore shutdown failures during fatal exit because the process is terminating anyway.
    }
    process.exit(1);
  };

  daemon.start().then(() => {
    console.log('Harmond listening');
  }).catch((err) => {
    void failFast('Failed to start:', err);
  });

  const shutdown = async () => {
    try {
      await daemon.stop();
      process.exit(0);
    } catch (error) {
      console.error('Shutdown failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (error) => {
    void failFast('Uncaught exception:', error);
  });
  process.on('unhandledRejection', (reason) => {
    void failFast('Unhandled rejection:', reason);
  });
}
