/**
 * Harmon Apple - Apple Music API client
 */

import type { TrackInfo } from '@athena/harmon-protocol';
import type { MusicProvider, PlaybackController, AudioFeatures } from '@athena/harmon-core';

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';

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
  search(term: string, types: AppleSearchType[], options?: AppleListOptions): Promise<AppleMusicSearchResult>;
  getSong(id: string): Promise<AppleMusicSong | null>;
  getAlbum(id: string): Promise<AppleMusicAlbum | null>;
  getArtist(id: string): Promise<AppleMusicArtist | null>;
  getPlaylist(id: string): Promise<AppleMusicPlaylist | null>;
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

    const response = await fetch(url, { headers });
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
  private connected: boolean;

  constructor(client: AppleMusicClient, connected = true) {
    this.client = client;
    this.connected = connected;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async search(query: string, limit?: number): Promise<TrackInfo[]> {
    const result = await this.client.search(query, ['songs'], { limit });
    return result.songs.map(mapSongToTrackInfo);
  }

  async getLibraryTracks(options?: { limit?: number }): Promise<TrackInfo[]> {
    const songs = await this.client.getLibrarySongs(options);
    return songs.map(mapLibrarySongToTrackInfo);
  }

  async getTopTracks(_options?: { limit?: number }): Promise<TrackInfo[]> {
    // Apple Music API has no "top tracks" — return empty
    return [];
  }

  async getRecentlyPlayed(_options?: { limit?: number }): Promise<TrackInfo[]> {
    // Apple Music API /me/recent/played/tracks not yet implemented in client
    return [];
  }

  async getPlaylistTracks(_playlistId: string, _options?: { limit?: number }): Promise<TrackInfo[]> {
    // Would need playlist tracks endpoint — not in current client
    return [];
  }

  async getRecommendations(_options: { seedTrackIds?: string[]; limit?: number }): Promise<TrackInfo[]> {
    // Apple Music has recommendations but not exposed in current client
    return [];
  }

  async getTrackFeatures(trackIds: string[]): Promise<(AudioFeatures | null)[]> {
    // Apple Music has no audio features API — return nulls
    return trackIds.map(() => null);
  }
}

export function createAppleMusicProvider(client: AppleMusicClient): MusicProvider {
  return new AppleMusicProvider(client);
}

export function createAppleMusicClient(config: AppleMusicConfig): AppleMusicClient {
  return new AppleMusicClientImpl(config);
}
