/**
 * lib/api.ts — HTTP client for the Harmon daemon
 */

export interface DaemonStatus {
  isRunning: boolean;
  version: string;
  spotifyConnected: boolean;
  providers?: Record<string, ProviderStatus>;
  session?: SessionInfo;
}

export interface ProviderStatus {
  connected: boolean;
  name?: string;
  status?: string;
  auth?: string;
  playbackMode?: string;
  capabilities?: Record<string, boolean>;
}

export interface SessionInfo {
  id: string;
  isActive: boolean;
  provider?: string;
  currentTrack?: TrackInfo | null;
  queueDepth: number;
  elapsedMs?: number;
  policy?: any;
}

export interface TrackInfo {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  uri?: string;
  provider?: string;
  imageUrl?: string;
}

export interface SmartPlayResult {
  success: boolean;
  provider?: string;
  track?: TrackInfo;
  needsAuth?: boolean;
  authUrl?: string;
  error?: string;
  alternateProviders?: Array<{ provider: string; track: TrackInfo }>;
  providerErrors?: Array<{ provider: string; error: string }>;
}

export class HarmonClient {
  constructor(private baseUrl: string, private token?: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) {
      // Only send token to HTTPS or loopback
      const url = new URL(this.baseUrl);
      const isSecure = url.protocol === 'https:' || ['127.0.0.1', '::1', 'localhost'].includes(url.hostname);
      if (isSecure) headers['Authorization'] = `Bearer ${this.token}`;
    }

    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, { ...options, headers: { ...headers, ...options?.headers } });
    } catch {
      throw new Error('Cannot reach daemon — check URL and ensure harmond is running.');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `${response.status} ${response.statusText}`);
    }

    if (response.status === 204) return null as T;
    try {
      return await response.json() as T;
    } catch {
      throw new Error(`Daemon returned invalid JSON (HTTP ${response.status})`);
    }
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  // Status
  async getStatus(): Promise<DaemonStatus> { return this.request('/v1/status'); }

  // Auth
  async spotifyLogin(): Promise<{ url: string }> { return this.post('/v1/auth/spotify/login'); }
  async spotifyLogout(): Promise<void> { return this.post('/v1/auth/spotify/logout'); }
  async youtubeLogin(): Promise<{ url: string }> { return this.post('/v1/auth/youtube/login'); }
  async youtubeLogout(): Promise<void> { return this.post('/v1/auth/youtube/logout'); }
  async appleSetToken(token: string): Promise<void> { return this.post('/v1/auth/apple/set-user-token', { token }); }
  async appleLogout(): Promise<void> { return this.post('/v1/auth/apple/logout'); }

  // Search (per provider)
  async search(provider: string, query: string, type = 'track', limit = 20): Promise<any> {
    return this.request(`/v1/${provider}/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`);
  }

  // Smart
  async smartPlay(query: string, provider?: string): Promise<SmartPlayResult> {
    return this.post('/v1/smart/play', { query, provider });
  }
  async smartSearch(query: string, limit = 5): Promise<any> {
    return this.request(`/v1/smart/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  // Playback
  async play(provider: string, options?: { uri?: string }): Promise<void> { return this.post(`/v1/${provider}/play`, options ?? {}); }
  async pause(provider: string): Promise<void> { return this.post(`/v1/${provider}/pause`); }
  async next(provider: string): Promise<void> { return this.post(`/v1/${provider}/next`); }
  async prev(provider: string): Promise<void> { return this.post(`/v1/${provider}/prev`); }
  async nowPlaying(provider: string): Promise<TrackInfo | null> { return this.request(`/v1/${provider}/now-playing`); }

  // Library
  async libraryTracks(provider: string, limit = 25): Promise<any> {
    const path = provider === 'apple' ? '/v1/apple/library/songs' : `/v1/${provider}/library/tracks`;
    return this.request(`${path}?limit=${limit}`);
  }
  async playlists(provider: string, limit = 25): Promise<any> {
    const path = provider === 'apple' ? '/v1/apple/library/playlists' : `/v1/${provider}/playlists`;
    return this.request(`${path}?limit=${limit}`);
  }

  // Sessions
  async sessionStart(provider: string, mode: string): Promise<any> {
    return this.post('/v1/command', {
      id: `c_${Date.now().toString(36)}`,
      ts: Date.now(),
      source: { kind: 'cli', device: 'linux' },
      type: 'session.start',
      payload: { policy: { version: 1, provider, mode } },
    });
  }
  async sessionStop(): Promise<void> {
    return this.post('/v1/command', {
      id: `c_${Date.now().toString(36)}`,
      ts: Date.now(),
      source: { kind: 'cli', device: 'linux' },
      type: 'session.stop',
      payload: {},
    });
  }
  async sessionNudge(direction: 'calmer' | 'sharper'): Promise<void> {
    return this.post('/v1/command', {
      id: `c_${Date.now().toString(36)}`,
      ts: Date.now(),
      source: { kind: 'cli', device: 'linux' },
      type: 'session.nudge',
      payload: { direction },
    });
  }
}
