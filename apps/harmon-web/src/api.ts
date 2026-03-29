/**
 * I provide the normalized daemon client the web app uses.
 */

import { normalizeMediaItems } from './normalizers.js';
import type { DaemonStatus, MediaItem, Provider, SearchKind } from './types.js';

export interface WebClientConfig {
  baseUrl: string;
  token?: string;
}

/**
 * I keep the web app on the same provider-aware contract as the daemon and MCP surfaces.
 */
export class HarmonWebClient {
  constructor(private readonly config: WebClientConfig) {}

  async fetchStatus(): Promise<DaemonStatus> {
    return this.requestJson<DaemonStatus>('/v1/status');
  }

  async search(provider: Provider, query: string, kind: SearchKind, limit = 12): Promise<MediaItem[]> {
    const payload = await this.requestJson<unknown>(`/v1/${provider}/search`, {
      q: query,
      type: provider === 'spotify' ? (kind === 'song' ? 'track' : kind) : kind === 'song' ? 'songs' : `${kind}s`,
      limit: String(limit),
    });
    return normalizeMediaItems(provider, kind, payload);
  }

  async fetchLibraryTracks(provider: Provider, limit = 25): Promise<MediaItem[]> {
    const path = provider === 'spotify' ? '/v1/spotify/library/tracks'
      : provider === 'apple' ? '/v1/apple/library/songs'
      : '/v1/youtube/library/tracks';
    return normalizeMediaItems(provider, 'song', await this.requestJson(path, { limit: String(limit) }));
  }

  async fetchPlaylists(provider: Provider, limit = 25): Promise<MediaItem[]> {
    const path = provider === 'spotify' ? '/v1/spotify/playlists'
      : provider === 'apple' ? '/v1/apple/library/playlists'
      : '/v1/youtube/playlists';
    return normalizeMediaItems(provider, 'playlist', await this.requestJson(path, { limit: String(limit) }));
  }

  async fetchPlaylistTracks(provider: Provider, playlistId: string, limit = 50): Promise<MediaItem[]> {
    const encodedId = encodeURIComponent(playlistId);
    const path = provider === 'spotify' ? `/v1/spotify/playlists/${encodedId}/tracks`
      : provider === 'apple' ? `/v1/apple/playlists/${encodedId}/tracks`
      : `/v1/youtube/playlists/${encodedId}/tracks`;
    return normalizeMediaItems(provider, 'song', await this.requestJson(path, { limit: String(limit) }));
  }

  async fetchNowPlaying(provider: Provider): Promise<unknown> {
    return this.requestJson(`/v1/${provider}/now-playing`);
  }

  async play(provider: Provider, target?: string): Promise<void> {
    const body = provider === 'spotify'
      ? buildSpotifyPlayBody(target)
      : provider === 'apple'
        ? target ? { url: target } : {}
        : target ? { uri: target } : {};
    await this.requestJson(`/v1/${provider}/play`, undefined, 'POST', body);
  }

  async pause(provider: Provider): Promise<void> {
    await this.requestJson(`/v1/${provider}/pause`, undefined, 'POST');
  }

  async next(provider: Provider): Promise<void> {
    await this.requestJson(`/v1/${provider}/next`, undefined, 'POST');
  }

  async previous(provider: Provider): Promise<void> {
    await this.requestJson(`/v1/${provider}/prev`, undefined, 'POST');
  }

  /**
   * I send one authenticated request and keep error handling short and readable for the UI.
   */
  private async requestJson<T>(
    path: string,
    query?: Record<string, string>,
    method = 'GET',
    body?: unknown
  ): Promise<T> {
    const url = buildDaemonUrl(this.config.baseUrl, path, Boolean(this.config.token));
    Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));

    let response: Response;
    try {
      response = await fetch(url, {
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
        },
        method,
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Cannot reach daemon — check the URL and ensure harmond is running.');
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error((await response.text()) || `${response.status} ${response.statusText}`);
    }

    try {
      return await response.json() as T;
    } catch {
      throw new Error(`Daemon returned invalid JSON (HTTP ${response.status})`);
    }
  }
}

/**
 * I preserve any configured daemon base path so the web app stays correct
 * behind reverse proxies like `/harmon`.
 */
function buildDaemonUrl(baseUrl: string, path: string, hasToken: boolean): URL {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  validateDaemonBaseUrl(base, hasToken);
  return new URL(path.replace(/^\//, ''), base);
}

/**
 * I refuse to send bearer tokens to insecure remote daemon URLs.
 */
function validateDaemonBaseUrl(base: URL, hasToken: boolean): void {
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error('Daemon URL must use http or https.');
  }

  if (hasToken && base.protocol !== 'https:' && !isLoopbackHost(base.hostname)) {
    throw new Error('Bearer tokens are only sent to HTTPS or loopback daemon URLs.');
  }
}

/**
 * I keep local development ergonomic while blocking insecure remote token use.
 */
function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === 'localhost'
    || hostname.endsWith('.localhost');
}

function buildSpotifyPlayBody(target?: string): Record<string, string> {
  if (!target) {
    return {};
  }

  if (
    target.startsWith('spotify:album:') ||
    target.startsWith('spotify:artist:') ||
    target.startsWith('spotify:playlist:')
  ) {
    return { contextUri: target };
  }

  return { uri: target };
}
