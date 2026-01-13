/**
 * Harmon Core - Session engine, ranking, and adaptation
 */

// Placeholder types - will be imported from built harmon-protocol
type SessionPolicy = {
  version: number;
  mode?: string;
  durationMs?: number;
  hard?: Record<string, unknown>;
  soft?: Record<string, unknown>;
};

type TrackInfo = {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  uri?: string;
};

export interface SessionEngine {
  start(policy: SessionPolicy): void;
  stop(): void;
  nudge(direction: 'calmer' | 'sharper', amount?: number): void;
  getQueue(): TrackInfo[];
  refillQueue(): void;
}

export function createEngine(): SessionEngine {
  return {
    start() {},
    stop() {},
    nudge() {},
    getQueue() { return []; },
    refillQueue() {},
  };
}

export function rankTracks(tracks: TrackInfo[], policy: SessionPolicy): TrackInfo[] {
  return tracks;
}
