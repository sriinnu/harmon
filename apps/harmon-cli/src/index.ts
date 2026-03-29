/**
 * Harmon CLI - Thin client that calls the daemon
 */

import type { Command } from '@sriinnu/harmon-protocol';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:17373';

export interface CLIConfig {
  endpoint: string;
  token?: string;
  timeoutMs?: number;
}

export type ProviderName = 'spotify' | 'apple' | 'youtube';

export interface CookieRecord {
  domain: string;
  name: string;
  path: string;
  value: string;
  expires?: string | null;
  isSecure: boolean;
  isHTTPOnly: boolean;
}

interface SpotifyPagedResponse<T> {
  items?: T[];
}

export function createCLI(config: CLIConfig) {
  const authHeaders = config.token ? { Authorization: `Bearer ${config.token}` } : {};
  const timeoutMs = config.timeoutMs ?? 10000;

  const requestJson = async <T = unknown>(
    path: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
      query?: Record<string, string | number | undefined>;
    } = {}
  ): Promise<T> => {
    const url = new URL(`${config.endpoint}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: options.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      if (res.status === 204) {
        return null as T;
      }
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`${res.status} ${detail || res.statusText}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async status() {
      return requestJson('/v1/status');
    },
    async command(cmd: Command) {
      return requestJson('/v1/command', { method: 'POST', body: cmd });
    },
    async devices() {
      return requestJson('/v1/devices');
    },
    async useDevice(deviceId: string) {
      return requestJson('/v1/device/use', { method: 'POST', body: { deviceId } });
    },
    async authLogin() {
      return requestJson('/v1/auth/spotify/login', { method: 'POST' });
    },
    async authLogout() {
      return requestJson('/v1/auth/spotify/logout', { method: 'POST' });
    },
    async authImportCookies(cookies: CookieRecord[]) {
      return requestJson('/v1/auth/spotify/import', { method: 'POST', body: { cookies } });
    },

    // YouTube auth
    async youtubeAuthLogin() {
      return requestJson('/v1/auth/youtube/login', { method: 'POST' });
    },
    async youtubeAuthLogout() {
      return requestJson('/v1/auth/youtube/logout', { method: 'POST' });
    },
    async youtubeAuthRefresh() {
      return requestJson('/v1/auth/youtube/refresh', { method: 'POST' });
    },

    // Apple auth
    async appleAuthSetUserToken(token: string) {
      return requestJson('/v1/auth/apple/set-user-token', { method: 'POST', body: { token } });
    },
    async appleAuthRefresh() {
      return requestJson('/v1/auth/apple/refresh', { method: 'POST' });
    },
    async appleAuthLogout() {
      return requestJson('/v1/auth/apple/logout', { method: 'POST' });
    },

    async spotifySearch(query: string, type: string, options?: { limit?: number; offset?: number }) {
      return requestJson('/v1/spotify/search', {
        query: { q: query, type, limit: options?.limit, offset: options?.offset },
      });
    },
    async appleSearch(query: string, type: string, options?: { limit?: number; offset?: number }) {
      return requestJson('/v1/apple/search', {
        query: { q: query, type, limit: options?.limit, offset: options?.offset },
      });
    },
    async appleLibraryTracks(options?: { limit?: number }) {
      return requestJson('/v1/apple/library/songs', {
        query: { limit: options?.limit },
      });
    },
    async applePlaylists(options?: { limit?: number }) {
      return requestJson('/v1/apple/library/playlists', {
        query: { limit: options?.limit },
      });
    },
    async applePlaylistTracks(playlistId: string, options?: { limit?: number }) {
      return requestJson(`/v1/apple/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        query: { limit: options?.limit },
      });
    },
    async appleRecommendations(options?: { limit?: number; seed?: string }) {
      return requestJson('/v1/apple/recommendations', {
        query: { limit: options?.limit, seed: options?.seed },
      });
    },
    async youtubeSearch(query: string, type: string, options?: { limit?: number }) {
      return requestJson('/v1/youtube/search', {
        query: { q: query, type, limit: options?.limit },
      });
    },
    async youtubeLibraryTracks(options?: { limit?: number }) {
      return requestJson('/v1/youtube/library/tracks', {
        query: { limit: options?.limit },
      });
    },
    async youtubePlaylists(options?: { limit?: number }) {
      return requestJson('/v1/youtube/playlists', {
        query: { limit: options?.limit },
      });
    },
    async youtubePlaylistTracks(playlistId: string, options?: { limit?: number }) {
      return requestJson(`/v1/youtube/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        query: { limit: options?.limit },
      });
    },
    async youtubeRecommendations(options?: { limit?: number; seed?: string }) {
      return requestJson('/v1/youtube/recommendations', {
        query: { limit: options?.limit, seed: options?.seed },
      });
    },
    async applePlay(payload?: { url?: string }) {
      return requestJson('/v1/apple/play', { method: 'POST', body: payload ?? {} });
    },
    async applePause() {
      return requestJson('/v1/apple/pause', { method: 'POST' });
    },
    async appleNext() {
      return requestJson('/v1/apple/next', { method: 'POST' });
    },
    async applePrev() {
      return requestJson('/v1/apple/prev', { method: 'POST' });
    },
    async appleNowPlaying() {
      return requestJson('/v1/apple/now-playing');
    },
    async youtubePlay(payload?: { uri?: string }) {
      return requestJson('/v1/youtube/play', { method: 'POST', body: payload ?? {} });
    },
    async youtubePause() {
      return requestJson('/v1/youtube/pause', { method: 'POST' });
    },
    async youtubeNext() {
      return requestJson('/v1/youtube/next', { method: 'POST' });
    },
    async youtubePrev() {
      return requestJson('/v1/youtube/prev', { method: 'POST' });
    },
    async youtubeNowPlaying() {
      return requestJson('/v1/youtube/now-playing');
    },
    async youtubeQueueAdd(uri: string) {
      return requestJson('/v1/youtube/queue', { method: 'POST', body: { uri } });
    },
    async spotifyPlay(payload?: { uri?: string; contextUri?: string }) {
      return requestJson('/v1/spotify/play', { method: 'POST', body: payload ?? {} });
    },
    async spotifyPlaylists(options?: { limit?: number; offset?: number }) {
      const result = await requestJson<SpotifyPagedResponse<unknown>>('/v1/spotify/playlists', {
        query: { limit: options?.limit, offset: options?.offset },
      });
      return result.items ?? [];
    },
    async spotifyPlaylistTracks(playlistId: string, options?: { limit?: number; offset?: number }) {
      const result = await requestJson<SpotifyPagedResponse<unknown>>(`/v1/spotify/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        query: { limit: options?.limit, offset: options?.offset },
      });
      return result.items ?? [];
    },
    async spotifyLibraryTracks(options?: { limit?: number; offset?: number }) {
      const result = await requestJson<SpotifyPagedResponse<unknown>>('/v1/spotify/library/tracks', {
        query: { limit: options?.limit, offset: options?.offset },
      });
      return result.items ?? [];
    },
    async spotifyRecommendations(options?: { limit?: number; seed?: string }) {
      return requestJson('/v1/spotify/recommendations', {
        query: { limit: options?.limit, seed: options?.seed },
      });
    },
    async spotifyPause() {
      return requestJson('/v1/spotify/pause', { method: 'POST' });
    },
    async spotifyNext() {
      return requestJson('/v1/spotify/next', { method: 'POST' });
    },
    async spotifyPrev() {
      return requestJson('/v1/spotify/prev', { method: 'POST' });
    },
    async spotifySeek(positionMs: number) {
      return requestJson('/v1/spotify/seek', { method: 'POST', body: { positionMs } });
    },
    async spotifyVolume(volumePercent: number) {
      return requestJson('/v1/spotify/volume', { method: 'POST', body: { volumePercent } });
    },
    async spotifyShuffle(state: boolean) {
      return requestJson('/v1/spotify/shuffle', { method: 'POST', body: { state } });
    },
    async spotifyRepeat(state: 'off' | 'track' | 'context') {
      return requestJson('/v1/spotify/repeat', { method: 'POST', body: { state } });
    },
    async spotifyNowPlaying() {
      return requestJson('/v1/spotify/now-playing');
    },
    async spotifyQueueAdd(uri: string) {
      return requestJson('/v1/spotify/queue', { method: 'POST', body: { uri } });
    },

    // Smart cross-provider
    async smartSearch(query: string, options?: { limit?: number }) {
      return requestJson('/v1/smart/search', {
        query: { q: query, limit: options?.limit },
      });
    },
    async smartPlay(options: { query?: string; uri?: string; provider?: string }) {
      return requestJson('/v1/smart/play', { method: 'POST', body: options as Record<string, unknown> });
    },

    // Song recognition
    async recognize(audioBase64: string) {
      return requestJson('/v1/recognize', { method: 'POST', body: { audio: audioBase64 } });
    },
  };
}

export function getDefaultEndpoint(): string {
  return process.env.HARMON_ENDPOINT || DEFAULT_ENDPOINT;
}
