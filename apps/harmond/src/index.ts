/**
 * Harmond - The Harmon daemon with HTTP+SSE API
 *
 * Hardened: engine wired, payload validation, AppleScript injection fixed,
 * WAL mode, shutdown timeout, SSE cap, body limits, signal handling.
 */

import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createHmac } from 'node:crypto';
import { HarmonStore } from '@athena/harmon-store';
import { createEngine, type SessionEngine, type EngineEvent } from '@athena/harmon-core';
import { createLogger, type Logger } from '@athena/harmon-logger';
import { createEncryptor, type Encryptor } from '@athena/harmon-crypto';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  parseCommandSafe,
  SessionStartCommand,
  SessionNudgeCommand,
  type SessionPolicy,
  type Command,
  type Event,
  type DaemonStatus,
  type DeviceInfo,
  type TrackInfo,
} from '@athena/harmon-protocol';
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
} from '@athena/harmon-spotify';
import type { MusicProvider, PlaybackController } from '@athena/harmon-core';
import { createAppleMusicClient, type AppleMusicClient } from '@athena/harmon-apple';
import { errorHandler } from './errors.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_PORT = 17373;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DB_PATH = '.harmon.db';
const SSE_HEARTBEAT_MS = 30000;
const MAX_SSE_CLIENTS = 50;
const SHUTDOWN_TIMEOUT_MS = 5000;
const TRACK_POLL_INTERVAL_MS = 5000;
const execFileAsync = promisify(execFile);

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
  private provider: MusicProvider;
  private playback: PlaybackController;
  private appleMusicClient?: AppleMusicClient;
  private engine: SessionEngine;
  private encryptor?: Encryptor;
  private port: number;
  private host: string;
  private apiToken?: string;
  private corsOrigins: Set<string>;
  private allowAllOrigins = false;
  private sseClients: Set<Response> = new Set();
  private server: ReturnType<express.Application['listen']> | null = null;
  private sseHeartbeat: ReturnType<typeof setInterval> | null = null;
  private trackPollInterval: ReturnType<typeof setInterval> | null = null;
  private lastTrackId: string | null = null;

  constructor(config: DaemonConfig = {}) {
    const envPort = parsePort(process.env.HARMON_PORT);
    const envHost = process.env.HARMON_BIND_ADDRESS;
    const envDbPath = process.env.HARMON_DB_PATH;
    const envCorsOrigins = parseCorsOrigins(process.env.HARMON_CORS_ORIGINS);
    const corsOrigins = config.corsOrigins ?? envCorsOrigins;

    this.port = config.port || envPort || DEFAULT_PORT;
    this.host = config.host || envHost || DEFAULT_HOST;
    this.apiToken = config.apiToken || process.env.HARMON_API_TOKEN;
    this.allowAllOrigins = corsOrigins.includes('*');
    this.corsOrigins = new Set(corsOrigins.filter((origin) => origin !== '*'));

    // Initialize logging
    this.logger = createLogger({ name: 'harmond' });
    this.requestLogger = this.logger.child({ module: 'http' });

    this.app = express();

    // Use HarmonStore directly (not async createStore) — migrate() called in start()
    this.store = new HarmonStore({ dbPath: config.dbPath || envDbPath || DEFAULT_DB_PATH });

    // Initialize encryption if secret provided
    const encryptionSecret = process.env.HARMON_ENCRYPTION_SECRET;

    if (process.env.NODE_ENV === 'production' && !encryptionSecret) {
      this.logger.error('FATAL: Encryption required in production. Set HARMON_ENCRYPTION_SECRET.');
      console.error('\n❌ FATAL: Set HARMON_ENCRYPTION_SECRET (min 32 chars)\n');
      process.exit(1);
    }

    if (encryptionSecret) {
      this.encryptor = createEncryptor({ secret: encryptionSecret });
      this.logger.info('Token encryption enabled');
    } else {
      this.logger.warn('Token encryption disabled — development only');
    }

    const redirectUri =
      process.env.SPOTIFY_REDIRECT_URI ||
      `http://${this.host}:${this.port}/v1/auth/spotify/callback`;
    const tokenStore = this.createSpotifyTokenStore();
    const cookieStore = this.createSpotifyCookieStore();
    this.spotifyAuth = createSpotifyAuth({
      clientId: process.env.SPOTIFY_CLIENT_ID || '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri,
      tokenStore,
      cookieStore,
    });
    this.spotifyClient = createSpotifyClient({ auth: this.spotifyAuth });

    // Create MusicProvider and PlaybackController adapters
    this.provider = createSpotifyProvider(this.spotifyClient);
    this.playback = createSpotifyPlayback(this.spotifyClient);

    const appleDeveloperToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    if (appleDeveloperToken) {
      this.appleMusicClient = createAppleMusicClient({
        developerToken: appleDeveloperToken,
        userToken: process.env.APPLE_MUSIC_USER_TOKEN,
        storefront: process.env.APPLE_MUSIC_STOREFRONT || 'us',
      });
    }

    // Create engine with proper MusicProvider + PlaybackController
    this.engine = createEngine({
      provider: this.provider,
      playback: this.playback,
      store: this.store,
      onEvent: this.handleEngineEvent.bind(this),
    });

    this.logger.info({ port: this.port, host: this.host }, 'Daemon initializing');

    this.setupMiddleware();
    this.setupRoutes();
  }

  private handleEngineEvent(event: EngineEvent): void {
    this.broadcastEvent(event.type, event.payload);
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
      res.json({ status: 'ok', version: '0.0.0', timestamp: new Date().toISOString() });
    });

    // Status
    this.app.get('/v1/status', (_req: Request, res: Response) => {
      res.json(this.getStatus());
    });

    // Devices
    this.app.get('/v1/devices', async (_req: Request, res: Response) => {
      try {
        res.json(await this.spotifyClient.getDevices());
      } catch (error) {
        res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
        res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
        res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Auth
    this.app.post('/v1/auth/spotify/login', (_req: Request, res: Response) => {
      try { res.json({ url: this.spotifyAuth.getLoginUrl() }); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
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
        res.status(400).send(error instanceof Error ? error.message : 'Spotify auth failed.');
      }
    });

    this.app.post('/v1/auth/spotify/logout', async (_req: Request, res: Response) => {
      try {
        await this.spotifyAuth.logout();
        this.broadcastEvent('spotify.disconnected', {});
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
        // Validate each cookie has required fields
        const validated: SpotifyCookieRecord[] = [];
        for (const c of cookies) {
          if (typeof c !== 'object' || c === null) continue;
          if (typeof c.name !== 'string' || typeof c.value !== 'string') continue;
          validated.push({
            domain: typeof c.domain === 'string' ? c.domain : '',
            name: c.name,
            path: typeof c.path === 'string' ? c.path : '/',
            value: c.value.slice(0, 4096), // cap value length
            expires: typeof c.expires === 'string' ? c.expires : null,
            isSecure: typeof c.isSecure === 'boolean' ? c.isSecure : false,
            isHTTPOnly: typeof c.isHTTPOnly === 'boolean' ? c.isHTTPOnly : false,
          });
        }
        if (validated.length === 0) {
          res.status(400).json({ success: false, error: 'No valid cookies found' });
          return;
        }
        await this.spotifyAuth.logout();
        await this.spotifyAuth.setCookies(validated);
        res.json({ success: true, cookiesImported: validated.length });
      } catch (error) {
        res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Journal — with bounds
    this.app.get('/v1/journal', async (req: Request, res: Response) => {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit as string, 10) || 50, 1), 500);
      res.json(await this.store.getJournalEntries(limit));
    });

    this.app.post('/v1/journal', async (req: Request, res: Response) => {
      const entry = req.body;
      if (!entry || typeof entry !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid journal entry' });
        return;
      }
      const content = typeof entry.content === 'string' ? entry.content.slice(0, 10000) : '';
      const id = await this.store.addJournalEntry({
        filename: `api-${uuidv4()}.md`,
        timestamp: new Date().toISOString(),
        source: typeof entry.source === 'string' ? entry.source.slice(0, 50) : 'cli',
        device: typeof entry.device === 'string' ? entry.device.slice(0, 50) : 'linux',
        moodTags: Array.isArray(entry.moodTags) ? entry.moodTags.filter((t: unknown) => typeof t === 'string').join(', ') : '',
        energyLevel: typeof entry.energyLevel === 'string' ? entry.energyLevel : undefined,
        context: entry.context ? JSON.stringify(entry.context).slice(0, 2000) : undefined,
        content,
        policy: entry.policy ? JSON.stringify(entry.policy).slice(0, 5000) : undefined,
      });
      res.json({ id, success: true });
    });

    // SSE events
    this.app.get('/v1/events', (req: Request, res: Response) => {
      if (this.sseClients.size >= MAX_SSE_CLIENTS) {
        res.status(503).json({ success: false, error: 'Too many SSE connections' });
        return;
      }
      this.setupSSEClient(req, res);
    });

    // Stats
    this.app.get('/v1/stats', async (_req: Request, res: Response) => {
      res.json(await this.store.getStats());
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
        res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Spotify playback
    this.app.get('/v1/spotify/now-playing', async (_req: Request, res: Response) => {
      try { res.json(await this.spotifyClient.getNowPlaying()); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/play', async (req: Request, res: Response) => {
      try {
        const uri = this.parseBodyString(req.body?.uri);
        const contextUri = this.parseBodyString(req.body?.contextUri);
        await this.spotifyClient.play({ uri, contextUri });
        res.json({ success: true });
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/pause', async (_req, res) => {
      try { await this.spotifyClient.pause(); res.json({ success: true }); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/next', async (_req, res) => {
      try { await this.spotifyClient.next(); res.json({ success: true }); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/prev', async (_req, res) => {
      try { await this.spotifyClient.previous(); res.json({ success: true }); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/seek', async (req, res) => {
      try {
        const positionMs = this.parseBodyNumber(req.body?.positionMs);
        if (positionMs === undefined || positionMs < 0) { res.status(400).json({ success: false, error: 'Invalid positionMs' }); return; }
        await this.spotifyClient.seek(positionMs);
        res.json({ success: true });
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/volume', async (req, res) => {
      try {
        const vol = this.parseBodyNumber(req.body?.volumePercent);
        if (vol === undefined || vol < 0 || vol > 100) { res.status(400).json({ success: false, error: 'volumePercent must be 0-100' }); return; }
        await this.spotifyClient.setVolume(vol);
        res.json({ success: true });
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/shuffle', async (req, res) => {
      try {
        const state = this.parseBodyBoolean(req.body?.state);
        if (state === undefined) { res.status(400).json({ success: false, error: 'Invalid state' }); return; }
        await this.spotifyClient.setShuffle(state);
        res.json({ success: true });
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/repeat', async (req, res) => {
      try {
        const state = this.parseBodyString(req.body?.state);
        if (state !== 'off' && state !== 'track' && state !== 'context') { res.status(400).json({ success: false, error: 'state must be off|track|context' }); return; }
        await this.spotifyClient.setRepeat(state);
        res.json({ success: true });
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/spotify/queue', async (req, res) => {
      try {
        const uri = this.parseBodyString(req.body?.uri);
        if (!uri) { res.status(400).json({ success: false, error: 'Missing uri' }); return; }
        await this.spotifyClient.addToQueue(uri);
        res.json({ success: true });
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    // Spotify library/playlists
    this.app.get('/v1/spotify/playlists', async (req, res) => {
      try { res.json(await this.spotifyClient.getPlaylists({ limit: this.clampNumber(req.query.limit, 1, 50), offset: this.clampNumber(req.query.offset, 0, 10000) })); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/spotify/playlists/:id/tracks', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid playlist id' }); return; }
        res.json(await this.spotifyClient.getPlaylistTracks(id, { limit: this.clampNumber(req.query.limit, 1, 100), offset: this.clampNumber(req.query.offset, 0, 10000) }));
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/spotify/history', async (req, res) => {
      try {
        const limit = this.clampNumber(req.query.limit, 1, 50);
        res.json(await this.spotifyClient.getRecentlyPlayed({ limit }));
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/spotify/library/tracks', async (req, res) => {
      try { res.json(await this.spotifyClient.getSavedTracks({ limit: this.clampNumber(req.query.limit, 1, 50), offset: this.clampNumber(req.query.offset, 0, 10000) })); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/spotify/library/albums', async (req, res) => {
      try { res.json(await this.spotifyClient.getSavedAlbums({ limit: this.clampNumber(req.query.limit, 1, 50), offset: this.clampNumber(req.query.offset, 0, 10000) })); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    // Apple Music
    this.app.get('/v1/apple/search', async (req, res) => {
      try {
        const client = this.getAppleMusicClient();
        const query = req.query.q;
        if (typeof query !== 'string' || !query.trim()) { res.status(400).json({ success: false, error: 'Missing query (q)' }); return; }
        const types = this.parseAppleSearchTypes(typeof req.query.type === 'string' ? req.query.type : 'songs');
        res.json(await client.search(query, types, { limit: this.clampNumber(req.query.limit, 1, 25) }));
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/apple/songs/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getSong(id));
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/apple/albums/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getAlbum(id));
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/apple/artists/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getArtist(id));
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/apple/playlists/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
        res.json(await this.getAppleMusicClient().getPlaylist(id));
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/apple/library/songs', async (req, res) => {
      try { res.json(await this.getAppleMusicClient().getLibrarySongs({ limit: this.clampNumber(req.query.limit, 1, 100) })); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/apple/library/albums', async (req, res) => {
      try { res.json(await this.getAppleMusicClient().getLibraryAlbums({ limit: this.clampNumber(req.query.limit, 1, 100) })); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.get('/v1/apple/library/playlists', async (req, res) => {
      try { res.json(await this.getAppleMusicClient().getLibraryPlaylists({ limit: this.clampNumber(req.query.limit, 1, 100) })); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    // Apple Music playback via AppleScript — with injection protection
    this.app.post('/v1/apple/play', async (req, res) => {
      try {
        const url = this.parseBodyString(req.body?.url);
        await this.playAppleMusic(url);
        res.json({ success: true });
      } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/apple/pause', async (_req, res) => {
      try { await this.runAppleScriptCommand('pause'); res.json({ success: true }); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/apple/next', async (_req, res) => {
      try { await this.runAppleScriptCommand('next track'); res.json({ success: true }); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    this.app.post('/v1/apple/prev', async (_req, res) => {
      try { await this.runAppleScriptCommand('previous track'); res.json({ success: true }); }
      catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }); }
    });

    // Error handler
    this.app.use(errorHandler(this.logger));
  }

  // ============================================================================
  // SSE
  // ============================================================================

  private setupSSE(): void {
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
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(this.createEvent('connected', {}))}\n\n`);
    this.sseClients.add(res);
    req.on('close', () => { this.sseClients.delete(res); });
  }

  private broadcastEvent(type: string, payload: Record<string, unknown> = {}): void {
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

  // ============================================================================
  // Command Handlers — with per-type payload validation
  // ============================================================================

  private async handleCommand(command: Command): Promise<{ success: boolean; sessionId?: string }> {
    await this.store.logEvent('command', { type: command.type, commandId: command.id });

    switch (command.type) {
      case 'session.start': {
        // Validate payload has a policy
        const payloadResult = SessionStartCommand.safeParse(command.payload || {});
        if (!payloadResult.success) {
          throw new Error(`Invalid session.start payload: ${payloadResult.error.issues.map(i => i.message).join(', ')}`);
        }
        return this.startSession(payloadResult.data.policy);
      }

      case 'session.stop':
        return this.stopSession();

      case 'session.nudge': {
        const nudgeResult = SessionNudgeCommand.safeParse(command.payload || {});
        if (!nudgeResult.success) {
          throw new Error(`Invalid session.nudge payload: ${nudgeResult.error.issues.map(i => i.message).join(', ')}`);
        }
        return this.nudgeSession(nudgeResult.data.direction, nudgeResult.data.amount);
      }

      case 'skip':
        return this.skipTrack((command.payload as Record<string, unknown>)?.reason as string | undefined);

      case 'auth.spotify.login':
      case 'auth.spotify.logout':
      case 'auth.apple.login':
      case 'auth.apple.logout':
      case 'auth.youtube.login':
      case 'auth.youtube.logout':
      case 'device.use':
      case 'device.discover':
        throw new Error(`Command type '${command.type}' not yet implemented via command endpoint — use dedicated endpoints`);

      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  // Wire to ENGINE — the real session management
  private async startSession(policy: SessionPolicy): Promise<{ success: boolean; sessionId: string }> {
    // Delegate to the engine
    await this.engine.start(policy);

    const state = this.engine.getState();
    const sessionId = state?.id || 'unknown';

    this.broadcastEvent('session.started', {
      sessionId,
      policy,
      startedAt: Date.now(),
    });

    // Start track change polling
    this.startTrackPolling();

    return { success: true, sessionId };
  }

  private async stopSession(): Promise<{ success: boolean }> {
    const state = this.engine.getState();
    if (!state) throw new Error('No active session');

    const sessionId = state.id;
    const elapsed = Date.now() - state.startedAt;

    await this.engine.stop();
    this.stopTrackPolling();

    this.broadcastEvent('session.stopped', { sessionId, duration: elapsed });

    return { success: true };
  }

  private async nudgeSession(
    direction: 'calmer' | 'sharper',
    amount?: number
  ): Promise<{ success: boolean }> {
    await this.engine.nudge(direction, amount);

    const state = this.engine.getState();
    this.broadcastEvent('session.nudged', {
      sessionId: state?.id,
      direction,
      amount: amount || 0.1,
    });

    return { success: true };
  }

  private async skipTrack(reason?: string): Promise<{ success: boolean }> {
    const state = this.engine.getState();
    if (!state) throw new Error('No active session');

    await this.spotifyClient.next();
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
        const track = await this.playback.getNowPlaying();
        if (track && track.id !== this.lastTrackId) {
          this.lastTrackId = track.id;
          await this.engine.recordPlay(track);
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
  // Apple Music (AppleScript) — injection-safe
  // ============================================================================

  private ensureAppleScriptAvailable(): void {
    if (process.platform !== 'darwin') {
      throw new Error('AppleScript playback is only supported on macOS.');
    }
  }

  /** Escape a string for safe embedding in AppleScript double-quoted strings.
   *  Strips control characters (newlines, tabs, etc.) that can break out of string context. */
  private escapeAppleScriptString(value: string): string {
    // Strip ALL control characters (prevents \n, \r, \t injection)
    const sanitized = value.replace(/[\x00-\x1f\x7f]/g, '');
    // Escape backslashes and quotes
    return sanitized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private async runAppleScript(script: string): Promise<void> {
    this.ensureAppleScriptAvailable();
    await execFileAsync('osascript', ['-e', script]);
  }

  private async runAppleScriptCommand(command: string): Promise<void> {
    await this.runAppleScript(`tell application "Music" to ${command}`);
  }

  private async playAppleMusic(url?: string): Promise<void> {
    if (url) {
      // Validate URL protocol — only allow music-related URLs
      try {
        const parsed = new URL(url);
        if (!['https:', 'http:', 'music:'].includes(parsed.protocol)) {
          throw new Error('URL must use https, http, or music protocol');
        }
      } catch (e) {
        if (e instanceof TypeError) throw new Error('Invalid URL');
        throw e;
      }
      const escaped = this.escapeAppleScriptString(url);
      await this.runAppleScript(`tell application "Music"\n  activate\n  open location "${escaped}"\nend tell`);
      return;
    }
    await this.runAppleScriptCommand('play');
  }

  // ============================================================================
  // Status
  // ============================================================================

  private getStatus(): DaemonStatus {
    const engineState = this.engine.getState();
    return {
      isRunning: this.server !== null,
      version: '0.0.0',
      spotifyConnected: this.spotifyAuth.isConnected(),
      providers: {
        spotify: { connected: this.spotifyAuth.isConnected(), name: 'Spotify' },
        apple: { connected: !!this.appleMusicClient, name: 'Apple Music' },
      },
      session: engineState
        ? {
            id: engineState.id,
            isActive: engineState.status === 'running',
            currentTrack: engineState.currentTrack || null,
            queueDepth: engineState.queuedTracks.length,
            policy: engineState.policy,
            elapsedMs: Date.now() - engineState.startedAt,
            startedAt: engineState.startedAt,
          }
        : undefined,
    };
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

    // Stop track polling
    this.stopTrackPolling();

    // Stop engine (clears refill interval)
    try { await this.engine.stop(); } catch { /* no session active is fine */ }

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
      await Promise.race([
        new Promise<void>((resolve) => { this.server!.close(() => resolve()); }),
        new Promise<void>((resolve) => setTimeout(() => {
          this.logger.warn('Shutdown timeout — forcing close');
          resolve();
        }, SHUTDOWN_TIMEOUT_MS)),
      ]);
      this.server = null;
    }

    // Close store
    await this.store.close();

    // Destroy encryptor (zero sensitive state)
    this.encryptor?.destroy();
  }

  // ============================================================================
  // Auth middleware — HMAC-based timing-safe comparison
  // ============================================================================

  private requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/auth/spotify/callback') { next(); return; }

    if (process.env.NODE_ENV === 'production' && !this.apiToken) {
      res.status(500).json({ success: false, error: 'Server misconfigured' });
      return;
    }

    if (!this.apiToken) { next(); return; }

    const authHeader = req.header('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    // HMAC both values to fixed-length, then compare — no length oracle
    const hmacKey = 'harmon-auth-compare';
    const expectedMac = createHmac('sha256', hmacKey).update(this.apiToken).digest();
    const providedMac = createHmac('sha256', hmacKey).update(token).digest();

    // timingSafeEqual on equal-length HMACs — no length leak
    const { timingSafeEqual } = require('node:crypto');
    if (!timingSafeEqual(expectedMac, providedMac)) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    next();
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
          return JSON.parse(decrypted) as SpotifyTokens;
        } catch { return null; }
      },
      set: async (tokens) => {
        if (!tokens) { await this.store.deleteSetting('spotify.tokens'); return; }
        const json = JSON.stringify(tokens);
        const value = this.encryptor ? this.encryptor.encrypt(json) : json;
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
          return JSON.parse(decrypted) as SpotifyCookieRecord[];
        } catch { return null; }
      },
      set: async (cookies) => {
        if (!cookies || cookies.length === 0) { await this.store.deleteSetting('spotify.cookies'); return; }
        const json = JSON.stringify(cookies);
        const value = this.encryptor ? this.encryptor.encrypt(json) : json;
        await this.store.setSetting('spotify.cookies', value);
      },
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

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

  private parseSearchTypes(value: string): Array<'track' | 'album' | 'artist' | 'playlist'> {
    const allowed = new Set(['track', 'album', 'artist', 'playlist']);
    return value.split(',').map(e => e.trim()).filter(e => allowed.has(e)) as Array<'track' | 'album' | 'artist' | 'playlist'>;
  }

  private parseAppleSearchTypes(value: string): Array<'songs' | 'albums' | 'artists' | 'playlists'> {
    const allowed = new Set(['songs', 'albums', 'artists', 'playlists']);
    return value.split(',').map(e => e.trim()).filter(e => allowed.has(e)) as Array<'songs' | 'albums' | 'artists' | 'playlists'>;
  }

  private getAppleMusicClient(): AppleMusicClient {
    if (!this.appleMusicClient) throw new Error('Apple Music not configured (set APPLE_MUSIC_DEVELOPER_TOKEN).');
    return this.appleMusicClient;
  }

  getStore(): HarmonStore {
    return this.store;
  }
}

export function createDaemon(config?: DaemonConfig): Harmond {
  return new Harmond(config);
}

// Run as standalone
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  const daemon = createDaemon();
  daemon.start().then(() => {
    console.log(`Harmond listening on http://127.0.0.1:${DEFAULT_PORT}`);
  }).catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });

  const shutdown = async () => {
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
