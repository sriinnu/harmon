/**
 * Harmon YouTube - YouTube Music integration
 *
 * I only expose the surfaces this package can actually honor today.
 * Search and song lookup are implemented through YouTube Data API v3.
 * Reverse-engineered YouTube Music endpoints stay disabled until their
 * response parsers are covered well enough to ship honestly.
 */

import type { TrackInfo } from '@athena/harmon-protocol';
import type { MusicProvider, AudioFeatures } from '@athena/harmon-core';

const YT_DATA_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ============================================================================
// Types
// ============================================================================

export interface YouTubeMusicConfig {
  /** Google OAuth2 access token */
  accessToken?: string;
  /** YouTube Data API key (for search without auth) */
  apiKey?: string;
  /** Reserved for future YTM-internal coverage; not sufficient on its own today */
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
    if (!config.accessToken && !config.apiKey) {
      throw new Error('YouTube Music requires an access token or API key. Cookies-only mode is not implemented in this build.');
    }
    this.config = config;
  }

  isConnected(): boolean {
    return !!(this.config.accessToken || this.config.apiKey);
  }

  async search(
    query: string,
    types: YouTubeMusicSearchType[] = ['songs'],
    options: YouTubeMusicListOptions = {}
  ): Promise<YouTubeMusicSearchResult> {
    this.assertSupportedSearchTypes(types);

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
      result.songs = (data.items || [])
        .map(mapYtSearchToSong)
        .filter((song): song is YouTubeMusicSong => song !== null);
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
    throw new Error('YouTube Music library access is not implemented in this build.');
  }

  async getPlaylists(_options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicPlaylist[]> {
    throw new Error('YouTube Music playlist listing is not implemented in this build.');
  }

  async getPlaylistTracks(playlistId: string, _options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    void playlistId;
    throw new Error('YouTube Music playlist track retrieval is not implemented in this build.');
  }

  async getRecommendations(_options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    throw new Error('YouTube Music recommendations are not implemented in this build.');
  }

  async getWatchPlaylist(videoId: string, _options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    void videoId;
    throw new Error('YouTube Music watch playlists are not implemented in this build.');
  }

  /**
   * I fail fast on unsupported search modes so callers do not mistake an
   * empty result set for real album, artist, or playlist coverage.
   */
  private assertSupportedSearchTypes(types: YouTubeMusicSearchType[]): void {
    const unsupported = types.filter((type) => type !== 'songs');
    if (unsupported.length > 0) {
      throw new Error(`YouTube Music search types not implemented in this build: ${unsupported.join(', ')}`);
    }
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

function mapYtSearchToSong(item: NonNullable<YouTubeSearchResponse['items']>[0]): YouTubeMusicSong | null {
  const videoId = item.id.videoId;
  if (!videoId || !item.snippet.title || !item.snippet.channelTitle) {
    return null;
  }
  return {
    id: videoId,
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
    throw new Error('YouTube Music top tracks are not implemented in this build.');
  }

  async getRecentlyPlayed(_options?: { limit?: number }): Promise<TrackInfo[]> {
    throw new Error('YouTube Music recently played is not implemented in this build.');
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

/**
 * I create a YouTube Music client for the currently supported Data API
 * surface: song search and individual song lookup.
 */
export function createYouTubeMusicClient(config: YouTubeMusicConfig): YouTubeMusicClient {
  return new YouTubeMusicClientImpl(config);
}
