/**
 * Harmond - The Harmon daemon with HTTP+SSE API
 */

import express, { Request, Response, NextFunction } from 'express';
import { createStore, HarmonStore } from '@athena/harmon-store';
import { v4 as uuidv4 } from 'uuid';
import { pathToFileURL } from 'node:url';
import {
  parseCommandSafe,
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
  type SpotifyAuth,
  type SpotifyClient,
  type SpotifyTokens,
  type TokenStore,
} from '@athena/harmon-spotify';
import { createAppleMusicClient, type AppleMusicClient } from '@athena/harmon-apple';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_PORT = 17373;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DB_PATH = '.harmon.db';
const SSE_HEARTBEAT_MS = 30000;

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
// Session State
// ============================================================================

interface SessionState {
  id: string;
  policy: SessionPolicy;
  startedAt: Date;
  currentTrack?: TrackInfo;
  queue: TrackInfo[];
  status: 'idle' | 'running' | 'paused';
}

// ============================================================================
// Harmond Implementation
// ============================================================================

export class Harmond {
  private app: express.Application;
  private store: HarmonStore;
  private spotifyAuth: SpotifyAuth;
  private spotifyClient: SpotifyClient;
  private appleMusicClient?: AppleMusicClient;
  private port: number;
  private host: string;
  private apiToken?: string;
  private corsOrigins: Set<string>;
  private allowAllOrigins = false;
  private session: SessionState | null = null;
  private sseClients: Set<Response> = new Set();
  private server: ReturnType<express.Application['listen']> | null = null;
  private sseHeartbeat: ReturnType<typeof setInterval> | null = null;

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

    this.app = express();
    this.store = createStore({ dbPath: config.dbPath || envDbPath || DEFAULT_DB_PATH });
    const redirectUri =
      process.env.SPOTIFY_REDIRECT_URI ||
      `http://${this.host}:${this.port}/v1/auth/spotify/callback`;
    this.spotifyAuth = createSpotifyAuth({
      clientId: process.env.SPOTIFY_CLIENT_ID || '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri,
      tokenStore: this.createSpotifyTokenStore(),
    });
    this.spotifyClient = createSpotifyClient({ auth: this.spotifyAuth });

    const appleDeveloperToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    if (appleDeveloperToken) {
      this.appleMusicClient = createAppleMusicClient({
        developerToken: appleDeveloperToken,
        userToken: process.env.APPLE_MUSIC_USER_TOKEN,
        storefront: process.env.APPLE_MUSIC_STOREFRONT || 'us',
      });
    }

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSSE();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // CORS for browser clients
    this.app.use((req, res, next) => {
      const origin = req.header('origin');
      const originAllowed = this.isOriginAllowed(origin);

      if (originAllowed) {
        res.header('Access-Control-Allow-Origin', this.allowAllOrigins ? '*' : origin!);
        if (!this.allowAllOrigins) {
          res.header('Vary', 'Origin');
        }
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }

      if (req.method === 'OPTIONS') {
        if (origin && !originAllowed) {
          res.sendStatus(403);
          return;
        }
        if (originAllowed) {
          res.sendStatus(204);
          return;
        }
      }
      next();
    });
  }

  private setupRoutes(): void {
    this.app.use('/v1', this.requireAuth.bind(this));

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', version: '0.0.0', timestamp: new Date().toISOString() });
    });

    // Status endpoint
    this.app.get('/v1/status', (_req: Request, res: Response) => {
      const status = this.getStatus();
      res.json(status);
    });

    // Devices endpoint
    this.app.get('/v1/devices', async (_req: Request, res: Response) => {
      try {
        const devices = await this.getDevices();
        res.json(devices);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Command endpoint
    this.app.post('/v1/command', async (req: Request, res: Response) => {
      try {
        const parsed = parseCommandSafe(req.body);
        if (!parsed.success) {
          res.status(400).json({
            success: false,
            error: 'Invalid command',
            issues: parsed.error.issues,
          });
          return;
        }
        const command = parsed.data;
        const result = await this.handleCommand(command);
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Device use endpoint
    this.app.post('/v1/device/use', async (req: Request, res: Response) => {
      try {
        const { deviceId } = req.body;
        if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
          res.status(400).json({ success: false, error: 'Invalid deviceId' });
          return;
        }
        await this.useDevice(deviceId);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Auth endpoints
    this.app.post('/v1/auth/spotify/login', (_req: Request, res: Response) => {
      try {
        res.json({ url: this.getSpotifyAuthUrl() });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/auth/spotify/callback', async (req: Request, res: Response) => {
      try {
        const code = req.query.code as string | undefined;
        const state = req.query.state as string | undefined;
        if (!code) {
          res.status(400).send('Missing code.');
          return;
        }
        await this.spotifyAuth.handleCallback(code, state);
        this.broadcastEvent('spotify.connected', {});
        res.status(200).send('Spotify connected. You can close this window.');
      } catch (error) {
        res.status(400).send(error instanceof Error ? error.message : 'Spotify auth failed.');
      }
    });

    this.app.post('/v1/auth/spotify/logout', async (_req: Request, res: Response) => {
      try {
        await this.logoutSpotify();
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Journal endpoints
    this.app.get('/v1/journal', async (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const entries = await this.store.getJournalEntries(limit);
      res.json(entries);
    });

    this.app.post('/v1/journal', async (req: Request, res: Response) => {
      const entry = req.body;
      if (!entry || typeof entry !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid journal entry' });
        return;
      }
      if (entry.moodTags && !Array.isArray(entry.moodTags)) {
        res.status(400).json({ success: false, error: 'moodTags must be an array' });
        return;
      }
      const id = await this.store.addJournalEntry({
        filename: `api-${uuidv4()}.md`,
        timestamp: new Date().toISOString(),
        source: entry.source || 'cli',
        device: entry.device || 'linux',
        moodTags: Array.isArray(entry.moodTags) ? entry.moodTags.join(', ') : '',
        energyLevel: entry.energyLevel,
        context: entry.context ? JSON.stringify(entry.context) : undefined,
        content: entry.content || '',
        policy: entry.policy ? JSON.stringify(entry.policy) : undefined,
      });
      res.json({ id, success: true });
    });

    // Events endpoint (SSE)
    this.app.get('/v1/events', (req: Request, res: Response) => {
      this.setupSSEClient(req, res);
    });

    // Stats endpoint
    this.app.get('/v1/stats', async (_req: Request, res: Response) => {
      const stats = await this.store.getStats();
      res.json(stats);
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
        if (types.length === 0) {
          res.status(400).json({ success: false, error: 'Invalid search types' });
          return;
        }

        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const result = await this.spotifyClient.search(query, types, { limit, offset });
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Spotify playlists
    this.app.get('/v1/spotify/playlists', async (req: Request, res: Response) => {
      try {
        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const result = await this.spotifyClient.getPlaylists({ limit, offset });
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/spotify/playlists/:id/tracks', async (req: Request, res: Response) => {
      try {
        const playlistId = this.parseRouteParam(req.params.id);
        if (!playlistId) {
          res.status(400).json({ success: false, error: 'Missing playlist id' });
          return;
        }
        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const result = await this.spotifyClient.getPlaylistTracks(playlistId, { limit, offset });
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Spotify history
    this.app.get('/v1/spotify/history', async (req: Request, res: Response) => {
      try {
        const limit = this.parseNumberParam(req.query.limit);
        const after = this.parseNumberParam(req.query.after);
        const before = this.parseNumberParam(req.query.before);
        const result = await this.spotifyClient.getRecentlyPlayed({ limit, after, before });
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Spotify library
    this.app.get('/v1/spotify/library/tracks', async (req: Request, res: Response) => {
      try {
        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const result = await this.spotifyClient.getSavedTracks({ limit, offset });
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/spotify/library/albums', async (req: Request, res: Response) => {
      try {
        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const result = await this.spotifyClient.getSavedAlbums({ limit, offset });
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Apple Music search
    this.app.get('/v1/apple/search', async (req: Request, res: Response) => {
      try {
        const client = this.getAppleMusicClient();
        const query = req.query.q;
        if (typeof query !== 'string' || query.trim().length === 0) {
          res.status(400).json({ success: false, error: 'Missing query (q)' });
          return;
        }

        const typeParam = typeof req.query.type === 'string' ? req.query.type : 'songs';
        const types = this.parseAppleSearchTypes(typeParam);
        if (types.length === 0) {
          res.status(400).json({ success: false, error: 'Invalid search types' });
          return;
        }

        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const result = await client.search(query, types, { limit, offset });
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/apple/songs/:id', async (req: Request, res: Response) => {
      try {
        const client = this.getAppleMusicClient();
        const songId = this.parseRouteParam(req.params.id);
        if (!songId) {
          res.status(400).json({ success: false, error: 'Missing song id' });
          return;
        }
        const song = await client.getSong(songId);
        res.json(song);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/apple/albums/:id', async (req: Request, res: Response) => {
      try {
        const client = this.getAppleMusicClient();
        const albumId = this.parseRouteParam(req.params.id);
        if (!albumId) {
          res.status(400).json({ success: false, error: 'Missing album id' });
          return;
        }
        const album = await client.getAlbum(albumId);
        res.json(album);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/apple/artists/:id', async (req: Request, res: Response) => {
      try {
        const client = this.getAppleMusicClient();
        const artistId = this.parseRouteParam(req.params.id);
        if (!artistId) {
          res.status(400).json({ success: false, error: 'Missing artist id' });
          return;
        }
        const artist = await client.getArtist(artistId);
        res.json(artist);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/apple/playlists/:id', async (req: Request, res: Response) => {
      try {
        const client = this.getAppleMusicClient();
        const playlistId = this.parseRouteParam(req.params.id);
        if (!playlistId) {
          res.status(400).json({ success: false, error: 'Missing playlist id' });
          return;
        }
        const playlist = await client.getPlaylist(playlistId);
        res.json(playlist);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/apple/library/songs', async (req: Request, res: Response) => {
      try {
        const client = this.getAppleMusicClient();
        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const songs = await client.getLibrarySongs({ limit, offset });
        res.json(songs);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/apple/library/albums', async (req: Request, res: Response) => {
      try {
        const client = this.getAppleMusicClient();
        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const albums = await client.getLibraryAlbums({ limit, offset });
        res.json(albums);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/v1/apple/library/playlists', async (req: Request, res: Response) => {
      try {
        const client = this.getAppleMusicClient();
        const limit = this.parseNumberParam(req.query.limit);
        const offset = this.parseNumberParam(req.query.offset);
        const playlists = await client.getLibraryPlaylists({ limit, offset });
        res.json(playlists);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  private setupSSE(): void {
    // Heartbeat to keep connections alive
    this.sseHeartbeat = setInterval(() => {
      const event = this.createEvent('heartbeat', { timestamp: new Date().toISOString() });
      const message = `data: ${JSON.stringify(event)}\n\n`;

      for (const client of this.sseClients) {
        try {
          client.write(message);
        } catch {
          this.sseClients.delete(client);
        }
      }
    }, SSE_HEARTBEAT_MS);
  }

  private setupSSEClient(req: Request, res: Response): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial connection event
    res.write(`data: ${JSON.stringify(this.createEvent('connected', { timestamp: new Date().toISOString() }))}\n\n`);

    // Track client
    this.sseClients.add(res);

    // Remove client on close
    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private broadcastEvent(type: string, payload: Record<string, unknown> = {}): void {
    const event = this.createEvent(type, payload);
    const message = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch {
        this.sseClients.delete(client);
      }
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
  // Command Handlers
  // ============================================================================

  private async handleCommand(command: Command): Promise<{ success: boolean; sessionId?: string }> {
    await this.store.logEvent('command', { type: command.type, commandId: command.id }, this.session?.id);

    switch (command.type) {
      case 'session.start':
        return this.startSession((command.payload as { policy: SessionPolicy }).policy);

      case 'session.stop':
        return this.stopSession();

      case 'session.nudge':
        return this.nudgeSession(
          (command.payload as { direction: 'calmer' | 'sharper' }).direction,
          (command.payload as { amount?: number }).amount
        );

      case 'skip':
        return this.skipTrack((command.payload as { reason?: string }).reason);

      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  private async startSession(policy: SessionPolicy): Promise<{ success: boolean; sessionId: string }> {
    // Create session in store
    const sessionId = await this.store.createSession(JSON.stringify(policy));

    // Start local session
    this.session = {
      id: sessionId,
      policy,
      startedAt: new Date(),
      queue: [],
      status: 'running',
    };

    // Emit event
    this.broadcastEvent('session.started', {
      sessionId,
      policy,
      startedAt: this.session.startedAt.toISOString(),
    });

    return { success: true, sessionId };
  }

  private async stopSession(): Promise<{ success: boolean }> {
    if (!this.session) {
      throw new Error('No active session');
    }

    await this.store.endSession(this.session.id);

    this.broadcastEvent('session.stopped', {
      sessionId: this.session.id,
      duration: Date.now() - this.session.startedAt.getTime(),
    });

    this.session = null;

    return { success: true };
  }

  private async nudgeSession(
    direction: 'calmer' | 'sharper',
    amount?: number
  ): Promise<{ success: boolean; newWeights?: Record<string, number> }> {
    if (!this.session) {
      throw new Error('No active session');
    }

    const nudgeAmount = amount || 0.1;
    const sign = direction === 'calmer' ? -1 : 1;

    // Update soft weights
    const currentSoft = this.session.policy.soft || {};
    const weights = { ...(currentSoft.weights || {}) };
    if (typeof weights.energy === 'number') {
      weights.energy = Math.max(0, Math.min(1, weights.energy + sign * nudgeAmount));
    }
    if (typeof weights.valence === 'number') {
      weights.valence = Math.max(0, Math.min(1, weights.valence + sign * nudgeAmount * 0.5));
    }
    this.session.policy.soft = { ...currentSoft, weights };

    this.broadcastEvent('session.nudged', {
      sessionId: this.session.id,
      direction,
      amount: nudgeAmount,
      newWeights: weights,
    });

    return { success: true, newWeights: weights as Record<string, number> };
  }

  private async skipTrack(reason?: string): Promise<{ success: boolean }> {
    if (!this.session) {
      throw new Error('No active session');
    }

    await this.store.logEvent('skip', { reason, sessionId: this.session.id }, this.session.id);

    this.broadcastEvent('track.skipped', {
      sessionId: this.session.id,
      reason,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }

  // ============================================================================
  // Spotify Integration (placeholder)
  // ============================================================================

  private async getDevices(): Promise<DeviceInfo[]> {
    return this.spotifyClient.getDevices();
  }

  private async useDevice(deviceId: string): Promise<void> {
    await this.spotifyClient.transferTo(deviceId);
    await this.store.logEvent('device.use', { deviceId }, this.session?.id);
    this.broadcastEvent('device.changed', { deviceId });
  }

  private getSpotifyAuthUrl(): string {
    return this.spotifyAuth.getLoginUrl();
  }

  private async logoutSpotify(): Promise<void> {
    await this.spotifyAuth.logout();
    this.broadcastEvent('spotify.disconnected', {});
  }

  // ============================================================================
  // Status
  // ============================================================================

  private getStatus(): DaemonStatus {
    return {
      isRunning: this.server !== null,
      version: '0.0.0',
      spotifyConnected: this.spotifyAuth.isConnected(),
      session: this.session
        ? {
            id: this.session.id,
            isActive: this.session.status === 'running',
            currentTrack: this.session.currentTrack || null,
            queueDepth: this.session.queue.length,
            policy: this.session.policy,
            elapsedMs: Date.now() - this.session.startedAt.getTime(),
            startedAt: this.session.startedAt.getTime(),
          }
        : undefined,
    };
  }

  // ============================================================================
  // Server Lifecycle
  // ============================================================================

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    await this.store.migrate();
    await this.spotifyAuth.loadTokens();

    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        console.log(`Harmond listening on http://${this.host}:${this.port}`);
        console.log('Endpoints:');
        console.log('  GET  /health              - Health check');
        console.log('  GET  /v1/status           - Daemon status');
        console.log('  GET  /v1/devices          - Spotify devices');
        console.log('  POST /v1/command          - Send command');
        console.log('  POST /v1/device/use       - Switch device');
        console.log('  GET  /v1/events           - SSE stream');
        console.log('  GET  /v1/journal          - List journal entries');
        console.log('  POST /v1/journal          - Add journal entry');
        console.log('  GET  /v1/stats            - Statistics');
        resolve();
      });
    });
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    // Close SSE clients
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();
    if (this.sseHeartbeat) {
      clearInterval(this.sseHeartbeat);
      this.sseHeartbeat = null;
    }

    // Stop server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    // Close store
    await this.store.close();
  }

  /**
   * Get the store instance
   */
  getStore(): HarmonStore {
    return this.store;
  }

  private createSpotifyTokenStore(): TokenStore {
    return {
      get: async () => {
        const raw = await this.store.getSetting('spotify.tokens');
        if (!raw) return null;
        try {
          return JSON.parse(raw) as SpotifyTokens;
        } catch {
          return null;
        }
      },
      set: async (tokens) => {
        if (!tokens) {
          await this.store.deleteSetting('spotify.tokens');
          return;
        }
        await this.store.setSetting('spotify.tokens', JSON.stringify(tokens));
      },
    };
  }

  private parseNumberParam(value: unknown): number | undefined {
    if (typeof value !== 'string') return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parseSearchTypes(value: string): Array<'track' | 'album' | 'artist' | 'playlist'> {
    const allowed = new Set(['track', 'album', 'artist', 'playlist']);
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => allowed.has(entry)) as Array<'track' | 'album' | 'artist' | 'playlist'>;
  }

  private parseAppleSearchTypes(value: string): Array<'songs' | 'albums' | 'artists' | 'playlists'> {
    const allowed = new Set(['songs', 'albums', 'artists', 'playlists']);
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => allowed.has(entry)) as Array<'songs' | 'albums' | 'artists' | 'playlists'>;
  }

  private parseRouteParam(value: string | string[] | undefined): string | null {
    if (!value) return null;
    return Array.isArray(value) ? value[0] : value;
  }

  private isOriginAllowed(origin?: string): boolean {
    if (!origin) return false;
    return this.allowAllOrigins || this.corsOrigins.has(origin);
  }

  private requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/auth/spotify/callback') {
      next();
      return;
    }

    if (!this.apiToken) {
      next();
      return;
    }

    const authHeader = req.header('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token !== this.apiToken) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    next();
  }

  private getAppleMusicClient(): AppleMusicClient {
    if (!this.appleMusicClient) {
      throw new Error('Apple Music is not configured (missing APPLE_MUSIC_DEVELOPER_TOKEN).');
    }
    return this.appleMusicClient;
  }
}

/**
 * Create a daemon with default configuration
 */
export function createDaemon(config?: DaemonConfig): Harmond {
  return new Harmond(config);
}

// Run as standalone server
// For ESM, this code runs when the file is executed directly
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  const daemon = createDaemon();
  daemon.start().catch(console.error);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await daemon.stop();
    process.exit(0);
  });
}
