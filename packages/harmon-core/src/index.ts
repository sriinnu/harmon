/**
 * Harmon Core - Session engine, ranking, and adaptation
 */

export { createEngine } from './engine.js';
export { rankTracks } from './ranking.js';
export { fetchCandidates } from './sources.js';
export { calculateArcModulation } from './arc.js';
export { checkRecencyPenalty, getRecentPlays, getRecentArtists } from './history.js';

export type {
  SessionEngine,
} from './engine.js';

export type {
  AudioFeatures,
  TrackWithFeatures,
  PlayRecord,
  SessionState,
  EngineEvent,
  EventCallback,
  RankedTrack,
  SourcesConfig,
} from './types.js';
