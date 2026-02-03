/**
 * Internal types for harmon-core
 */

import type { TrackInfo, SessionPolicy } from '@athena/harmon-protocol';

/**
 * Audio features from Spotify (extended TrackInfo)
 */
export interface TrackWithFeatures extends TrackInfo {
  features: AudioFeatures;
}

/**
 * Spotify audio features (maps to Spotify API response)
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
 * Track play record in history
 */
export interface PlayRecord {
  trackId: string;
  artistIds: string[];
  playedAt: number;  // timestamp ms
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
  seedPlaylists?: string[];
  seedArtists?: string[];
  discovery?: {
    enabled: boolean;
    ratio: number;
  };
}
