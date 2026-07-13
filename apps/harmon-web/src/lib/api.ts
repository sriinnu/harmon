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

const REQUEST_TIMEOUT_MS = 10_000;
// /v1/smart/* fans out across all three providers, so it gets a wider budget
// than single-provider calls.
const SMART_REQUEST_TIMEOUT_MS = 30_000;

export class HarmonClient {
  constructor(private baseUrl: string, private token?: string) {}

  private async request<T>(path: string, options?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Only send token to HTTPS or loopback — never leak it over remote plain HTTP.
    let tokenWithheld = false;
    if (this.token) {
      const parsed = new URL(this.baseUrl);
      const isSecure = parsed.protocol === 'https:' || ['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname);
      if (isSecure) headers['Authorization'] = `Bearer ${this.token}`;
      else tokenWithheld = true;
    }

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...options, headers: { ...headers, ...options?.headers }, signal: controller.signal });
    } catch {
      if (controller.signal.aborted) {
        throw new Error(`daemon did not respond within ${Math.round(timeoutMs / 1000)}s — is harmond running at ${this.baseUrl}?`);
      }
      throw new Error('Cannot reach daemon — check URL and ensure harmond is running.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status === 401 && tokenWithheld) {
        throw new Error(
          `Unauthorized: your API token was withheld because ${this.baseUrl} is an insecure remote HTTP connection — use https (or a loopback address) so the token can be sent.`,
        );
      }
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
  /** Spotify access token for the Web Playback SDK (browser-as-device). */
  async getSpotifyPlaybackToken(): Promise<{ accessToken: string }> { return this.request('/v1/spotify/playback-token'); }
  async useDevice(deviceId: string): Promise<void> { return this.post('/v1/device/use', { deviceId }); }
  async youtubeLogin(): Promise<{ url: string }> { return this.post('/v1/auth/youtube/login'); }
  async youtubeLogout(): Promise<void> { return this.post('/v1/auth/youtube/logout'); }
  async appleSetToken(token: string): Promise<void> { return this.post('/v1/auth/apple/set-user-token', { token }); }
  async appleLogout(): Promise<void> { return this.post('/v1/auth/apple/logout'); }

  // Search (per provider). Each daemon parser accepts a different type vocabulary:
  // spotify wants singular (track|album|artist|playlist), apple/youtube want plural (songs|albums|artists|playlists).
  async search(provider: string, query: string, type = 'track', limit = 20): Promise<any> {
    const plural: Record<string, string> = { track: 'songs', song: 'songs', album: 'albums', artist: 'artists', playlist: 'playlists' };
    const providerType = provider === 'spotify' ? type : (plural[type] ?? type);
    return this.request(`/v1/${provider}/search?q=${encodeURIComponent(query)}&type=${providerType}&limit=${limit}`);
  }

  // Smart
  async smartPlay(query: string, provider?: string): Promise<SmartPlayResult> {
    return this.request('/v1/smart/play', { method: 'POST', body: JSON.stringify({ query, provider }) }, SMART_REQUEST_TIMEOUT_MS);
  }
  async smartSearch(query: string, limit = 5): Promise<any> {
    return this.request(`/v1/smart/search?q=${encodeURIComponent(query)}&limit=${limit}`, undefined, SMART_REQUEST_TIMEOUT_MS);
  }

  // Playback — spotify/youtube read body.uri, apple reads body.url.
  async play(provider: string, options?: { uri?: string }): Promise<void> {
    const uri = options?.uri;
    const body = provider === 'apple' ? (uri ? { url: uri } : {}) : (uri ? { uri } : {});
    return this.post(`/v1/${provider}/play`, body);
  }
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
      source: commandSource(),
      type: 'session.start',
      payload: { policy: { version: 1, provider, mode } },
    });
  }
  async sessionStop(): Promise<void> {
    return this.post('/v1/command', {
      id: `c_${Date.now().toString(36)}`,
      ts: Date.now(),
      source: commandSource(),
      type: 'session.stop',
      payload: {},
    });
  }
  async sessionNudge(direction: 'calmer' | 'sharper'): Promise<void> {
    return this.post('/v1/command', {
      id: `c_${Date.now().toString(36)}`,
      ts: Date.now(),
      source: commandSource(),
      type: 'session.nudge',
      payload: { direction },
    });
  }
}

/**
 * Build the command envelope source. The protocol's DeviceKind enum has no 'web'
 * value (cli|menubar|voice|mcp), so we use 'menubar' as the least-wrong existing
 * GUI-client kind, and detect the closest DeviceOS from the browser UA.
 */
export function commandSource(): { kind: 'menubar'; device: 'macos' | 'windows' | 'linux' } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const device = /mac/i.test(ua) ? 'macos' : /win/i.test(ua) ? 'windows' : 'linux';
  return { kind: 'menubar', device };
}

/**
 * Poll daemon status until the given provider reports connected — used after an
 * OAuth browser handoff. Resolves true as soon as the provider connects, false
 * on timeout or abort.
 */
export async function pollForProviderConnected(
  client: HarmonClient,
  provider: string,
  isAborted: () => boolean = () => false,
  attempts = 30,
  intervalMs = 2000,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (isAborted()) return false;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    if (isAborted()) return false;
    try {
      const s = await client.getStatus();
      if (s.providers?.[provider]?.connected) return true;
    } catch {
      // daemon briefly unreachable — keep polling
    }
  }
  return false;
}
