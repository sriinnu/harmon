/**
 * Harmon YouTube - YouTube Music integration
 *
 * Uses YouTube Data API v3 for search and the internal YouTube Music API
 * for library, recommendations, and playback features.
 *
 * Note: YouTube Music does not have an official public API for music-specific
 * features. Library and recommendation features use reverse-engineered endpoints
 * that may change without notice.
 */

import type { TrackInfo } from '@athena/harmon-protocol';
import type { MusicProvider, AudioFeatures } from '@athena/harmon-core';

const YT_DATA_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YTM_API_BASE = 'https://music.youtube.com/youtubei/v1';

const YTM_CLIENT_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.01.00',
    hl: 'en',
    gl: 'US',
  },
};

// ============================================================================
// Types
// ============================================================================

export interface YouTubeMusicConfig {
  /** Google OAuth2 access token */
  accessToken?: string;
  /** YouTube Data API key (for search without auth) */
  apiKey?: string;
  /** Cookie header for authenticated YTM requests */
  cookies?: string;
}

export interface YouTubeMusicSong {
  id: string;
  name: string;
  artistName: string;
  artistId?: string;
  albumName?: string;
  albumId?: string;
  durationMs?: number;
  thumbnailUrl?: string;
}

export interface YouTubeMusicAlbum {
  id: string;
  name: string;
  artistName: string;
  year?: string;
  thumbnailUrl?: string;
}

export interface YouTubeMusicArtist {
  id: string;
  name: string;
  thumbnailUrl?: string;
}

export interface YouTubeMusicPlaylist {
  id: string;
  name: string;
  author?: string;
  trackCount?: number;
  thumbnailUrl?: string;
}

export interface YouTubeMusicSearchResult {
  songs: YouTubeMusicSong[];
  albums: YouTubeMusicAlbum[];
  artists: YouTubeMusicArtist[];
  playlists: YouTubeMusicPlaylist[];
}

export type YouTubeMusicSearchType = 'songs' | 'albums' | 'artists' | 'playlists';

export interface YouTubeMusicListOptions {
  limit?: number;
}

// ============================================================================
// Client Interface
// ============================================================================

export interface YouTubeMusicClient {
  isConnected(): boolean;
  search(query: string, types?: YouTubeMusicSearchType[], options?: YouTubeMusicListOptions): Promise<YouTubeMusicSearchResult>;
  getSong(videoId: string): Promise<YouTubeMusicSong | null>;
  getLibrarySongs(options?: YouTubeMusicListOptions): Promise<YouTubeMusicSong[]>;
  getPlaylists(options?: YouTubeMusicListOptions): Promise<YouTubeMusicPlaylist[]>;
  getPlaylistTracks(playlistId: string, options?: YouTubeMusicListOptions): Promise<YouTubeMusicSong[]>;
  getRecommendations(options?: YouTubeMusicListOptions): Promise<YouTubeMusicSong[]>;
  getWatchPlaylist(videoId: string, options?: YouTubeMusicListOptions): Promise<YouTubeMusicSong[]>;
}

// ============================================================================
// Implementation
// ============================================================================

class YouTubeMusicClientImpl implements YouTubeMusicClient {
  private config: YouTubeMusicConfig;

  constructor(config: YouTubeMusicConfig) {
    if (!config.accessToken && !config.apiKey && !config.cookies) {
      throw new Error('YouTube Music requires an access token, API key, or cookies');
    }
    this.config = config;
  }

  isConnected(): boolean {
    return !!(this.config.accessToken || this.config.cookies);
  }

  async search(
    query: string,
    _types: YouTubeMusicSearchType[] = ['songs'],
    options: YouTubeMusicListOptions = {}
  ): Promise<YouTubeMusicSearchResult> {
    const result: YouTubeMusicSearchResult = {
      songs: [], albums: [], artists: [], playlists: [],
    };

    if (this.config.apiKey || this.config.accessToken) {
      const data = await this.ytDataRequest<YouTubeSearchResponse>('/search', {
        q: query,
        type: 'video',
        videoCategoryId: '10',
        maxResults: (options.limit || 20).toString(),
        part: 'snippet',
      });
      result.songs = (data.items || []).map(mapYtSearchToSong);
    }

    return result;
  }

  async getSong(videoId: string): Promise<YouTubeMusicSong | null> {
    const data = await this.ytDataRequest<YouTubeVideoResponse>('/videos', {
      id: videoId,
      part: 'snippet,contentDetails',
    });
    const item = data.items?.[0];
    if (!item) return null;
    return {
      id: item.id,
      name: item.snippet.title,
      artistName: item.snippet.channelTitle.replace(/ - Topic$/, ''),
      durationMs: parseDuration(item.contentDetails?.duration),
      thumbnailUrl: item.snippet.thumbnails?.medium?.url,
    };
  }

  async getLibrarySongs(_options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    if (!this.isConnected()) {
      throw new Error('YouTube Music authentication required for library access');
    }
    const data = await this.ytmRequest('browse', { browseId: 'FEmusic_liked_videos' });
    return parseLibraryResponse(data);
  }

  async getPlaylists(_options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicPlaylist[]> {
    if (!this.isConnected()) {
      throw new Error('YouTube Music authentication required for playlists');
    }
    const data = await this.ytmRequest('browse', { browseId: 'FEmusic_liked_playlists' });
    return parsePlaylistsResponse(data);
  }

  async getPlaylistTracks(playlistId: string, _options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    const data = await this.ytmRequest('browse', { browseId: `VL${playlistId}` });
    return parsePlaylistTracksResponse(data);
  }

  async getRecommendations(_options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    if (!this.isConnected()) {
      throw new Error('YouTube Music authentication required for recommendations');
    }
    const data = await this.ytmRequest('browse', { browseId: 'FEmusic_home' });
    return parseRecommendationsResponse(data);
  }

  async getWatchPlaylist(videoId: string, _options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    const data = await this.ytmRequest('next', {
      videoId,
      isAudioOnly: true,
      enablePersistentPlaylistPanel: true,
    });
    return parseWatchPlaylistResponse(data);
  }

  private async ytDataRequest<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${YT_DATA_API_BASE}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {};
    if (this.config.accessToken) {
      headers.Authorization = `Bearer ${this.config.accessToken}`;
    } else if (this.config.apiKey) {
      url.searchParams.set('key', this.config.apiKey);
    }

    const response = await fetch(url, { headers });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      const retry = await fetch(url, { headers });
      if (!retry.ok) {
        throw new Error(`YouTube API error: ${retry.status} ${await retry.text()}`);
      }
      return (await retry.json()) as T;
    }

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  private async ytmRequest<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = new URL(`${YTM_API_BASE}/${endpoint}`);
    url.searchParams.set('prettyPrint', 'false');
    if (this.config.apiKey) {
      url.searchParams.set('key', this.config.apiKey);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Origin: 'https://music.youtube.com',
      Referer: 'https://music.youtube.com/',
    };

    if (this.config.accessToken) {
      headers.Authorization = `Bearer ${this.config.accessToken}`;
    }
    if (this.config.cookies) {
      headers.Cookie = this.config.cookies;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ context: YTM_CLIENT_CONTEXT, ...body }),
    });

    if (!response.ok) {
      throw new Error(`YouTube Music API error: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as T;
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface YouTubeSearchResponse {
  items?: Array<{
    id: { videoId?: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails?: { medium?: { url?: string } };
    };
  }>;
}

interface YouTubeVideoResponse {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails?: { medium?: { url?: string } };
    };
    contentDetails?: { duration?: string };
  }>;
}

// ============================================================================
// Mappers
// ============================================================================

function mapYtSearchToSong(item: NonNullable<YouTubeSearchResponse['items']>[0]): YouTubeMusicSong {
  return {
    id: item.id.videoId || '',
    name: item.snippet.title,
    artistName: item.snippet.channelTitle.replace(/ - Topic$/, ''),
    thumbnailUrl: item.snippet.thumbnails?.medium?.url,
  };
}

/** Convert YouTube Music song to provider-agnostic TrackInfo */
export function mapSongToTrackInfo(song: YouTubeMusicSong): TrackInfo {
  return {
    id: song.id,
    name: song.name,
    artist: song.artistName,
    artistIds: song.artistId ? [song.artistId] : undefined,
    album: song.albumName || '',
    durationMs: song.durationMs || 0,
    uri: `youtube:video:${song.id}`,
    provider: 'youtube',
    imageUrl: song.thumbnailUrl,
  };
}

/** Parse ISO 8601 duration (PT3M45S) to milliseconds */
function parseDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  return ((parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0')) * 1000;
}

// Placeholder parsers for internal YTM API responses
function parseLibraryResponse(_data: unknown): YouTubeMusicSong[] { return []; }
function parsePlaylistsResponse(_data: unknown): YouTubeMusicPlaylist[] { return []; }
function parsePlaylistTracksResponse(_data: unknown): YouTubeMusicSong[] { return []; }
function parseRecommendationsResponse(_data: unknown): YouTubeMusicSong[] { return []; }
function parseWatchPlaylistResponse(_data: unknown): YouTubeMusicSong[] { return []; }

// ============================================================================
// Provider Adapter
// ============================================================================

/**
 * Adapts YouTubeMusicClient to the MusicProvider interface.
 */
export class YouTubeMusicProvider implements MusicProvider {
  readonly name = 'youtube' as const;
  private client: YouTubeMusicClient;

  constructor(client: YouTubeMusicClient) {
    this.client = client;
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  async search(query: string, limit?: number): Promise<TrackInfo[]> {
    const result = await this.client.search(query, ['songs'], { limit });
    return result.songs.map(mapSongToTrackInfo);
  }

  async getLibraryTracks(options?: { limit?: number }): Promise<TrackInfo[]> {
    const songs = await this.client.getLibrarySongs(options);
    return songs.map(mapSongToTrackInfo);
  }

  async getTopTracks(_options?: { limit?: number }): Promise<TrackInfo[]> {
    return []; // YouTube Music has no top tracks API
  }

  async getRecentlyPlayed(_options?: { limit?: number }): Promise<TrackInfo[]> {
    return []; // YouTube Music has no recently played API
  }

  async getPlaylistTracks(playlistId: string, options?: { limit?: number }): Promise<TrackInfo[]> {
    const songs = await this.client.getPlaylistTracks(playlistId, options);
    return songs.map(mapSongToTrackInfo);
  }

  async getRecommendations(options: { seedTrackIds?: string[]; limit?: number }): Promise<TrackInfo[]> {
    if (options.seedTrackIds && options.seedTrackIds.length > 0) {
      const songs = await this.client.getWatchPlaylist(options.seedTrackIds[0], { limit: options.limit });
      return songs.map(mapSongToTrackInfo);
    }
    const songs = await this.client.getRecommendations({ limit: options.limit });
    return songs.map(mapSongToTrackInfo);
  }

  async getTrackFeatures(trackIds: string[]): Promise<(AudioFeatures | null)[]> {
    return trackIds.map(() => null); // YouTube has no audio features
  }
}

export function createYouTubeMusicProvider(client: YouTubeMusicClient): MusicProvider {
  return new YouTubeMusicProvider(client);
}

// ============================================================================
// Factory
// ============================================================================

export function createYouTubeMusicClient(config: YouTubeMusicConfig): YouTubeMusicClient {
  return new YouTubeMusicClientImpl(config);
}
