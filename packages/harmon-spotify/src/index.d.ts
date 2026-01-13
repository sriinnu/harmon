/**
 * Harmon Spotify - Spotify API client, OAuth, and device control
 */
import type { DeviceInfo, TrackInfo } from '../harmon-protocol/dist/index.js';
export interface SpotifyClient {
    isConnected(): boolean;
    getDevices(): Promise<DeviceInfo[]>;
    transferTo(deviceId: string): Promise<void>;
    play(trackUri: string): Promise<void>;
    pause(): Promise<void>;
    next(): Promise<void>;
    getNowPlaying(): Promise<TrackInfo | null>;
    addToQueue(trackUri: string): Promise<void>;
}
export declare function createSpotifyClient(): SpotifyClient;
export interface SpotifyAuth {
    getLoginUrl(): string;
    handleCallback(code: string): Promise<void>;
    refresh(): Promise<void>;
    logout(): void;
    getAccessToken(): string | null;
}
//# sourceMappingURL=index.d.ts.map