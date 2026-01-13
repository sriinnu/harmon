/**
 * Harmond - The Harmon daemon with HTTP+SSE API
 */

import express, { Request, Response } from 'express';
import { createStore, HarmonStore } from '@athena/harmon-store';
import { v4 as uuidv4 } from 'uuid';
import type {
  SessionPolicy,
  Command,
  Event,
  DaemonStatus,
  DeviceInfo,
  TrackInfo,
} from '@athena/harmon-protocol';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_PORT = 17373;
const DEFAULT_DB_PATH = '.harmon.db';
const SSE_HEARTBEAT_MS = 30000;

interface DaemonConfig {
  port?: number;
  dbPath?: string;
  enableSSE?: boolean;
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
  private port: number;
  private session: SessionState | null = null;
  private sseClients: Set<Response> = new Set();
  private server: ReturnType<express.Application['listen']> | null = null;

  constructor(config: DaemonConfig = {}) {
    this.port = config.port || DEFAULT_PORT;
    this.app = express();
    this.store = createStore({ dbPath: config.dbPath });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSSE();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // CORS for local development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });
  }

  private setupRoutes(): void {
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
      const devices = await this.getDevices();
      res.json(devices);
    });

    // Command endpoint
    this.app.post('/v1/command', async (req: Request, res: Response) => {
      try {
        const command = req.body as Command;
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
      res.json({ url: this.getSpotifyAuthUrl() });
    });

    this.app.post('/v1/auth/spotify/logout', async (_req: Request, res: Response) => {
      await this.logoutSpotify();
      res.json({ success: true });
    });

    // Journal endpoints
    this.app.get('/v1/journal', async (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const entries = await this.store.getJournalEntries(limit);
      res.json(entries);
    });

    this.app.post('/v1/journal', async (req: Request, res: Response) => {
      const entry = req.body;
      const id = await this.store.addJournalEntry({
        filename: `api-${uuidv4()}.md`,
        timestamp: new Date().toISOString(),
        source: entry.source || 'cli',
        device: entry.device || 'linux',
        moodTags: (entry.moodTags || []).join(', '),
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
  }

  private setupSSE(): void {
    // Heartbeat to keep connections alive
    setInterval(() => {
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
    res.setHeader('Access-Control-Allow-Origin', '*');
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
    const weights = this.session.policy.soft?.weights || {};
    if (weights.energy) weights.energy = Math.max(0, Math.min(1, weights.energy + sign * nudgeAmount));
    if (weights.valence) weights.valence = Math.max(0, Math.min(1, weights.valence + sign * nudgeAmount * 0.5));

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
    // Placeholder - would call Spotify API
    return [
      {
        id: 'device-1',
        name: 'MacBook Pro Speakers',
        type: 'computer',
        isActive: true,
        volumePercent: 50,
      },
    ];
  }

  private async useDevice(deviceId: string): Promise<void> {
    await this.store.logEvent('device.use', { deviceId }, this.session?.id);
    this.broadcastEvent('device.changed', { deviceId });
  }

  private getSpotifyAuthUrl(): string {
    return 'https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost:17373/v1/auth/spotify/callback';
  }

  private async logoutSpotify(): Promise<void> {
    this.broadcastEvent('spotify.disconnected', {});
  }

  // ============================================================================
  // Status
  // ============================================================================

  private getStatus(): DaemonStatus {
    return {
      isRunning: this.server !== null,
      version: '0.0.0',
      spotifyConnected: false,
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

    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Harmond listening on http://localhost:${this.port}`);
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
}

/**
 * Create a daemon with default configuration
 */
export function createDaemon(config?: DaemonConfig): Harmond {
  return new Harmond(config);
}

// Run as standalone server
// For ESM, this code runs when the file is executed directly
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
