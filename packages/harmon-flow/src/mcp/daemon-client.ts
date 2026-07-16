/**
 * Thin Harmon daemon client for MCP app tools.
 */

import { randomUUID } from 'node:crypto';
import type {
  Command,
  DaemonStatus,
  MusicProviderName,
  SessionPolicy,
  TrackInfo,
} from '@sriinnu/harmon-protocol';

export type MusicSearchKind = 'track' | 'song' | 'album' | 'artist' | 'playlist';

export interface MusicSearchItem {
  id: string;
  kind: MusicSearchKind;
  provider: MusicProviderName;
  title: string;
  subtitle?: string;
  album?: string;
  durationMs?: number;
  uri?: string;
  url?: string;
  imageUrl?: string;
}

export interface DaemonClientConfig {
  endpoint?: string;
  token?: string;
  timeoutMs?: number;
}

export interface HarmonDaemonAppClient {
  getStatus(): Promise<DaemonStatus>;
  searchMusic(provider: MusicProviderName, query: string, kind: MusicSearchKind, limit?: number): Promise<MusicSearchItem[]>;
  getLibraryTracks(provider: MusicProviderName, limit?: number): Promise<MusicSearchItem[]>;
  listPlaylists(provider: MusicProviderName, limit?: number): Promise<MusicSearchItem[]>;
  getPlaylistTracks(provider: MusicProviderName, playlistId: string, limit?: number): Promise<MusicSearchItem[]>;
  getNowPlaying(provider: MusicProviderName): Promise<TrackInfo | null>;
  playMusic(provider: MusicProviderName, target?: string): Promise<{ success: boolean }>;
  resumeMusic(provider: MusicProviderName): Promise<{ success: boolean }>;
  pauseMusic(provider: MusicProviderName): Promise<{ success: boolean }>;
  nextTrack(provider: MusicProviderName): Promise<{ success: boolean }>;
  previousTrack(provider: MusicProviderName): Promise<{ success: boolean }>;
  setVolume(volumePercent: number): Promise<{ success: boolean }>;
  seek(positionMs: number, provider?: 'spotify' | 'apple'): Promise<{ success: boolean }>;
  setShuffle(state: boolean): Promise<{ success: boolean }>;
  setRepeat(state: 'off' | 'track' | 'context'): Promise<{ success: boolean }>;
  addToQueue(provider: 'spotify' | 'youtube', uri: string): Promise<{ success: boolean }>;
  listDevices(): Promise<unknown>;
  useDevice(deviceId: string): Promise<{ success: boolean }>;
  startSession(policy: SessionPolicy): Promise<{ success: boolean; sessionId?: string }>;
  nudgeSession(direction: 'calmer' | 'sharper', amount?: number, reason?: string): Promise<{ success: boolean }>;
  stopSession(): Promise<{ success: boolean }>;

  // Auth: YouTube
  youtubeAuthLogin(): Promise<{ url: string }>;
  youtubeAuthRefresh(): Promise<{ success: boolean }>;
  youtubeAuthLogout(): Promise<{ success: boolean }>;

  // Auth: Apple
  appleAuthSetUserToken(token: string): Promise<{ success: boolean }>;
  appleAuthRefresh(): Promise<{ success: boolean; hasToken: boolean }>;
  appleAuthLogout(): Promise<{ success: boolean }>;

  // Auth: Spotify
  spotifyAuthLogin(): Promise<{ url: string }>;
  spotifyAuthLogout(): Promise<{ success: boolean }>;

  // Smart play
  smartSearch(query: string, limit?: number): Promise<any>;
  smartPlay(options: { query?: string; uri?: string; provider?: string }): Promise<any>;

  // Song recognition
  recognizeSong(audioBase64: string): Promise<any>;
}

const DEFAULT_DAEMON_ENDPOINT = 'http://127.0.0.1:17373';

type RequestOptions = {
  body?: unknown;
  method?: string;
  query?: Record<string, number | string | undefined>;
};

interface SpotifyPagedPayload<T> {
  items?: T[];
}

/**
 * I create a daemon client that stays small enough for MCP-facing tool calls.
 */
export function createDaemonAppClient(config: DaemonClientConfig = {}): HarmonDaemonAppClient {
  const endpoint = config.endpoint ?? process.env.HARMON_ENDPOINT ?? DEFAULT_DAEMON_ENDPOINT;
  const token = config.token ?? process.env.HARMON_API_TOKEN;
  const timeoutMs = config.timeoutMs ?? 10_000;
  let insecureWarned = false;

  // /v1/smart/* fans out across all three providers; give it a wider budget.
  const resolveTimeout = (path: string): number =>
    path.startsWith('/v1/smart/') ? Math.max(timeoutMs, 30_000) : timeoutMs;

  const requestJson = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    if (!insecureWarned && endpoint.startsWith('http://')) {
      const parsed = new URL(endpoint);
      const loopback = ['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname);
      if (!loopback && token) {
        console.warn(
          'WARNING: Sending auth token over insecure HTTP to %s. Use HTTPS for remote daemons.',
          parsed.hostname,
        );
        insecureWarned = true;
      }
    }

    const url = buildDaemonUrl(endpoint, path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const requestTimeoutMs = resolveTimeout(path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 600);
        if (response.status >= 500) {
          throw new Error(`Harmon daemon error ${response.status}${detail ? `: ${detail}` : ''}`);
        }
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }

      if (response.status === 204) {
        return null as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Harmon daemon at ${endpoint} did not respond within ${Math.round(requestTimeoutMs / 1000)}s — is harmond running?`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async getStatus() {
      return requestJson<DaemonStatus>('/v1/status');
    },
    async searchMusic(provider, query, kind, limit) {
      if (provider === 'spotify') {
        const result = await requestJson<Record<string, unknown>>('/v1/spotify/search', {
          query: {
            q: query,
            type: kind === 'song' ? 'track' : kind,
            limit,
          },
        });
        return normalizeSpotifySearch(result, kind);
      }

      if (provider === 'apple') {
        const result = await requestJson<Record<string, unknown>>('/v1/apple/search', {
          query: {
            q: query,
            type: kind === 'track' ? 'songs' : `${kind}s`,
            limit,
          },
        });
        return normalizeAppleSearch(result, kind);
      }

      const result = await requestJson<Record<string, unknown>>('/v1/youtube/search', {
        query: {
          q: query,
          type: kind === 'track' ? 'songs' : `${kind}s`,
          limit,
        },
      });
      return normalizeYouTubeSearch(result, kind);
    },
    async getLibraryTracks(provider, limit) {
      const path = provider === 'spotify'
        ? '/v1/spotify/library/tracks'
        : provider === 'apple'
          ? '/v1/apple/library/songs'
          : '/v1/youtube/library/tracks';
      const result = provider === 'spotify'
        ? await requestJson<SpotifyPagedPayload<unknown>>(path, { query: { limit } })
        : await requestJson<unknown[]>(path, { query: { limit } });
      const items = provider === 'spotify'
        ? unwrapSpotifyTrackItems((result as SpotifyPagedPayload<unknown>).items)
        : result as unknown[];
      return mapTracks(items, provider, provider === 'spotify' ? 'track' : 'song');
    },
    async listPlaylists(provider, limit) {
      const path = provider === 'spotify'
        ? '/v1/spotify/playlists'
        : provider === 'apple'
          ? '/v1/apple/library/playlists'
          : '/v1/youtube/playlists';
      const result = provider === 'spotify'
        ? await requestJson<SpotifyPagedPayload<unknown>>(path, { query: { limit } })
        : await requestJson<unknown[]>(path, { query: { limit } });
      return mapCatalogItems(
        provider === 'spotify'
          ? (result as SpotifyPagedPayload<unknown>).items ?? []
          : result as unknown[],
        provider,
        'playlist',
      );
    },
    async getPlaylistTracks(provider, playlistId, limit) {
      const path = provider === 'spotify'
        ? `/v1/spotify/playlists/${encodeURIComponent(playlistId)}/tracks`
        : provider === 'apple'
          ? `/v1/apple/playlists/${encodeURIComponent(playlistId)}/tracks`
          : `/v1/youtube/playlists/${encodeURIComponent(playlistId)}/tracks`;
      const result = provider === 'spotify'
        ? await requestJson<SpotifyPagedPayload<unknown>>(path, { query: { limit } })
        : await requestJson<unknown[]>(path, { query: { limit } });
      return mapTracks(
        provider === 'spotify'
          ? unwrapSpotifyTrackItems((result as SpotifyPagedPayload<unknown>).items)
          : result as unknown[],
        provider,
        provider === 'spotify' ? 'track' : 'song',
      );
    },
    async getNowPlaying(provider) {
      const path = provider === 'spotify'
        ? '/v1/spotify/now-playing'
        : provider === 'apple'
          ? '/v1/apple/now-playing'
          : '/v1/youtube/now-playing';
      return requestJson<TrackInfo | null>(path);
    },
    async playMusic(provider, target) {
      const path = provider === 'spotify'
        ? '/v1/spotify/play'
        : provider === 'apple'
          ? '/v1/apple/play'
          : '/v1/youtube/play';
      const body =
        provider === 'spotify'
          ? buildSpotifyPlayBody(target)
          : provider === 'apple'
            ? target ? { url: target } : {}
            : target ? { uri: target } : {};
      return requestJson(path, { body, method: 'POST' });
    },
    async resumeMusic(provider) {
      // An empty play body resumes the current context on every provider.
      const path = provider === 'spotify'
        ? '/v1/spotify/play'
        : provider === 'apple'
          ? '/v1/apple/play'
          : '/v1/youtube/play';
      return requestJson(path, { body: {}, method: 'POST' });
    },
    async pauseMusic(provider) {
      const path = provider === 'spotify'
        ? '/v1/spotify/pause'
        : provider === 'apple'
          ? '/v1/apple/pause'
          : '/v1/youtube/pause';
      return requestJson(path, { method: 'POST' });
    },
    async nextTrack(provider) {
      const path = provider === 'spotify'
        ? '/v1/spotify/next'
        : provider === 'apple'
          ? '/v1/apple/next'
          : '/v1/youtube/next';
      return requestJson(path, { method: 'POST' });
    },
    async previousTrack(provider) {
      const path = provider === 'spotify'
        ? '/v1/spotify/prev'
        : provider === 'apple'
          ? '/v1/apple/prev'
          : '/v1/youtube/prev';
      return requestJson(path, { method: 'POST' });
    },
    async setVolume(volumePercent) {
      return requestJson('/v1/spotify/volume', { body: { volumePercent }, method: 'POST' });
    },
    async seek(positionMs, provider = 'spotify') {
      // YouTube's browser handoff has no seek surface; Apple seeks via the
      // remote bridge (browser/iOS player must be connected).
      const path = provider === 'apple' ? '/v1/apple/seek' : '/v1/spotify/seek';
      return requestJson(path, { body: { positionMs }, method: 'POST' });
    },
    async setShuffle(state) {
      return requestJson('/v1/spotify/shuffle', { body: { state }, method: 'POST' });
    },
    async setRepeat(state) {
      return requestJson('/v1/spotify/repeat', { body: { state }, method: 'POST' });
    },
    async addToQueue(provider, uri) {
      const path = provider === 'spotify' ? '/v1/spotify/queue' : '/v1/youtube/queue';
      return requestJson(path, { body: { uri }, method: 'POST' });
    },
    async listDevices() {
      return requestJson('/v1/devices');
    },
    async useDevice(deviceId) {
      return requestJson('/v1/device/use', { body: { deviceId }, method: 'POST' });
    },
    async startSession(policy) {
      return requestJson('/v1/command', {
        body: createCommand('session.start', { policy }),
        method: 'POST',
      });
    },
    async nudgeSession(direction, amount, reason) {
      return requestJson('/v1/command', {
        body: createCommand('session.nudge', { amount, direction, reason }),
        method: 'POST',
      });
    },
    async stopSession() {
      return requestJson('/v1/command', {
        body: createCommand('session.stop'),
        method: 'POST',
      });
    },

    // Auth: YouTube
    async youtubeAuthLogin() {
      return requestJson('/v1/auth/youtube/login', { method: 'POST' });
    },
    async youtubeAuthRefresh() {
      return requestJson('/v1/auth/youtube/refresh', { method: 'POST' });
    },
    async youtubeAuthLogout() {
      return requestJson('/v1/auth/youtube/logout', { method: 'POST' });
    },

    // Auth: Apple
    async appleAuthSetUserToken(token) {
      return requestJson('/v1/auth/apple/set-user-token', { body: { token }, method: 'POST' });
    },
    async appleAuthRefresh() {
      return requestJson('/v1/auth/apple/refresh', { method: 'POST' });
    },
    async appleAuthLogout() {
      return requestJson('/v1/auth/apple/logout', { method: 'POST' });
    },

    // Auth: Spotify
    async spotifyAuthLogin() {
      return requestJson('/v1/auth/spotify/login', { method: 'POST' });
    },
    async spotifyAuthLogout() {
      return requestJson('/v1/auth/spotify/logout', { method: 'POST' });
    },

    // Smart play
    async smartSearch(query, limit) {
      return requestJson('/v1/smart/search', {
        query: { q: query, limit },
      });
    },
    async smartPlay(options) {
      return requestJson('/v1/smart/play', { body: options, method: 'POST' });
    },

    // Song recognition
    async recognizeSong(audioBase64) {
      return requestJson('/v1/recognize', { body: { audio: audioBase64 }, method: 'POST' });
    },
  };
}

/**
 * I preserve any configured daemon base-path prefix instead of letting a
 * leading slash reset the request back to the origin root.
 */
function buildDaemonUrl(endpoint: string, path: string): URL {
  const base = new URL(endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
  return new URL(path.replace(/^\//, ''), base);
}

/**
 * I build a daemon command envelope that matches the shared protocol.
 */
function createCommand(type: Command['type'], payload?: Record<string, unknown>): Command {
  return {
    id: `c_${randomUUID()}`,
    payload,
    source: {
      device: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
      kind: 'mcp' as Command['source']['kind'],
    },
    ts: Date.now(),
    type,
  };
}

function normalizeSpotifySearch(result: Record<string, unknown>, kind: MusicSearchKind): MusicSearchItem[] {
  if (kind === 'track' || kind === 'song') {
    return mapTracks(result.tracks, 'spotify', 'track');
  }
  return mapCatalogItems(result[kind === 'playlist' ? 'playlists' : `${kind}s`], 'spotify', kind);
}

function normalizeAppleSearch(result: Record<string, unknown>, kind: MusicSearchKind): MusicSearchItem[] {
  const key = kind === 'track' || kind === 'song' ? 'songs' : `${kind}s`;
  if (key === 'songs') {
    return mapTracks(result.songs, 'apple', 'song');
  }
  return mapCatalogItems(result[key], 'apple', kind === 'track' ? 'song' : kind);
}

function normalizeYouTubeSearch(result: Record<string, unknown>, kind: MusicSearchKind): MusicSearchItem[] {
  const key = kind === 'track' || kind === 'song' ? 'songs' : `${kind}s`;
  if (key === 'songs') {
    return mapTracks(result.songs, 'youtube', 'song');
  }
  return mapCatalogItems(result[key], 'youtube', kind === 'track' ? 'song' : kind);
}

function mapTracks(
  value: unknown,
  provider: MusicProviderName,
  kind: MusicSearchKind,
): MusicSearchItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const track = item as Partial<TrackInfo> & Record<string, unknown>;
    const title = typeof track.name === 'string' ? track.name : '';
    const artist = typeof track.artist === 'string'
      ? track.artist
      : typeof track.artistName === 'string'
        ? track.artistName
        : undefined;

    if (!title) {
      return [];
    }

    return [{
      album: typeof track.album === 'string'
        ? track.album
        : typeof track.albumName === 'string'
          ? track.albumName
          : undefined,
      durationMs: typeof track.durationMs === 'number' ? track.durationMs : undefined,
      id: typeof track.id === 'string' ? track.id : title,
      imageUrl: typeof track.imageUrl === 'string'
        ? track.imageUrl
        : typeof track.thumbnailUrl === 'string'
          ? track.thumbnailUrl
          : undefined,
      kind,
      provider,
      subtitle: artist,
      title,
      uri: typeof track.uri === 'string' ? track.uri : defaultTrackUri(provider, kind, typeof track.id === 'string' ? track.id : title),
      url: typeof track.url === 'string' ? track.url : undefined,
    }];
  });
}

function unwrapSpotifyTrackItems(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const wrapped = 'track' in item && item.track && typeof item.track === 'object'
      ? item.track
      : item;
    return [wrapped];
  });
}

function mapCatalogItems(
  value: unknown,
  provider: MusicProviderName,
  kind: MusicSearchKind,
): MusicSearchItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const title = typeof candidate.name === 'string' ? candidate.name : '';
    if (!title) {
      return [];
    }

    return [{
      id: typeof candidate.id === 'string' ? candidate.id : title,
      imageUrl: typeof candidate.imageUrl === 'string'
        ? candidate.imageUrl
        : typeof candidate.thumbnailUrl === 'string'
          ? candidate.thumbnailUrl
          : undefined,
      kind,
      provider,
      subtitle: firstString(
        candidate.artistName,
        candidate.owner,
        candidate.curatorName,
        candidate.author,
        candidate.publisher,
      ),
      title,
      uri: typeof candidate.uri === 'string' ? candidate.uri : defaultCatalogUri(provider, kind, typeof candidate.id === 'string' ? candidate.id : title),
      url: typeof candidate.url === 'string' ? candidate.url : undefined,
    }];
  });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function buildSpotifyPlayBody(target?: string): { contextUri?: string; uri?: string } {
  if (!target) {
    return {};
  }
  if (
    target.startsWith('spotify:album:') ||
    target.startsWith('spotify:artist:') ||
    target.startsWith('spotify:playlist:') ||
    target.startsWith('spotify:show:')
  ) {
    return { contextUri: target };
  }
  return { uri: target };
}

function defaultTrackUri(provider: MusicProviderName, kind: MusicSearchKind, id: string): string | undefined {
  if (provider === 'spotify') {
    return `spotify:${kind === 'song' ? 'track' : kind}:${id}`;
  }
  if (provider === 'youtube') {
    return `youtube:video:${id}`;
  }
  return undefined;
}

function defaultCatalogUri(provider: MusicProviderName, kind: MusicSearchKind, id: string): string | undefined {
  if (provider === 'spotify') {
    return `spotify:${kind}:${id}`;
  }
  if (provider === 'youtube' && kind === 'playlist') {
    return `youtube:playlist:${id}`;
  }
  return undefined;
}
