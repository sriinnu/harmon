/**
 * Harmond - The Harmon daemon with HTTP+SSE API
 */
import { HarmonStore } from '../../packages/harmon-store/dist/index.js';
interface DaemonConfig {
    port?: number;
    dbPath?: string;
    enableSSE?: boolean;
}
export declare class Harmond {
    private app;
    private store;
    private port;
    private session;
    private sseClients;
    private server;
    constructor(config?: DaemonConfig);
    private setupMiddleware;
    private setupRoutes;
    private setupSSE;
    private setupSSEClient;
    private broadcastEvent;
    private createEvent;
    private handleCommand;
    private startSession;
    private stopSession;
    private nudgeSession;
    private skipTrack;
    private getDevices;
    private useDevice;
    private getSpotifyAuthUrl;
    private logoutSpotify;
    private getStatus;
    /**
     * Start the daemon
     */
    start(): Promise<void>;
    /**
     * Stop the daemon
     */
    stop(): Promise<void>;
    /**
     * Get the store instance
     */
    getStore(): HarmonStore;
}
/**
 * Create a daemon with default configuration
 */
export declare function createDaemon(config?: DaemonConfig): Harmond;
export {};
//# sourceMappingURL=index.d.ts.map