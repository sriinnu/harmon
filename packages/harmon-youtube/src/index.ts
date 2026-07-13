/**
 * Harmon YouTube - YouTube Music integration
 *
 * I keep this adapter on the official YouTube Data API.
 * That means I can support search, owned playlists, liked-library tracks,
 * playlist tracks, and heuristic (search-based) recommendations without
 * pulling in private YouTube Music endpoints that would make the runtime
 * brittle. YouTube removed the related-videos search parameter, so
 * recommendations are seeded from a video's artist/channel search, not
 * YouTube's own related-videos.
 */

import type { TrackInfo } from '@sriinnu/harmon-protocol';
import type { MusicProvider, AudioFeatures } from '@sriinnu/harmon-core';

const YT_DATA_API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_RATE_LIMIT_WAIT_MS = 10_000;

/**
 * I map non-OK Data API responses to clear errors, including the daily quota
 * exhaustion case which YouTube reports as HTTP 403 with 'quotaExceeded'.
 */
async function throwYouTubeApiError(response: Response): Promise<never> {
  const detail = await response.text();
  if (response.status === 403 && detail.includes('quotaExceeded')) {
    throw new Error('YouTube API daily quota exceeded');
  }
  throw new Error(`YouTube API error: ${response.status} ${detail}`);
}

// ============================================================================
// Types
// ============================================================================

export interface YouTubeMusicConfig {
  /** Google OAuth2 access token (static; prefer getAccessToken for long-lived clients) */
  accessToken?: string;
  /**
   * Resolves a Google OAuth2 access token per request. The token is cached
   * until a 401 response, which invalidates the cache, re-fetches once, and
   * retries the request once.
   */
  getAccessToken?: () => Promise<string | null>;
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
  private cachedAccessToken: string | null = null;

  constructor(config: YouTubeMusicConfig) {
    if (!config.accessToken && !config.getAccessToken && !config.apiKey) {
      throw new Error('YouTube Music requires an access token or API key. Cookies-only mode is not implemented in this build.');
    }
    this.config = config;
  }

  isConnected(): boolean {
    return !!(this.config.accessToken || this.config.getAccessToken || this.config.apiKey);
  }

  async search(
    query: string,
    types: YouTubeMusicSearchType[] = ['songs'],
    options: YouTubeMusicListOptions = {}
  ): Promise<YouTubeMusicSearchResult> {
    const result: YouTubeMusicSearchResult = {
      songs: [], albums: [], artists: [], playlists: [],
    };

    if (types.includes('songs')) {
      const data = await this.ytDataRequest<YouTubeSearchResponse>('/search', {
        q: query,
        type: 'video',
        videoCategoryId: '10',
        maxResults: Math.min(options.limit || 20, 50).toString(),
        part: 'snippet',
      });
      result.songs = (data.items || [])
        .map(mapYtSearchToSong)
        .filter((song): song is YouTubeMusicSong => song !== null);
    }

    if (types.includes('artists')) {
      const data = await this.ytDataRequest<YouTubeSearchResponse>('/search', {
        q: query,
        type: 'channel',
        maxResults: Math.min(options.limit || 20, 50).toString(),
        part: 'snippet',
      });
      result.artists = (data.items || [])
        .map(mapYtSearchToArtist)
        .filter((artist): artist is YouTubeMusicArtist => artist !== null);
    }

    if (types.includes('playlists')) {
      const data = await this.ytDataRequest<YouTubeSearchResponse>('/search', {
        q: query,
        type: 'playlist',
        maxResults: Math.min(options.limit || 20, 50).toString(),
        part: 'snippet',
      });
      result.playlists = (data.items || [])
        .map(mapYtSearchToPlaylist)
        .filter((playlist): playlist is YouTubeMusicPlaylist => playlist !== null);
    }

    if (types.includes('albums')) {
      const data = await this.ytDataRequest<YouTubeSearchResponse>('/search', {
        q: `${query} album`,
        type: 'playlist',
        maxResults: Math.min(options.limit || 20, 50).toString(),
        part: 'snippet',
      });
      result.albums = (data.items || [])
        .map(mapYtSearchToAlbum)
        .filter((album): album is YouTubeMusicAlbum => album !== null);
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
    const likesPlaylistId = await this.getLikesPlaylistId();
    return this.getPlaylistTracks(likesPlaylistId, _options);
  }

  async getPlaylists(options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicPlaylist[]> {
    this.requireAuthorizedUserSurface('YouTube Music playlist listing');

    const data = await this.ytDataRequest<YouTubePlaylistsResponse>('/playlists', {
      mine: 'true',
      maxResults: Math.min(options.limit || 20, 50).toString(),
      part: 'snippet,contentDetails',
    });

    return (data.items || [])
      .map(mapPlaylistListItem)
      .filter((playlist): playlist is YouTubeMusicPlaylist => playlist !== null);
  }

  async getPlaylistTracks(playlistId: string, options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    const data = await this.ytDataRequest<YouTubePlaylistItemsResponse>('/playlistItems', {
      playlistId,
      maxResults: Math.min(options.limit || 20, 50).toString(),
      part: 'snippet,contentDetails',
    });

    return (data.items || [])
      .map(mapPlaylistItemToSong)
      .filter((song): song is YouTubeMusicSong => song !== null);
  }

  /**
   * I build heuristic (search-based) recommendations seeded from the user's
   * library, since YouTube removed the related-videos search parameter.
   */
  async getRecommendations(options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    const seedSong = (await this.getLibrarySongs({ limit: 1 }))[0];
    if (!seedSong) {
      return [];
    }
    return this.getWatchPlaylist(seedSong.id, options);
  }

  /**
   * I approximate a "watch playlist" with a search-based heuristic: I look up
   * the seed video's metadata, search songs by its artist/channel name (with
   * any ' - Topic' suffix stripped), and exclude the seed itself. YouTube
   * removed the `relatedToVideoId` search parameter, so these are heuristic
   * recommendations, not YouTube's related-videos.
   */
  async getWatchPlaylist(videoId: string, options: YouTubeMusicListOptions = {}): Promise<YouTubeMusicSong[]> {
    const seed = await this.getSong(videoId);
    if (!seed) {
      return [];
    }

    const limit = Math.min(options.limit || 20, 50);
    // Ask for one extra result so excluding the seed still fills the limit.
    const result = await this.search(seed.artistName, ['songs'], { limit: Math.min(limit + 1, 50) });
    return result.songs
      .filter((song) => song.id !== videoId)
      .slice(0, limit);
  }

  /**
   * I keep user-library surfaces behind OAuth because API-key access cannot
   * read a signed-in user's playlists or likes.
   */
  private requireAuthorizedUserSurface(surface: string): void {
    if (!this.config.accessToken && !this.config.getAccessToken) {
      throw new Error(`${surface} requires YOUTUBE_MUSIC_ACCESS_TOKEN or GOOGLE_ACCESS_TOKEN.`);
    }
  }

  private async getLikesPlaylistId(): Promise<string> {
    this.requireAuthorizedUserSurface('YouTube Music library access');

    const data = await this.ytDataRequest<YouTubeChannelsResponse>('/channels', {
      mine: 'true',
      part: 'contentDetails',
      maxResults: '1',
    });
    const likesPlaylistId = data.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
    if (!likesPlaylistId) {
      throw new Error('YouTube Music liked tracks playlist was not available for the authenticated user.');
    }
    return likesPlaylistId;
  }

  /**
   * I resolve the access token for a request: static config token first,
   * then the getAccessToken callback with simple caching until a 401.
   */
  private async resolveAccessToken(forceRefresh = false): Promise<string | null> {
    if (this.config.accessToken) {
      return this.config.accessToken;
    }
    if (!this.config.getAccessToken) {
      return null;
    }
    if (!forceRefresh && this.cachedAccessToken) {
      return this.cachedAccessToken;
    }
    this.cachedAccessToken = await this.config.getAccessToken();
    return this.cachedAccessToken;
  }

  private async ytDataRequest<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${YT_DATA_API_BASE}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const execute = async (token: string | null): Promise<Response> => {
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      } else if (this.config.apiKey) {
        url.searchParams.set('key', this.config.apiKey);
      }
      return fetch(url, { headers });
    };

    let token = await this.resolveAccessToken();
    let response = await execute(token);

    // On 401 with a token callback: invalidate the cache, re-fetch the token
    // once, and retry the request once.
    if (response.status === 401 && this.config.getAccessToken && !this.config.accessToken) {
      this.cachedAccessToken = null;
      token = await this.resolveAccessToken(true);
      response = await execute(token);
    }

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
      if (retryAfter * 1000 > MAX_RATE_LIMIT_WAIT_MS) {
        throw new Error(`YouTube API rate limited; retry after ${retryAfter}s`);
      }
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      response = await execute(token);
    }

    if (!response.ok) {
      await throwYouTubeApiError(response);
    }

    return (await response.json()) as T;
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface YouTubeSearchResponse {
  items?: Array<{
    id: { videoId?: string; channelId?: string; playlistId?: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails?: { medium?: { url?: string } };
      description?: string;
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

interface YouTubePlaylistItemsResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: { medium?: { url?: string } };
      resourceId?: { videoId?: string };
    };
    contentDetails?: { videoId?: string };
  }>;
}

interface YouTubePlaylistsResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: { medium?: { url?: string } };
    };
    contentDetails?: { itemCount?: number };
  }>;
}

interface YouTubeChannelsResponse {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: {
        likes?: string;
      };
    };
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

function mapYtSearchToArtist(item: NonNullable<YouTubeSearchResponse['items']>[0]): YouTubeMusicArtist | null {
  const artistId = item.id.channelId;
  if (!artistId || !item.snippet.title) {
    return null;
  }
  return {
    id: artistId,
    name: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url,
  };
}

function mapYtSearchToPlaylist(item: NonNullable<YouTubeSearchResponse['items']>[0]): YouTubeMusicPlaylist | null {
  const playlistId = item.id.playlistId;
  if (!playlistId || !item.snippet.title) {
    return null;
  }
  return {
    id: playlistId,
    name: item.snippet.title,
    author: item.snippet.channelTitle,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url,
  };
}

function mapYtSearchToAlbum(item: NonNullable<YouTubeSearchResponse['items']>[0]): YouTubeMusicAlbum | null {
  const playlist = mapYtSearchToPlaylist(item);
  if (!playlist) {
    return null;
  }
  return {
    id: playlist.id,
    name: playlist.name,
    artistName: playlist.author || 'YouTube Music',
    thumbnailUrl: playlist.thumbnailUrl,
  };
}

function mapPlaylistListItem(item: NonNullable<YouTubePlaylistsResponse['items']>[0]): YouTubeMusicPlaylist | null {
  if (!item.id || !item.snippet?.title) {
    return null;
  }
  return {
    id: item.id,
    name: item.snippet.title,
    author: item.snippet.channelTitle,
    trackCount: item.contentDetails?.itemCount,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url,
  };
}

function mapPlaylistItemToSong(
  item: NonNullable<YouTubePlaylistItemsResponse['items']>[0],
): YouTubeMusicSong | null {
  const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
  const title = item.snippet?.title;
  const channelTitle = item.snippet?.channelTitle;

  if (!videoId || !title || !channelTitle || title === 'Deleted video' || title === 'Private video') {
    return null;
  }

  return {
    id: videoId,
    name: title,
    artistName: channelTitle.replace(/ - Topic$/, ''),
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
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

  /**
   * I reject synthetic top-track semantics so the YouTube provider stays
   * aligned with what the official API actually exposes.
   */
  async getTopTracks(options?: { limit?: number }): Promise<TrackInfo[]> {
    void options;
    throw new Error('YouTube Music top tracks are not available from the official provider contract. Use recently played or library tracks instead.');
  }

  /**
   * I reject synthetic recently-played semantics for the same reason as
   * getTopTracks: the official Data API exposes no listening history.
   */
  async getRecentlyPlayed(options?: { limit?: number }): Promise<TrackInfo[]> {
    void options;
    throw new Error('YouTube Music recently played is not supported by the YouTube Data API. Use library tracks instead.');
  }

  async getPlaylistTracks(playlistId: string, options?: { limit?: number }): Promise<TrackInfo[]> {
    const songs = await this.client.getPlaylistTracks(playlistId, options);
    return songs.map(mapSongToTrackInfo);
  }

  /**
   * Heuristic (search-based) recommendations — seeded by the video's
   * artist/channel, not YouTube's related-videos (that API was removed).
   */
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
