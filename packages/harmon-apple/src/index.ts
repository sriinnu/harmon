/**
 * Harmon Apple - Apple Music API client
 */

import type { TrackInfo } from '@sriinnu/harmon-protocol';
import type { MusicProvider, PlaybackController, AudioFeatures } from '@sriinnu/harmon-core';

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';
const MAX_RATE_LIMIT_WAIT_MS = 10_000;
const MAX_RETRIES = 2;

export interface AppleMusicConfig {
  developerToken: string;
  userToken?: string;
  storefront?: string;
}

export type AppleSearchType = 'songs' | 'albums' | 'artists' | 'playlists';

export interface AppleListOptions {
  limit?: number;
  offset?: number;
}

export interface AppleMusicSearchResult {
  songs: AppleMusicSong[];
  albums: AppleMusicAlbum[];
  artists: AppleMusicArtist[];
  playlists: AppleMusicPlaylist[];
}

export interface AppleMusicSong {
  id: string;
  name: string;
  artistName: string;
  albumName?: string;
  durationMs?: number;
  url?: string;
}

export interface AppleMusicAlbum {
  id: string;
  name: string;
  artistName: string;
  releaseDate?: string;
  trackCount?: number;
  url?: string;
}

export interface AppleMusicArtist {
  id: string;
  name: string;
  url?: string;
}

export interface AppleMusicPlaylist {
  id: string;
  name: string;
  curatorName?: string;
  trackCount?: number;
  url?: string;
}

export interface AppleMusicLibrarySong {
  id: string;
  name: string;
  artistName: string;
  albumName?: string;
}

export interface AppleMusicLibraryAlbum {
  id: string;
  name: string;
  artistName: string;
  trackCount?: number;
}

export interface AppleMusicLibraryPlaylist {
  id: string;
  name: string;
  trackCount?: number;
}

export interface AppleMusicClient {
  /**
   * Reports credential-derived connectivity: a developer token enables
   * catalog endpoints. Library endpoints additionally need a user token —
   * check hasUserToken() for that surface.
   */
  isConnected?(): boolean;
  /** True when a Music-User-Token is configured (library endpoints usable). */
  hasUserToken?(): boolean;
  /** Apply or clear the Music-User-Token at runtime. */
  setUserToken?(token: string | undefined): void;
  search(term: string, types: AppleSearchType[], options?: AppleListOptions): Promise<AppleMusicSearchResult>;
  getSong(id: string): Promise<AppleMusicSong | null>;
  getAlbum(id: string): Promise<AppleMusicAlbum | null>;
  getArtist(id: string): Promise<AppleMusicArtist | null>;
  getPlaylist(id: string): Promise<AppleMusicPlaylist | null>;
  getPlaylistTracks(id: string, options?: AppleListOptions): Promise<AppleMusicSong[]>;
  getRecentlyPlayedTracks(options?: AppleListOptions): Promise<AppleMusicSong[]>;
  getLibrarySongs(options?: AppleListOptions): Promise<AppleMusicLibrarySong[]>;
  getLibraryAlbums(options?: AppleListOptions): Promise<AppleMusicLibraryAlbum[]>;
  getLibraryPlaylists(options?: AppleListOptions): Promise<AppleMusicLibraryPlaylist[]>;
}

class AppleMusicClientImpl implements AppleMusicClient {
  private developerToken: string;
  private userToken?: string;
  private storefront: string;

  constructor(config: AppleMusicConfig) {
    if (!config.developerToken) {
      throw new Error('Missing Apple Music developer token');
    }
    this.developerToken = config.developerToken;
    this.userToken = config.userToken;
    this.storefront = config.storefront || 'us';
  }

  isConnected(): boolean {
    return Boolean(this.developerToken);
  }

  hasUserToken(): boolean {
    return Boolean(this.userToken);
  }

  /**
   * Apply a MusicKit user token at runtime (e.g. after the daemon's
   * set-user-token auth flow) so library endpoints activate without a
   * client rebuild.
   */
  setUserToken(token: string | undefined): void {
    this.userToken = token && token.length > 0 ? token : undefined;
  }

  async search(
    term: string,
    types: AppleSearchType[],
    options: AppleListOptions = {}
  ): Promise<AppleMusicSearchResult> {
    const data = await this.request<AppleSearchResponse>(
      `/catalog/${this.storefront}/search`,
      {
        term,
        types: types.join(','),
        ...listQuery(options),
      }
    );

    return {
      songs: (data.results?.songs?.data || []).map(mapSong),
      albums: (data.results?.albums?.data || []).map(mapAlbum),
      artists: (data.results?.artists?.data || []).map(mapArtist),
      playlists: (data.results?.playlists?.data || []).map(mapPlaylist),
    };
  }

  async getSong(id: string): Promise<AppleMusicSong | null> {
    const data = await this.request<AppleCatalogResponse<AppleSongAttributes>>(
      `/catalog/${this.storefront}/songs/${id}`
    );
    return data.data?.[0] ? mapSong(data.data[0]) : null;
  }

  async getAlbum(id: string): Promise<AppleMusicAlbum | null> {
    const data = await this.request<AppleCatalogResponse<AppleAlbumAttributes>>(
      `/catalog/${this.storefront}/albums/${id}`
    );
    return data.data?.[0] ? mapAlbum(data.data[0]) : null;
  }

  async getArtist(id: string): Promise<AppleMusicArtist | null> {
    const data = await this.request<AppleCatalogResponse<AppleArtistAttributes>>(
      `/catalog/${this.storefront}/artists/${id}`
    );
    return data.data?.[0] ? mapArtist(data.data[0]) : null;
  }

  async getPlaylist(id: string): Promise<AppleMusicPlaylist | null> {
    const data = await this.request<AppleCatalogResponse<ApplePlaylistAttributes>>(
      `/catalog/${this.storefront}/playlists/${id}`
    );
    return data.data?.[0] ? mapPlaylist(data.data[0]) : null;
  }

  /**
   * I route playlist IDs by prefix: 'pl.' is a catalog playlist, 'p.'/'i.'
   * are library playlists. Only ambiguous IDs fall back to try-both.
   */
  async getPlaylistTracks(id: string, options: AppleListOptions = {}): Promise<AppleMusicSong[]> {
    if (isLibraryPlaylistId(id)) {
      return this.getLibraryPlaylistTracks(id, options);
    }
    if (isCatalogPlaylistId(id) || !this.userToken) {
      return this.getCatalogPlaylistTracks(id, options);
    }

    // Ambiguous prefix: try library first, fall back to catalog on 404.
    try {
      return await this.getLibraryPlaylistTracks(id, options);
    } catch (error) {
      if (!isAppleNotFoundError(error)) {
        throw error;
      }
    }
    return this.getCatalogPlaylistTracks(id, options);
  }

  private async getLibraryPlaylistTracks(id: string, options: AppleListOptions): Promise<AppleMusicSong[]> {
    const libraryTracks = await this.request<AppleCatalogResponse<AppleLibrarySongAttributes>>(
      `/me/library/playlists/${id}/tracks`,
      listQuery(options),
      true,
    );
    return (libraryTracks.data || []).map(mapLibrarySongToAppleMusicSong);
  }

  private async getCatalogPlaylistTracks(id: string, options: AppleListOptions): Promise<AppleMusicSong[]> {
    const data = await this.request<AppleCatalogResponse<AppleSongAttributes>>(
      `/catalog/${this.storefront}/playlists/${id}/tracks`,
      listQuery(options),
    );
    return (data.data || []).map(mapSong);
  }

  /**
   * `/me/recent/played/tracks` can return catalog songs, library-songs, and
   * stations, so I keep only song resources and map them defensively.
   */
  async getRecentlyPlayedTracks(options: AppleListOptions = {}): Promise<AppleMusicSong[]> {
    const data = await this.request<AppleCatalogResponse<Partial<AppleSongAttributes>>>(
      '/me/recent/played/tracks',
      listQuery(options),
      true,
    );
    return (data.data || [])
      .filter((resource) => resource.type === undefined || resource.type === 'songs' || resource.type === 'library-songs')
      .map(mapRecentlyPlayedSong);
  }

  async getLibrarySongs(options: AppleListOptions = {}): Promise<AppleMusicLibrarySong[]> {
    const data = await this.request<AppleCatalogResponse<AppleLibrarySongAttributes>>(
      '/me/library/songs',
      listQuery(options),
      true
    );
    return (data.data || []).map(mapLibrarySong);
  }

  async getLibraryAlbums(options: AppleListOptions = {}): Promise<AppleMusicLibraryAlbum[]> {
    const data = await this.request<AppleCatalogResponse<AppleLibraryAlbumAttributes>>(
      '/me/library/albums',
      listQuery(options),
      true
    );
    return (data.data || []).map(mapLibraryAlbum);
  }

  async getLibraryPlaylists(options: AppleListOptions = {}): Promise<AppleMusicLibraryPlaylist[]> {
    const data = await this.request<AppleCatalogResponse<AppleLibraryPlaylistAttributes>>(
      '/me/library/playlists',
      listQuery(options),
      true
    );
    return (data.data || []).map(mapLibraryPlaylist);
  }

  private async request<T>(
    path: string,
    query?: Record<string, string>,
    requireUserToken = false
  ): Promise<T> {
    const url = new URL(`${APPLE_MUSIC_API_BASE}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.developerToken}`,
    };

    if (requireUserToken) {
      if (!this.userToken) {
        throw new Error('Apple Music user token required for library endpoints');
      }
      headers['Music-User-Token'] = this.userToken;
    }

    let response = await fetch(url, { headers });

    // Retry 429/5xx up to 2 times, honoring Retry-After with a 10s cap.
    let retries = 0;
    while ((response.status === 429 || response.status >= 500) && retries < MAX_RETRIES) {
      const retryAfter = Number.parseInt(response.headers.get('Retry-After') || '1', 10);
      const delayMs = Math.min((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1) * 1000, MAX_RATE_LIMIT_WAIT_MS);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      response = await fetch(url, { headers });
      retries++;
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Apple Music API error: ${response.status} ${detail}`);
    }

    return (await response.json()) as T;
  }
}

interface AppleSearchResponse {
  results?: {
    songs?: AppleCatalogResponse<AppleSongAttributes>;
    albums?: AppleCatalogResponse<AppleAlbumAttributes>;
    artists?: AppleCatalogResponse<AppleArtistAttributes>;
    playlists?: AppleCatalogResponse<ApplePlaylistAttributes>;
  };
}

interface AppleCatalogResponse<TAttributes> {
  data?: Array<AppleCatalogResource<TAttributes>>;
}

interface AppleCatalogResource<TAttributes> {
  id: string;
  type?: string;
  attributes: TAttributes;
}

interface AppleSongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
  durationInMillis?: number;
  url?: string;
}

interface AppleAlbumAttributes {
  name: string;
  artistName: string;
  releaseDate?: string;
  trackCount?: number;
  url?: string;
}

interface AppleArtistAttributes {
  name: string;
  url?: string;
}

interface ApplePlaylistAttributes {
  name: string;
  curatorName?: string;
  trackCount?: number;
  url?: string;
}

interface AppleLibrarySongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
}

interface AppleLibraryAlbumAttributes {
  name: string;
  artistName: string;
  trackCount?: number;
}

interface AppleLibraryPlaylistAttributes {
  name: string;
  trackCount?: number;
}

function listQuery(options: AppleListOptions): Record<string, string> {
  const query: Record<string, string> = {};
  if (typeof options.limit === 'number') {
    query.limit = options.limit.toString();
  }
  if (typeof options.offset === 'number') {
    query.offset = options.offset.toString();
  }
  return query;
}

function mapSong(resource: AppleCatalogResource<AppleSongAttributes>): AppleMusicSong {
  return {
    id: resource.id,
    name: resource.attributes.name,
    artistName: resource.attributes.artistName,
    albumName: resource.attributes.albumName,
    durationMs: resource.attributes.durationInMillis,
    url: resource.attributes.url,
  };
}

/**
 * Defensive mapper for the recent-played surface, where attributes may be
 * partial (library-songs, stations, or sparse catalog resources).
 */
function mapRecentlyPlayedSong(resource: AppleCatalogResource<Partial<AppleSongAttributes>>): AppleMusicSong {
  const attributes = resource.attributes ?? {};
  return {
    id: resource.id,
    name: attributes.name || 'Unknown',
    artistName: attributes.artistName || 'Unknown',
    albumName: attributes.albumName,
    durationMs: attributes.durationInMillis ?? 0,
    url: attributes.url,
  };
}

function mapAlbum(resource: AppleCatalogResource<AppleAlbumAttributes>): AppleMusicAlbum {
  return {
    id: resource.id,
    name: resource.attributes.name,
    artistName: resource.attributes.artistName,
    releaseDate: resource.attributes.releaseDate,
    trackCount: resource.attributes.trackCount,
    url: resource.attributes.url,
  };
}

function mapArtist(resource: AppleCatalogResource<AppleArtistAttributes>): AppleMusicArtist {
  return {
    id: resource.id,
    name: resource.attributes.name,
    url: resource.attributes.url,
  };
}

function mapPlaylist(resource: AppleCatalogResource<ApplePlaylistAttributes>): AppleMusicPlaylist {
  return {
    id: resource.id,
    name: resource.attributes.name,
    curatorName: resource.attributes.curatorName,
    trackCount: resource.attributes.trackCount,
    url: resource.attributes.url,
  };
}

function mapLibrarySong(resource: AppleCatalogResource<AppleLibrarySongAttributes>): AppleMusicLibrarySong {
  return {
    id: resource.id,
    name: resource.attributes.name,
    artistName: resource.attributes.artistName,
    albumName: resource.attributes.albumName,
  };
}

function mapLibrarySongToAppleMusicSong(
  resource: AppleCatalogResource<AppleLibrarySongAttributes>,
): AppleMusicSong {
  return {
    id: resource.id,
    name: resource.attributes.name,
    artistName: resource.attributes.artistName,
    albumName: resource.attributes.albumName,
  };
}

function mapLibraryAlbum(resource: AppleCatalogResource<AppleLibraryAlbumAttributes>): AppleMusicLibraryAlbum {
  return {
    id: resource.id,
    name: resource.attributes.name,
    artistName: resource.attributes.artistName,
    trackCount: resource.attributes.trackCount,
  };
}

function mapLibraryPlaylist(resource: AppleCatalogResource<AppleLibraryPlaylistAttributes>): AppleMusicLibraryPlaylist {
  return {
    id: resource.id,
    name: resource.attributes.name,
    trackCount: resource.attributes.trackCount,
  };
}

/** Map Apple Music song to provider-agnostic TrackInfo */
function mapSongToTrackInfo(song: AppleMusicSong): TrackInfo {
  return {
    id: song.id,
    name: song.name,
    artist: song.artistName,
    album: song.albumName || '',
    durationMs: song.durationMs || 0,
    uri: song.url || `apple:song:${song.id}`,
    provider: 'apple',
  };
}

function mapLibrarySongToTrackInfo(song: AppleMusicLibrarySong): TrackInfo {
  return {
    id: song.id,
    name: song.name,
    artist: song.artistName,
    album: song.albumName || '',
    durationMs: 0,
    uri: `apple:song:${song.id}`,
    provider: 'apple',
  };
}

/**
 * Adapts AppleMusicClient to the MusicProvider interface.
 */
export class AppleMusicProvider implements MusicProvider {
  readonly name = 'apple' as const;
  private client: AppleMusicClient;
  private connectedOverride?: boolean;

  constructor(client: AppleMusicClient, connected?: boolean) {
    this.client = client;
    this.connectedOverride = connected;
  }

  /**
   * By default I derive connectivity from the client's credentials
   * (developer token present = catalog OK; a missing user token only limits
   * library endpoints). An explicit constructor override still wins for
   * callers that rely on it.
   */
  isConnected(): boolean {
    if (this.connectedOverride !== undefined) {
      return this.connectedOverride;
    }
    return this.client.isConnected?.() ?? true;
  }

  async search(query: string, limit?: number): Promise<TrackInfo[]> {
    const result = await this.client.search(query, ['songs'], { limit });
    return result.songs.map(mapSongToTrackInfo);
  }

  async getLibraryTracks(options?: { limit?: number }): Promise<TrackInfo[]> {
    const songs = await this.client.getLibrarySongs(options);
    return songs.map(mapLibrarySongToTrackInfo);
  }

  /**
   * I reject synthetic top-track semantics so the Apple provider stays honest
   * about the personal-history surface it actually implements.
   */
  async getTopTracks(options?: { limit?: number }): Promise<TrackInfo[]> {
    void options;
    throw new Error('Apple Music top tracks are not available from the current provider contract. Use recently played tracks instead.');
  }

  async getRecentlyPlayed(options?: { limit?: number }): Promise<TrackInfo[]> {
    const songs = await this.client.getRecentlyPlayedTracks(options);
    return songs.map(mapSongToTrackInfo);
  }

  async getPlaylistTracks(playlistId: string, options?: { limit?: number }): Promise<TrackInfo[]> {
    const songs = await this.client.getPlaylistTracks(playlistId, options);
    return songs.map(mapSongToTrackInfo);
  }

  /**
   * I build Apple recommendations from the user's recent plays plus catalog
   * artist searches because Apple does not expose a simple seed-track
   * recommendations endpoint that matches the shared provider contract.
   */
  async getRecommendations(options: { seedTrackIds?: string[]; limit?: number }): Promise<TrackInfo[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
    const seeds = await this.resolveRecommendationSeeds(options.seedTrackIds);
    if (seeds.length === 0) {
      return [];
    }

    const perSeed = Math.max(2, Math.ceil(limit / seeds.length));
    const excludedIds = new Set(seeds.map((seed) => seed.id));
    const recommendations: TrackInfo[] = [];
    const seen = new Set<string>();

    for (const seed of seeds) {
      const searchTerm = [seed.artistName, seed.albumName].filter(Boolean).join(' ').trim() || seed.name;
      const result = await this.client.search(searchTerm, ['songs'], { limit: perSeed + 4 });
      for (const song of result.songs) {
        if (excludedIds.has(song.id) || seen.has(song.id)) {
          continue;
        }
        seen.add(song.id);
        recommendations.push(mapSongToTrackInfo(song));
        if (recommendations.length >= limit) {
          return recommendations;
        }
      }
    }

    return recommendations;
  }

  async getTrackFeatures(trackIds: string[]): Promise<(AudioFeatures | null)[]> {
    // Apple Music has no audio features API — return nulls
    return trackIds.map(() => null);
  }

  /**
   * I prefer explicit seed tracks and fall back to recent listening history so
   * recommendation discovery remains provider-aware for Apple sessions.
   */
  private async resolveRecommendationSeeds(seedTrackIds?: string[]): Promise<AppleMusicSong[]> {
    const explicitSeeds = await Promise.all(
      (seedTrackIds || [])
        .slice(0, 3)
        .map(async (trackId) => this.client.getSong(trackId)),
    );
    const resolvedSeeds = explicitSeeds.filter((song): song is AppleMusicSong => Boolean(song));
    if (resolvedSeeds.length > 0) {
      return resolvedSeeds;
    }
    return this.client.getRecentlyPlayedTracks({ limit: 3 });
  }
}

export function createAppleMusicProvider(client: AppleMusicClient): MusicProvider {
  return new AppleMusicProvider(client);
}

export function createAppleMusicClient(config: AppleMusicConfig): AppleMusicClient {
  return new AppleMusicClientImpl(config);
}

function isAppleNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Apple Music API error: 404');
}

/** Apple catalog playlist IDs start with 'pl.'. */
function isCatalogPlaylistId(id: string): boolean {
  return id.startsWith('pl.');
}

/** Apple library playlist IDs start with 'p.' (or 'i.' for library items). */
function isLibraryPlaylistId(id: string): boolean {
  return !isCatalogPlaylistId(id) && (id.startsWith('p.') || id.startsWith('i.'));
}
