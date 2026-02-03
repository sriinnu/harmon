/**
 * Harmon Spotify - Spotify API client, OAuth, and device control
 */

import { createHash, randomBytes } from 'node:crypto';
import type { DeviceInfo, TrackInfo } from '@athena/harmon-protocol';

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_WEB_BASE = 'https://open.spotify.com';
const DEFAULT_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played',
  'user-library-read',
];

// ============================================================================
// Auth Types
// ============================================================================

export interface SpotifyTokens {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiresAt: number;
}

export interface TokenStore {
  get(): Promise<SpotifyTokens | null>;
  set(tokens: SpotifyTokens | null): Promise<void>;
}

export interface SpotifyCookieRecord {
  domain: string;
  name: string;
  path: string;
  value: string;
  expires?: string | null;
  isSecure: boolean;
  isHTTPOnly: boolean;
}

export interface CookieStore {
  get(): Promise<SpotifyCookieRecord[] | null>;
  set(cookies: SpotifyCookieRecord[] | null): Promise<void>;
}

export interface SpotifyAuthConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
  tokenStore?: TokenStore;
  cookieStore?: CookieStore;
}

export interface SpotifyAuth {
  getLoginUrl(): string;
  handleCallback(code: string, state?: string): Promise<void>;
  refresh(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  setCookies(cookies: SpotifyCookieRecord[] | null): Promise<void>;
  isConnected(): boolean;
  loadTokens(): Promise<void>;
}

class SpotifyAuthImpl implements SpotifyAuth {
  private clientId: string;
  private clientSecret?: string;
  private redirectUri: string;
  private scopes: string[];
  private tokenStore?: TokenStore;
  private cookieStore?: CookieStore;
  private tokens: SpotifyTokens | null = null;
  private tokensLoaded = false;
  private cookies: SpotifyCookieRecord[] | null = null;
  private cookiesLoaded = false;
  private codeVerifier: string | null = null;
  private state: string | null = null;

  constructor(config: SpotifyAuthConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.scopes = config.scopes && config.scopes.length > 0 ? config.scopes : DEFAULT_SCOPES;
    this.tokenStore = config.tokenStore;
    this.cookieStore = config.cookieStore;
  }

  async loadTokens(): Promise<void> {
    await this.ensureTokensLoaded();
    await this.ensureCookiesLoaded();
  }

  async setCookies(cookies: SpotifyCookieRecord[] | null): Promise<void> {
    this.cookies = cookies;
    this.cookiesLoaded = true;
    await this.cookieStore?.set(cookies);
  }

  isConnected(): boolean {
    if (this.tokens !== null) return true;
    if (!this.cookiesLoaded) return false;
    return Array.isArray(this.cookies) && this.cookies.length > 0;
  }

  getLoginUrl(): string {
    this.ensureConfigured();

    this.codeVerifier = generateCodeVerifier();
    this.state = generateState();

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: generateCodeChallenge(this.codeVerifier),
      scope: this.scopes.join(' '),
      state: this.state,
    });

    return `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state?: string): Promise<void> {
    this.ensureConfigured();

    if (!code) {
      throw new Error('Missing authorization code');
    }
    if (!this.codeVerifier) {
      throw new Error('Login flow expired. Request a new login URL.');
    }
    if (this.state && state && state !== this.state) {
      throw new Error('Invalid OAuth state');
    }

    const tokens = await this.exchangeCodeForToken(code, this.codeVerifier);
    await this.saveTokens(tokens);
    this.codeVerifier = null;
    this.state = null;
  }

  async refresh(): Promise<void> {
    await this.ensureTokensLoaded();

    if (!this.tokens?.refreshToken) {
      const cookieTokens = await this.fetchCookieAccessToken();
      if (!cookieTokens) {
        throw new Error('No refresh token available');
      }
      await this.saveTokens(cookieTokens);
      return;
    }

    this.ensureConfigured();

    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refreshToken,
      client_id: this.clientId,
    });

    const headers = this.buildTokenHeaders();

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Spotify token refresh failed: ${response.status} ${detail}`);
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    const refreshed: SpotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.tokens.refreshToken,
      scope: data.scope,
      tokenType: data.token_type,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };

    await this.saveTokens(refreshed);
  }

  async logout(): Promise<void> {
    this.tokens = null;
    this.tokensLoaded = true;
    this.cookies = null;
    this.cookiesLoaded = true;
    await this.tokenStore?.set(null);
    await this.cookieStore?.set(null);
  }

  async getAccessToken(): Promise<string | null> {
    await this.ensureTokensLoaded();

    if (!this.tokens) {
      const cookieTokens = await this.fetchCookieAccessToken();
      if (!cookieTokens) {
        return null;
      }
      await this.saveTokens(cookieTokens);
    }

    const now = Date.now();
    if (this.tokens.expiresAt - now <= 60_000) {
      await this.refresh();
    }

    return this.tokens?.accessToken || null;
  }

  private async exchangeCodeForToken(code: string, verifier: string): Promise<SpotifyTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: verifier,
    });

    const headers = this.buildTokenHeaders();

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Spotify token exchange failed: ${response.status} ${detail}`);
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      tokenType: data.token_type,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
  }

  private buildTokenHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (this.clientSecret) {
      const encoded = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }

    return headers;
  }

  private async fetchCookieAccessToken(): Promise<SpotifyTokens | null> {
    await this.ensureCookiesLoaded(true);
    if (!this.cookies || this.cookies.length === 0) {
      return null;
    }

    const cookieHeader = this.buildCookieHeader(this.cookies);
    if (!cookieHeader) {
      return null;
    }

    const url = new URL(`${SPOTIFY_WEB_BASE}/get_access_token`);
    url.searchParams.set('reason', 'transport');
    url.searchParams.set('productType', 'web_player');

    const response = await fetch(url, {
      headers: {
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Spotify cookie token failed: ${response.status} ${detail}`);
    }

    const data = (await response.json()) as SpotifyWebTokenResponse;
    if (!data.accessToken) {
      return null;
    }

    return {
      accessToken: data.accessToken,
      expiresAt: data.accessTokenExpirationTimestampMs || Date.now() + 3600 * 1000,
      tokenType: data.tokenType || 'Bearer',
      scope: data.scope,
    };
  }

  private buildCookieHeader(records: SpotifyCookieRecord[]): string {
    const now = Date.now();
    const values = new Map<string, string>();

    for (const record of records) {
      if (!record.name) continue;
      if (record.expires) {
        const expiresAt = Date.parse(record.expires);
        if (Number.isFinite(expiresAt) && expiresAt <= now) {
          continue;
        }
      }
      values.set(record.name, record.value);
    }

    return Array.from(values.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private ensureConfigured(): void {
    if (!this.clientId || !this.redirectUri) {
      throw new Error('Spotify configuration missing (client ID or redirect URI).');
    }
  }

  private async ensureTokensLoaded(): Promise<void> {
    if (this.tokensLoaded) return;
    this.tokens = (await this.tokenStore?.get()) || null;
    this.tokensLoaded = true;
  }

  private async ensureCookiesLoaded(force = false): Promise<void> {
    if (this.cookiesLoaded && !force) return;
    this.cookiesLoaded = true;
    this.cookies = this.cookieStore ? await this.cookieStore.get() : null;
  }

  private async saveTokens(tokens: SpotifyTokens): Promise<void> {
    this.tokens = tokens;
    this.tokensLoaded = true;
    await this.tokenStore?.set(tokens);
  }
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface SpotifyWebTokenResponse {
  accessToken?: string;
  accessTokenExpirationTimestampMs?: number;
  tokenType?: string;
  scope?: string;
}

function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(64));
}

function generateState(): string {
  return base64UrlEncode(randomBytes(16));
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// ============================================================================
// API Client
// ============================================================================

export interface SpotifyClient {
  isConnected(): boolean;
  getDevices(): Promise<DeviceInfo[]>;
  transferTo(deviceId: string): Promise<void>;
  play(options?: { uri?: string; contextUri?: string }): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volumePercent: number): Promise<void>;
  setShuffle(state: boolean): Promise<void>;
  setRepeat(state: 'off' | 'track' | 'context'): Promise<void>;
  getNowPlaying(): Promise<TrackInfo | null>;
  addToQueue(trackUri: string): Promise<void>;
  search(query: string, types: SpotifySearchType[], options?: SpotifyListOptions): Promise<SpotifySearchResult>;
  getPlaylists(options?: SpotifyListOptions): Promise<SpotifyPagedResponse<SpotifyPlaylist>>;
  getPlaylistTracks(playlistId: string, options?: SpotifyListOptions): Promise<SpotifyPagedResponse<SpotifyPlaylistTrack>>;
  getRecentlyPlayed(options?: SpotifyHistoryOptions): Promise<SpotifyRecentlyPlayedResponse>;
  getSavedTracks(options?: SpotifyListOptions): Promise<SpotifyPagedResponse<SpotifyPlaylistTrack>>;
  getSavedAlbums(options?: SpotifyListOptions): Promise<SpotifyPagedResponse<SpotifySavedAlbum>>;
  getAudioFeatures(trackIds: string[]): Promise<AudioFeatures[]>;
  getRecommendations(options: RecommendationSeed): Promise<TrackInfo[]>;
  getTopTracks(options?: { timeRange?: TimeRange; limit?: number; offset?: number }): Promise<SpotifyPagedResponse<TrackInfo>>;
}

class SpotifyClientImpl implements SpotifyClient {
  private auth: SpotifyAuth;

  constructor(auth: SpotifyAuth) {
    this.auth = auth;
  }

  isConnected(): boolean {
    return this.auth.isConnected();
  }

  async getDevices(): Promise<DeviceInfo[]> {
    const data = await this.request<SpotifyDevicesResponse>('GET', '/me/player/devices');
    return (data.devices || []).map((device) => ({
      id: device.id,
      name: device.name,
      type: mapDeviceType(device.type),
      isActive: device.is_active,
      volumePercent: device.volume_percent,
    }));
  }

  async transferTo(deviceId: string): Promise<void> {
    await this.request('PUT', '/me/player', {
      device_ids: [deviceId],
      play: true,
    });
  }

  async play(options: { uri?: string; contextUri?: string } = {}): Promise<void> {
    const { uri, contextUri } = options;
    const body =
      typeof uri === 'string'
        ? { uris: [uri] }
        : typeof contextUri === 'string'
          ? { context_uri: contextUri }
          : undefined;
    await this.request('PUT', '/me/player/play', body);
  }

  async pause(): Promise<void> {
    await this.request('PUT', '/me/player/pause');
  }

  async next(): Promise<void> {
    await this.request('POST', '/me/player/next');
  }

  async previous(): Promise<void> {
    await this.request('POST', '/me/player/previous');
  }

  async seek(positionMs: number): Promise<void> {
    await this.request('PUT', '/me/player/seek', undefined, {
      position_ms: `${positionMs}`,
    });
  }

  async setVolume(volumePercent: number): Promise<void> {
    await this.request('PUT', '/me/player/volume', undefined, {
      volume_percent: `${volumePercent}`,
    });
  }

  async setShuffle(state: boolean): Promise<void> {
    await this.request('PUT', '/me/player/shuffle', undefined, {
      state: state ? 'true' : 'false',
    });
  }

  async setRepeat(state: 'off' | 'track' | 'context'): Promise<void> {
    await this.request('PUT', '/me/player/repeat', undefined, {
      state,
    });
  }

  async getNowPlaying(): Promise<TrackInfo | null> {
    const data = await this.request<SpotifyNowPlayingResponse>('GET', '/me/player/currently-playing');
    if (!data || !data.item || data.item.type !== 'track') {
      return null;
    }
    return mapTrack(data.item);
  }

  async addToQueue(trackUri: string): Promise<void> {
    await this.request('POST', '/me/player/queue', undefined, { uri: trackUri });
  }

  async search(
    query: string,
    types: SpotifySearchType[],
    options: SpotifyListOptions = {}
  ): Promise<SpotifySearchResult> {
    const data = await this.request<SpotifySearchResponse>('GET', '/search', undefined, {
      q: query,
      type: types.join(','),
      ...listQuery(options),
    });

    return {
      tracks: (data.tracks?.items || []).map(mapTrack),
      albums: (data.albums?.items || []).map(mapAlbum),
      artists: (data.artists?.items || []).map(mapArtist),
      playlists: (data.playlists?.items || []).map(mapPlaylist),
    };
  }

  async getPlaylists(options: SpotifyListOptions = {}): Promise<SpotifyPagedResponse<SpotifyPlaylist>> {
    const data = await this.request<SpotifyPlaylistsResponse>('GET', '/me/playlists', undefined, listQuery(options));
    return mapPagedResponse(data, mapPlaylist);
  }

  async getPlaylistTracks(
    playlistId: string,
    options: SpotifyListOptions = {}
  ): Promise<SpotifyPagedResponse<SpotifyPlaylistTrack>> {
    const data = await this.request<SpotifyPlaylistTracksResponse>(
      'GET',
      `/playlists/${playlistId}/tracks`,
      undefined,
      listQuery(options)
    );

    const items = (data.items || [])
      .map((item) => {
        if (!item.track) return null;
        if (item.track.type !== 'track') return null;
        return {
          addedAt: item.added_at,
          track: mapTrack(item.track),
        };
      })
      .filter((item): item is SpotifyPlaylistTrack => item !== null);

    return {
      items,
      total: data.total ?? items.length,
      limit: data.limit ?? options.limit ?? items.length,
      offset: data.offset ?? options.offset ?? 0,
      next: data.next ?? undefined,
      previous: data.previous ?? undefined,
    };
  }

  async getRecentlyPlayed(options: SpotifyHistoryOptions = {}): Promise<SpotifyRecentlyPlayedResponse> {
    const data = await this.request<SpotifyRecentlyPlayedRaw>('GET', '/me/player/recently-played', undefined, {
      ...historyQuery(options),
    });

    return {
      items: (data.items || [])
        .map((item) => {
          if (!item.track || item.track.type !== 'track') return null;
          return {
            playedAt: item.played_at,
            contextUri: item.context?.uri,
            track: mapTrack(item.track),
          };
        })
        .filter((item): item is SpotifyRecentlyPlayedItem => item !== null),
      next: data.next ?? undefined,
      cursors: data.cursors,
      limit: data.limit ?? options.limit ?? undefined,
    };
  }

  async getSavedTracks(options: SpotifyListOptions = {}): Promise<SpotifyPagedResponse<SpotifyPlaylistTrack>> {
    const data = await this.request<SpotifySavedTracksResponse>('GET', '/me/tracks', undefined, listQuery(options));
    const items = (data.items || [])
      .map((item) => {
        if (!item.track || item.track.type !== 'track') return null;
        return {
          addedAt: item.added_at,
          track: mapTrack(item.track),
        };
      })
      .filter((item): item is SpotifyPlaylistTrack => item !== null);

    return {
      items,
      total: data.total ?? items.length,
      limit: data.limit ?? options.limit ?? items.length,
      offset: data.offset ?? options.offset ?? 0,
      next: data.next ?? undefined,
      previous: data.previous ?? undefined,
    };
  }

  async getSavedAlbums(options: SpotifyListOptions = {}): Promise<SpotifyPagedResponse<SpotifySavedAlbum>> {
    const data = await this.request<SpotifySavedAlbumsResponse>('GET', '/me/albums', undefined, listQuery(options));
    const items = (data.items || [])
      .map((item) => {
        if (!item.album) return null;
        return {
          addedAt: item.added_at,
          album: mapAlbum(item.album),
        };
      })
      .filter((item): item is SpotifySavedAlbum => item !== null);

    return {
      items,
      total: data.total ?? items.length,
      limit: data.limit ?? options.limit ?? items.length,
      offset: data.offset ?? options.offset ?? 0,
      next: data.next ?? undefined,
      previous: data.previous ?? undefined,
    };
  }

  async getAudioFeatures(trackIds: string[]): Promise<AudioFeatures[]> {
    if (trackIds.length === 0) {
      return [];
    }

    // Spotify API allows max 100 IDs per request
    const BATCH_SIZE = 100;
    const results: AudioFeatures[] = [];

    for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
      const batch = trackIds.slice(i, i + BATCH_SIZE);
      const data = await this.request<{ audio_features: (SpotifyAudioFeaturesRaw | null)[] }>(
        'GET',
        '/audio-features',
        undefined,
        { ids: batch.join(',') }
      );

      // Filter out nulls (tracks without features)
      const batchFeatures = (data.audio_features || [])
        .filter((f): f is SpotifyAudioFeaturesRaw => f !== null)
        .map(mapAudioFeatures);

      results.push(...batchFeatures);
    }

    return results;
  }

  async getRecommendations(options: RecommendationSeed): Promise<TrackInfo[]> {
    const query: Record<string, string> = {};

    // Validate total seeds <= 5
    const totalSeeds =
      (options.seedArtists?.length || 0) +
      (options.seedTracks?.length || 0) +
      (options.seedGenres?.length || 0);

    if (totalSeeds === 0) {
      throw new Error('At least one seed (artist, track, or genre) is required');
    }
    if (totalSeeds > 5) {
      throw new Error('Maximum 5 total seeds allowed');
    }

    // Build query parameters
    if (options.seedArtists && options.seedArtists.length > 0) {
      query.seed_artists = options.seedArtists.join(',');
    }
    if (options.seedTracks && options.seedTracks.length > 0) {
      query.seed_tracks = options.seedTracks.join(',');
    }
    if (options.seedGenres && options.seedGenres.length > 0) {
      query.seed_genres = options.seedGenres.join(',');
    }

    // Target parameters
    if (typeof options.targetEnergy === 'number') {
      query.target_energy = options.targetEnergy.toString();
    }
    if (typeof options.targetInstrumentalness === 'number') {
      query.target_instrumentalness = options.targetInstrumentalness.toString();
    }
    if (typeof options.targetTempo === 'number') {
      query.target_tempo = options.targetTempo.toString();
    }

    // Min/max parameters
    if (typeof options.minEnergy === 'number') {
      query.min_energy = options.minEnergy.toString();
    }
    if (typeof options.maxEnergy === 'number') {
      query.max_energy = options.maxEnergy.toString();
    }
    if (typeof options.minInstrumentalness === 'number') {
      query.min_instrumentalness = options.minInstrumentalness.toString();
    }
    if (typeof options.maxInstrumentalness === 'number') {
      query.max_instrumentalness = options.maxInstrumentalness.toString();
    }
    if (typeof options.minTempo === 'number') {
      query.min_tempo = options.minTempo.toString();
    }
    if (typeof options.maxTempo === 'number') {
      query.max_tempo = options.maxTempo.toString();
    }

    // Limit
    if (typeof options.limit === 'number') {
      query.limit = Math.min(100, Math.max(1, options.limit)).toString();
    }

    const data = await this.request<SpotifyRecommendationsResponse>(
      'GET',
      '/recommendations',
      undefined,
      query
    );

    return (data.tracks || []).map(mapTrack);
  }

  async getTopTracks(
    options: { timeRange?: TimeRange; limit?: number; offset?: number } = {}
  ): Promise<SpotifyPagedResponse<TrackInfo>> {
    const query: Record<string, string> = {};

    if (options.timeRange) {
      query.time_range = options.timeRange;
    }
    if (typeof options.limit === 'number') {
      query.limit = options.limit.toString();
    }
    if (typeof options.offset === 'number') {
      query.offset = options.offset.toString();
    }

    const data = await this.request<SpotifyTopTracksResponse>(
      'GET',
      '/me/top/tracks',
      undefined,
      query
    );

    const tracks = (data.items || []).map(mapTrack);

    return {
      items: tracks,
      total: data.total ?? tracks.length,
      limit: data.limit ?? options.limit ?? tracks.length,
      offset: data.offset ?? options.offset ?? 0,
      next: data.next ?? undefined,
      previous: data.previous ?? undefined,
    };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>
  ): Promise<T> {
    const execute = async (token: string): Promise<Response> => {
      const url = new URL(`${SPOTIFY_API_BASE}${path}`);
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          url.searchParams.set(key, value);
        }
      }

      return fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    let token = await this.auth.getAccessToken();
    if (!token) {
      throw new Error('Spotify not connected');
    }

    let response = await execute(token);
    if (response.status === 401) {
      await this.auth.refresh();
      token = await this.auth.getAccessToken();
      if (!token) {
        throw new Error('Spotify session expired');
      }
      response = await execute(token);
    }

    if (response.status === 204) {
      return null as T;
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Spotify API error: ${response.status} ${detail}`);
    }

    return (await response.json()) as T;
  }
}

export interface SpotifySearchResult {
  tracks: TrackInfo[];
  albums: SpotifyAlbum[];
  artists: SpotifyArtist[];
  playlists: SpotifyPlaylist[];
}

export type SpotifySearchType = 'track' | 'album' | 'artist' | 'playlist';

export interface SpotifyListOptions {
  limit?: number;
  offset?: number;
}

export interface SpotifyHistoryOptions {
  limit?: number;
  after?: number;
  before?: number;
}

export interface SpotifyPagedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next?: string;
  previous?: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  owner: string;
  totalTracks: number;
  public: boolean | null;
  uri?: string;
}

export interface SpotifyPlaylistTrack {
  addedAt: string | undefined;
  track: TrackInfo;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: string[];
  releaseDate?: string;
  totalTracks?: number;
  uri?: string;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri?: string;
}

export interface SpotifySavedAlbum {
  addedAt: string | undefined;
  album: SpotifyAlbum;
}

export interface SpotifyRecentlyPlayedItem {
  playedAt: string;
  track: TrackInfo;
  contextUri: string | undefined;
}

export interface SpotifyRecentlyPlayedResponse {
  items: SpotifyRecentlyPlayedItem[];
  next?: string;
  cursors?: { after?: string; before?: string };
  limit?: number;
}

export interface AudioFeatures {
  energy: number;
  instrumentalness: number;
  speechiness: number;
  valence: number;
  acousticness: number;
  tempo: number;
  danceability: number;
  liveness: number;
  loudness: number;
  key: number;
  mode: number;
  timeSignature: number;
}

export interface RecommendationSeed {
  seedArtists?: string[];
  seedTracks?: string[];
  seedGenres?: string[];
  targetEnergy?: number;
  targetInstrumentalness?: number;
  targetTempo?: number;
  minEnergy?: number;
  maxEnergy?: number;
  minInstrumentalness?: number;
  maxInstrumentalness?: number;
  minTempo?: number;
  maxTempo?: number;
  limit?: number;
}

export type TimeRange = 'short_term' | 'medium_term' | 'long_term';

interface SpotifyDevicesResponse {
  devices: Array<{
    id: string;
    name: string;
    type: string;
    is_active: boolean;
    volume_percent?: number;
  }>;
}

interface SpotifyNowPlayingResponse {
  item?: SpotifyTrack;
}

interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  uri: string;
  type: string;
  artists: Array<{ name: string }>;
  album: { name: string };
}

interface SpotifyAlbumRaw {
  id: string;
  name: string;
  uri: string;
  release_date?: string;
  total_tracks?: number;
  artists: Array<{ name: string }>;
}

interface SpotifyArtistRaw {
  id: string;
  name: string;
  uri: string;
}

interface SpotifyPlaylistRaw {
  id: string;
  name: string;
  public: boolean | null;
  uri: string;
  owner?: { display_name?: string; id?: string };
  tracks?: { total?: number };
}

interface SpotifySearchResponse {
  tracks?: { items: SpotifyTrack[] };
  albums?: { items: SpotifyAlbumRaw[] };
  artists?: { items: SpotifyArtistRaw[] };
  playlists?: { items: SpotifyPlaylistRaw[] };
}

interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylistRaw[];
  total?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
  previous?: string | null;
}

interface SpotifyPlaylistTracksResponse {
  items: Array<{ added_at?: string; track?: SpotifyTrack }>;
  total?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
  previous?: string | null;
}

interface SpotifyRecentlyPlayedRaw {
  items?: Array<{
    played_at: string;
    context?: { uri?: string };
    track?: SpotifyTrack;
  }>;
  next?: string | null;
  cursors?: { after?: string; before?: string };
  limit?: number;
}

interface SpotifySavedTracksResponse {
  items?: Array<{ added_at?: string; track?: SpotifyTrack }>;
  total?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
  previous?: string | null;
}

interface SpotifySavedAlbumsResponse {
  items?: Array<{ added_at?: string; album?: SpotifyAlbumRaw }>;
  total?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
  previous?: string | null;
}

interface SpotifyAudioFeaturesRaw {
  energy: number;
  instrumentalness: number;
  speechiness: number;
  valence: number;
  acousticness: number;
  tempo: number;
  danceability: number;
  liveness: number;
  loudness: number;
  key: number;
  mode: number;
  time_signature: number;
}

interface SpotifyRecommendationsResponse {
  tracks: SpotifyTrack[];
  seeds?: Array<{
    initialPoolSize: number;
    afterFilteringSize: number;
    afterRelinkingSize: number;
    id: string;
    type: string;
    href: string;
  }>;
}

interface SpotifyTopTracksResponse {
  items: SpotifyTrack[];
  total?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
  previous?: string | null;
}

function mapDeviceType(rawType: string): DeviceInfo['type'] {
  const normalized = rawType.toLowerCase();
  const allowed: DeviceInfo['type'][] = [
    'speaker',
    'computer',
    'phone',
    'tablet',
    'tv',
    'cast',
  ];
  return allowed.includes(normalized as DeviceInfo['type']) ? (normalized as DeviceInfo['type']) : 'unknown';
}

function mapTrack(track: SpotifyTrack): TrackInfo {
  return {
    id: track.id,
    name: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    album: track.album?.name || '',
    durationMs: track.duration_ms,
    uri: track.uri,
  };
}

function mapArtist(artist: SpotifyArtistRaw): SpotifyArtist {
  return {
    id: artist.id,
    name: artist.name,
    uri: artist.uri,
  };
}

function mapAlbum(album: SpotifyAlbumRaw): SpotifyAlbum {
  return {
    id: album.id,
    name: album.name,
    artists: album.artists.map((artist) => artist.name),
    releaseDate: album.release_date,
    totalTracks: album.total_tracks,
    uri: album.uri,
  };
}

function mapPlaylist(playlist: SpotifyPlaylistRaw): SpotifyPlaylist {
  return {
    id: playlist.id,
    name: playlist.name,
    owner: playlist.owner?.display_name || playlist.owner?.id || 'unknown',
    totalTracks: playlist.tracks?.total ?? 0,
    public: playlist.public ?? null,
    uri: playlist.uri,
  };
}

function mapAudioFeatures(raw: SpotifyAudioFeaturesRaw): AudioFeatures {
  return {
    energy: raw.energy,
    instrumentalness: raw.instrumentalness,
    speechiness: raw.speechiness,
    valence: raw.valence,
    acousticness: raw.acousticness,
    tempo: raw.tempo,
    danceability: raw.danceability,
    liveness: raw.liveness,
    loudness: raw.loudness,
    key: raw.key,
    mode: raw.mode,
    timeSignature: raw.time_signature,
  };
}

function listQuery(options: SpotifyListOptions): Record<string, string> {
  const query: Record<string, string> = {};
  if (typeof options.limit === 'number') {
    query.limit = options.limit.toString();
  }
  if (typeof options.offset === 'number') {
    query.offset = options.offset.toString();
  }
  return query;
}

function historyQuery(options: SpotifyHistoryOptions): Record<string, string> {
  const query: Record<string, string> = {};
  if (typeof options.limit === 'number') {
    query.limit = options.limit.toString();
  }
  if (typeof options.after === 'number') {
    query.after = options.after.toString();
  }
  if (typeof options.before === 'number') {
    query.before = options.before.toString();
  }
  return query;
}

function mapPagedResponse<TInput, TOutput>(
  data: {
    items?: TInput[];
    total?: number;
    limit?: number;
    offset?: number;
    next?: string | null;
    previous?: string | null;
  },
  mapper: (item: TInput) => TOutput
): SpotifyPagedResponse<TOutput> {
  const items = (data.items || []).map(mapper);
  return {
    items,
    total: data.total ?? items.length,
    limit: data.limit ?? items.length,
    offset: data.offset ?? 0,
    next: data.next ?? undefined,
    previous: data.previous ?? undefined,
  };
}

// ============================================================================
// Factories
// ============================================================================

export function createSpotifyAuth(config: SpotifyAuthConfig): SpotifyAuth {
  return new SpotifyAuthImpl(config);
}

export function createSpotifyClient(config: { auth: SpotifyAuth }): SpotifyClient {
  return new SpotifyClientImpl(config.auth);
}
