/**
 * Harmond - The Harmon daemon with HTTP+SSE API
 */
import express from 'express';
import { createStore } from '../../packages/harmon-store/dist/index.js';
import { v4 as uuidv4 } from 'uuid';
// ============================================================================
// Configuration
// ============================================================================
const DEFAULT_PORT = 17373;
const DEFAULT_DB_PATH = '.harmon.db';
const SSE_HEARTBEAT_MS = 30000;
// ============================================================================
// Harmond Implementation
// ============================================================================
export class Harmond {
    app;
    store;
    port;
    session = null;
    sseClients = new Set();
    server = null;
    constructor(config = {}) {
        this.port = config.port || DEFAULT_PORT;
        this.app = express();
        this.store = createStore({ dbPath: config.dbPath });
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSSE();
    }
    setupMiddleware() {
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
    setupRoutes() {
        // Health check
        this.app.get('/health', (_req, res) => {
            res.json({ status: 'ok', version: '0.0.0', timestamp: new Date().toISOString() });
        });
        // Status endpoint
        this.app.get('/v1/status', (_req, res) => {
            const status = this.getStatus();
            res.json(status);
        });
        // Devices endpoint
        this.app.get('/v1/devices', async (_req, res) => {
            const devices = await this.getDevices();
            res.json(devices);
        });
        // Command endpoint
        this.app.post('/v1/command', async (req, res) => {
            try {
                const command = req.body;
                const result = await this.handleCommand(command);
                res.json(result);
            }
            catch (error) {
                res.status(400).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
        // Device use endpoint
        this.app.post('/v1/device/use', async (req, res) => {
            try {
                const { deviceId } = req.body;
                await this.useDevice(deviceId);
                res.json({ success: true });
            }
            catch (error) {
                res.status(400).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
        // Auth endpoints
        this.app.post('/v1/auth/spotify/login', (_req, res) => {
            res.json({ url: this.getSpotifyAuthUrl() });
        });
        this.app.post('/v1/auth/spotify/logout', async (_req, res) => {
            await this.logoutSpotify();
            res.json({ success: true });
        });
        // Journal endpoints
        this.app.get('/v1/journal', async (req, res) => {
            const limit = parseInt(req.query.limit) || 50;
            const entries = await this.store.getJournalEntries(limit);
            res.json(entries);
        });
        this.app.post('/v1/journal', async (req, res) => {
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
        this.app.get('/v1/events', (req, res) => {
            this.setupSSEClient(req, res);
        });
        // Stats endpoint
        this.app.get('/v1/stats', async (_req, res) => {
            const stats = await this.store.getStats();
            res.json(stats);
        });
    }
    setupSSE() {
        // Heartbeat to keep connections alive
        setInterval(() => {
            const event = this.createEvent('heartbeat', { timestamp: new Date().toISOString() });
            const message = `data: ${JSON.stringify(event)}\n\n`;
            for (const client of this.sseClients) {
                try {
                    client.write(message);
                }
                catch {
                    this.sseClients.delete(client);
                }
            }
        }, SSE_HEARTBEAT_MS);
    }
    setupSSEClient(req, res) {
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
    broadcastEvent(type, payload = {}) {
        const event = this.createEvent(type, payload);
        const message = `data: ${JSON.stringify(event)}\n\n`;
        for (const client of this.sseClients) {
            try {
                client.write(message);
            }
            catch {
                this.sseClients.delete(client);
            }
        }
    }
    createEvent(type, payload = {}) {
        return {
            id: `e_${uuidv4().slice(0, 8)}`,
            ts: Date.now(),
            type: type,
            payload,
        };
    }
    // ============================================================================
    // Command Handlers
    // ============================================================================
    async handleCommand(command) {
        await this.store.logEvent('command', { type: command.type, commandId: command.id }, this.session?.id);
        switch (command.type) {
            case 'session.start':
                return this.startSession(command.payload.policy);
            case 'session.stop':
                return this.stopSession();
            case 'session.nudge':
                return this.nudgeSession(command.payload.direction, command.payload.amount);
            case 'skip':
                return this.skipTrack(command.payload.reason);
            default:
                throw new Error(`Unknown command type: ${command.type}`);
        }
    }
    async startSession(policy) {
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
    async stopSession() {
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
    async nudgeSession(direction, amount) {
        if (!this.session) {
            throw new Error('No active session');
        }
        const nudgeAmount = amount || 0.1;
        const sign = direction === 'calmer' ? -1 : 1;
        // Update soft weights
        const weights = this.session.policy.soft?.weights || {};
        if (weights.energy)
            weights.energy = Math.max(0, Math.min(1, weights.energy + sign * nudgeAmount));
        if (weights.valence)
            weights.valence = Math.max(0, Math.min(1, weights.valence + sign * nudgeAmount * 0.5));
        this.broadcastEvent('session.nudged', {
            sessionId: this.session.id,
            direction,
            amount: nudgeAmount,
            newWeights: weights,
        });
        return { success: true, newWeights: weights };
    }
    async skipTrack(reason) {
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
    async getDevices() {
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
    async useDevice(deviceId) {
        await this.store.logEvent('device.use', { deviceId }, this.session?.id);
        this.broadcastEvent('device.changed', { deviceId });
    }
    getSpotifyAuthUrl() {
        return 'https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost:17373/v1/auth/spotify/callback';
    }
    async logoutSpotify() {
        this.broadcastEvent('spotify.disconnected', {});
    }
    // ============================================================================
    // Status
    // ============================================================================
    getStatus() {
        return {
            isRunning: this.server !== null,
            version: '0.0.0',
            spotifyConnected: false,
            session: this.session
                ? {
                    id: this.session.id,
                    isActive: this.session.status === 'running',
                    policy: this.session.policy,
                    currentTrack: this.session.currentTrack || null,
                    queueDepth: this.session.queue.length,
                    elapsedMs: Date.now() - this.session.startedAt.getTime(),
                    startedAt: this.session.startedAt.getTime(),
                }
                : null,
        };
    }
    // ============================================================================
    // Server Lifecycle
    // ============================================================================
    /**
     * Start the daemon
     */
    async start() {
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
    async stop() {
        // Close SSE clients
        for (const client of this.sseClients) {
            client.end();
        }
        this.sseClients.clear();
        // Stop server
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(() => resolve());
            });
            this.server = null;
        }
        // Close store
        await this.store.close();
    }
    /**
     * Get the store instance
     */
    getStore() {
        return this.store;
    }
}
/**
 * Create a daemon with default configuration
 */
export function createDaemon(config) {
    return new Harmond(config);
}
// Run as standalone server
if (import.meta.url === `file://${process.argv[1]}`) {
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
//# sourceMappingURL=index.js.map