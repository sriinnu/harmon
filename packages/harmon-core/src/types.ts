/**
 * Internal types for harmon-core
 */

import type { TrackInfo, SessionPolicy } from '@sriinnu/harmon-protocol';

/**
 * Audio features for track ranking.
 * Canonical definition — providers map their features to this shape.
 * Providers that don't support features (YouTube Music) return null.
 */
export interface AudioFeatures {
  energy: number;              // 0-1
  instrumentalness: number;    // 0-1
  speechiness: number;         // 0-1
  valence: number;             // 0-1
  acousticness: number;        // 0-1
  tempo: number;               // BPM
  danceability: number;        // 0-1
  liveness: number;            // 0-1
  loudness: number;            // dB
  key: number;                 // 0-11
  mode: number;                // 0 or 1
  timeSignature: number;       // 3-7
}

/**
 * Extended TrackInfo with audio features attached
 */
export interface TrackWithFeatures extends TrackInfo {
  features: AudioFeatures;
}

// ============================================================================
// Provider Abstractions
// ============================================================================

/**
 * Provider-agnostic interface for fetching music data.
 * Each music service (Spotify, Apple Music, YouTube Music) implements this.
 */
export interface MusicProvider {
  readonly name: 'spotify' | 'apple' | 'youtube' | 'local';

  isConnected(): boolean;

  /** Search for tracks */
  search(query: string, limit?: number): Promise<TrackInfo[]>;

  /** Get user's library/saved tracks */
  getLibraryTracks(options?: { limit?: number; offset?: number }): Promise<TrackInfo[]>;

  /** Get user's top/most-played tracks */
  getTopTracks(options?: { limit?: number; timeRange?: string }): Promise<TrackInfo[]>;

  /** Get recently played tracks */
  getRecentlyPlayed(options?: { limit?: number }): Promise<TrackInfo[]>;

  /** Get tracks from a specific playlist */
  getPlaylistTracks(playlistId: string, options?: { limit?: number }): Promise<TrackInfo[]>;

  /** Get recommendations based on seed tracks */
  getRecommendations(options: { seedTrackIds?: string[]; limit?: number }): Promise<TrackInfo[]>;

  /**
   * Get audio features for tracks.
   * Returns array with same length as trackIds. Null for tracks without features.
   */
  getTrackFeatures(trackIds: string[]): Promise<(AudioFeatures | null)[]>;
}

/**
 * Provider-agnostic playback controller.
 * Optional methods (seek, volume, etc.) may not be supported by all providers.
 */
export interface PlaybackController {
  readonly name: 'spotify' | 'apple' | 'youtube' | 'local';

  play(options?: { uri?: string; trackId?: string }): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek?(positionMs: number): Promise<void>;
  setVolume?(volumePercent: number): Promise<void>;
  setShuffle?(state: boolean): Promise<void>;
  setRepeat?(state: 'off' | 'track' | 'context'): Promise<void>;
  getNowPlaying(): Promise<TrackInfo | null>;
  addToQueue(trackUri: string, track?: TrackInfo): Promise<void>;
}

// ============================================================================
// Engine Types
// ============================================================================

/**
 * Track play record in history
 */
export interface PlayRecord {
  trackId: string;
  artistIds: string[];
  playedAt: number;  // timestamp ms
}

/**
 * Storage contract required by the session engine.
 * I keep this narrow so harmon-core stays decoupled from any concrete store.
 */
export interface SessionStore {
  createSession(policy: string): Promise<string>;
  endSession(id: string): Promise<void>;
  logEvent(
    type: string,
    payload: Record<string, unknown>,
    sessionId?: string
  ): Promise<string>;
}

/**
 * Session state managed by engine
 */
export interface SessionState {
  id: string;
  policy: SessionPolicy;
  startedAt: number;  // timestamp ms
  status: 'idle' | 'running' | 'paused';
  history: PlayRecord[];
  currentTrack: TrackInfo | null;
  queuedTracks: TrackInfo[];
}

/**
 * Event emitted by engine
 */
export interface EngineEvent {
  type: 'session.started' | 'session.stopped' | 'queue.refilled' | 'error';
  payload: Record<string, unknown>;
}

/**
 * Event callback type
 */
export type EventCallback = (event: EngineEvent) => void;

/**
 * Ranking result with score
 */
export interface RankedTrack {
  track: TrackWithFeatures;
  score: number;
  reason: string;  // debug info
}

/**
 * Sources configuration for fetching candidates
 */
export interface SourcesConfig {
  likedTracks?: boolean;
  topTracks?: boolean;
  recentPlays?: boolean;
  searchQueries?: string[];
  seedPlaylists?: string[];
  seedArtists?: string[];
  discovery?: {
    enabled?: boolean;
    ratio?: number;
  };
}
