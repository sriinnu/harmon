/**
 * Harmon Spotify - Spotify API client, OAuth, and device control
 */

// Placeholder types - will be imported from built harmon-protocol
type DeviceInfo = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  volumePercent?: number;
};

type TrackInfo = {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  uri?: string;
};

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

export function createSpotifyClient(): SpotifyClient {
  return {
    isConnected() { return false; },
    async getDevices() { return []; },
    async transferTo() {},
    async play() {},
    async pause() {},
    async next() {},
    async getNowPlaying() { return null; },
    async addToQueue() {},
  };
}

export interface SpotifyAuth {
  getLoginUrl(): string;
  handleCallback(code: string): Promise<void>;
  refresh(): Promise<void>;
  logout(): void;
  getAccessToken(): string | null;
}
