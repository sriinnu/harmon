/**
 * Tests for ranking.ts - Two-phase track ranking algorithm
 */

import { describe, it, expect } from 'vitest';
import { rankTracks } from './ranking.js';
import type { TrackWithFeatures, PlayRecord } from './types.js';
import type { SessionPolicy } from '@athena/harmon-protocol';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTrack(overrides?: Partial<TrackWithFeatures>): TrackWithFeatures {
  return {
    id: overrides?.id || 'track-1',
    name: overrides?.name || 'Test Track',
    artist: overrides?.artist || 'Test Artist',
    album: overrides?.album || 'Test Album',
    durationMs: overrides?.durationMs || 180000,
    uri: overrides?.uri || 'spotify:track:123',
    features: {
      energy: 0.5,
      instrumentalness: 0.5,
      speechiness: 0.1,
      valence: 0.5,
      acousticness: 0.3,
      tempo: 120,
      danceability: 0.6,
      liveness: 0.2,
      loudness: -8,
      key: 5,
      mode: 1,
      timeSignature: 4,
      ...overrides?.features,
    },
  };
}

function createPolicy(overrides?: Partial<SessionPolicy>): SessionPolicy {
  return {
    version: 1,
    durationMs: 3600000,
    hard: {},
    soft: {
      weights: {
        energy: 1.0,
        instrumentalness: 0.8,
      },
    },
    sources: {},
    limits: {},
    ...overrides,
  };
}

function createPlayRecord(trackId: string, playedAt: number, artistIds: string[] = []): PlayRecord {
  return { trackId, artistIds, playedAt };
}

// ============================================================================
// Hard Constraints Tests
// ============================================================================

describe('rankTracks - Hard Constraints', () => {
  it('should filter out tracks with vocals when noVocals is true', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { instrumentalness: 0.8 } }),
      createTrack({ id: 'track-2', features: { instrumentalness: 0.3 } }), // Has vocals
      createTrack({ id: 'track-3', features: { instrumentalness: 0.6 } }),
    ];

    const policy = createPolicy({
      hard: { noVocals: true },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2);
    expect(ranked.map(r => r.track.id)).toEqual(['track-1', 'track-3']);
  });

  it('should filter by tempo range (min)', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { tempo: 80 } }),
      createTrack({ id: 'track-2', features: { tempo: 120 } }),
      createTrack({ id: 'track-3', features: { tempo: 160 } }),
    ];

    const policy = createPolicy({
      hard: { tempo: { min: 100 } },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2);
    expect(ranked.map(r => r.track.id)).toContain('track-2');
    expect(ranked.map(r => r.track.id)).toContain('track-3');
  });

  it('should filter by tempo range (max)', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { tempo: 80 } }),
      createTrack({ id: 'track-2', features: { tempo: 120 } }),
      createTrack({ id: 'track-3', features: { tempo: 160 } }),
    ];

    const policy = createPolicy({
      hard: { tempo: { max: 130 } },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2);
    expect(ranked.map(r => r.track.id)).toContain('track-1');
    expect(ranked.map(r => r.track.id)).toContain('track-2');
  });

  it('should filter by tempo range (min and max)', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { tempo: 80 } }),
      createTrack({ id: 'track-2', features: { tempo: 120 } }),
      createTrack({ id: 'track-3', features: { tempo: 160 } }),
    ];

    const policy = createPolicy({
      hard: { tempo: { min: 100, max: 140 } },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].track.id).toBe('track-2');
  });

  it('should filter by energy range', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { energy: 0.2 } }),
      createTrack({ id: 'track-2', features: { energy: 0.5 } }),
      createTrack({ id: 'track-3', features: { energy: 0.9 } }),
    ];

    const policy = createPolicy({
      hard: { energy: { min: 0.3, max: 0.7 } },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].track.id).toBe('track-2');
  });

  it('should filter by instrumentalness minimum', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { instrumentalness: 0.2 } }),
      createTrack({ id: 'track-2', features: { instrumentalness: 0.6 } }),
      createTrack({ id: 'track-3', features: { instrumentalness: 0.9 } }),
    ];

    const policy = createPolicy({
      hard: { instrumentalnessMin: 0.5 },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2);
    expect(ranked.map(r => r.track.id).sort()).toEqual(['track-2', 'track-3']);
  });

  it('should return empty array when all tracks filtered out', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { energy: 0.2 } }),
      createTrack({ id: 'track-2', features: { energy: 0.3 } }),
    ];

    const policy = createPolicy({
      hard: { energy: { min: 0.8 } },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(0);
  });

  it('should apply multiple hard constraints together', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { energy: 0.5, tempo: 80, instrumentalness: 0.3 } }),
      createTrack({ id: 'track-2', features: { energy: 0.7, tempo: 120, instrumentalness: 0.6 } }),
      createTrack({ id: 'track-3', features: { energy: 0.9, tempo: 140, instrumentalness: 0.8 } }),
    ];

    const policy = createPolicy({
      hard: {
        energy: { min: 0.6, max: 0.8 },
        tempo: { min: 100, max: 130 },
        instrumentalnessMin: 0.5,
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].track.id).toBe('track-2');
  });
});

// ============================================================================
// Soft Weights Scoring Tests
// ============================================================================

describe('rankTracks - Soft Weights', () => {
  it('should score tracks based on energy weight', async () => {
    const candidates = [
      createTrack({ id: 'track-low', features: { energy: 0.2 } }),
      createTrack({ id: 'track-mid', features: { energy: 0.5 } }),
      createTrack({ id: 'track-high', features: { energy: 0.8 } }),
    ];

    const policy = createPolicy({
      soft: {
        weights: { energy: 1.0 },
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(3);
    // Without arc modulation, target is 0.5, so mid should score highest
    expect(ranked[0].track.id).toBe('track-mid');
  });

  it('should score tracks based on instrumentalness weight', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { instrumentalness: 0.2 } }),
      createTrack({ id: 'track-2', features: { instrumentalness: 0.6 } }),
      createTrack({ id: 'track-3', features: { instrumentalness: 0.9 } }),
    ];

    const policy = createPolicy({
      soft: {
        weights: { instrumentalness: 1.0 },
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(3);
    expect(ranked[0].track.id).toBe('track-3');
    expect(ranked[1].track.id).toBe('track-2');
    expect(ranked[2].track.id).toBe('track-1');
  });

  it('should handle negative speechiness weight correctly', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { speechiness: 0.8 } }), // High speech (bad)
      createTrack({ id: 'track-2', features: { speechiness: 0.2 } }), // Low speech (good)
    ];

    const policy = createPolicy({
      soft: {
        weights: { speechiness: -1.0 },
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2);
    // Lower speechiness should score higher with negative weight
    expect(ranked[0].track.id).toBe('track-2');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('should combine multiple soft weights', async () => {
    const candidates = [
      createTrack({
        id: 'track-1',
        features: { energy: 0.5, instrumentalness: 0.9, valence: 0.7 },
      }),
      createTrack({
        id: 'track-2',
        features: { energy: 0.5, instrumentalness: 0.3, valence: 0.9 },
      }),
    ];

    const policy = createPolicy({
      soft: {
        weights: {
          energy: 1.0,
          instrumentalness: 2.0, // Weight this more heavily
          valence: 0.5,
        },
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2);
    // track-1 should win due to higher instrumentalness with heavier weight
    expect(ranked[0].track.id).toBe('track-1');
  });

  it('should normalize tempo weight to 0-1 range', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { tempo: 60 } }),  // Normalized: 0.0
      createTrack({ id: 'track-2', features: { tempo: 120 } }), // Normalized: 0.5
      createTrack({ id: 'track-3', features: { tempo: 180 } }), // Normalized: 1.0
    ];

    const policy = createPolicy({
      soft: {
        weights: { tempo: 1.0 },
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(3);
    expect(ranked[0].track.id).toBe('track-3'); // Highest normalized tempo
    expect(ranked[2].track.id).toBe('track-1'); // Lowest normalized tempo
  });

  it('should handle empty weights gracefully', async () => {
    const candidates = [
      createTrack({ id: 'track-1' }),
      createTrack({ id: 'track-2' }),
    ];

    const policy = createPolicy({
      soft: {
        weights: {},
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2);
    // All tracks should have same score (0)
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it('should clamp scores between 0 and 1', async () => {
    const candidates = [
      createTrack({
        id: 'track-1',
        features: { energy: 1.0, instrumentalness: 1.0, valence: 1.0 },
      }),
    ];

    const policy = createPolicy({
      soft: {
        weights: {
          energy: 10.0,
          instrumentalness: 10.0,
          valence: 10.0,
        },
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked[0].score).toBeLessThanOrEqual(1.0);
    expect(ranked[0].score).toBeGreaterThanOrEqual(0.0);
  });
});

// ============================================================================
// Energy Arc Modulation Tests
// ============================================================================

describe('rankTracks - Energy Arc', () => {
  it('should modulate energy target based on arc (ramp-up)', async () => {
    const candidates = [
      createTrack({ id: 'track-low', features: { energy: 0.3 } }),
      createTrack({ id: 'track-high', features: { energy: 0.8 } }),
    ];

    const policy = createPolicy({
      soft: {
        weights: { energy: 1.0 },
        arc: { shape: 'ramp-up' },
      },
      durationMs: 3600000, // 1 hour
    });

    // At start (0ms), target should be lower
    const rankedStart = await rankTracks(candidates, policy, [], 0);
    expect(rankedStart[0].track.id).toBe('track-low');

    // Near end (3000000ms), target should be higher
    const rankedEnd = await rankTracks(candidates, policy, [], 3000000);
    expect(rankedEnd[0].track.id).toBe('track-high');
  });

  it('should modulate energy target based on arc (ramp-down)', async () => {
    const candidates = [
      createTrack({ id: 'track-low', features: { energy: 0.3 } }),
      createTrack({ id: 'track-high', features: { energy: 0.8 } }),
    ];

    const policy = createPolicy({
      soft: {
        weights: { energy: 1.0 },
        arc: { shape: 'ramp-down' },
      },
      durationMs: 3600000,
    });

    // At start, target should be higher
    const rankedStart = await rankTracks(candidates, policy, [], 0);
    expect(rankedStart[0].track.id).toBe('track-high');

    // Near end, target should be lower
    const rankedEnd = await rankTracks(candidates, policy, [], 3000000);
    expect(rankedEnd[0].track.id).toBe('track-low');
  });

  it('should handle flat arc (no modulation)', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { energy: 0.5 } }),
    ];

    const policy = createPolicy({
      soft: {
        weights: { energy: 1.0 },
        arc: { shape: 'flat' },
      },
    });

    const rankedStart = await rankTracks(candidates, policy, [], 0);
    const rankedEnd = await rankTracks(candidates, policy, [], 3000000);

    expect(rankedStart[0].score).toBeCloseTo(rankedEnd[0].score, 2);
  });
});

// ============================================================================
// Recency Penalty Tests
// ============================================================================

describe('rankTracks - Recency Penalty', () => {
  it('should apply full penalty for recently played tracks', async () => {
    const now = Date.now();
    const candidates = [
      createTrack({ id: 'track-recent' }),
      createTrack({ id: 'track-old' }),
    ];

    const history: PlayRecord[] = [
      createPlayRecord('track-recent', now - 1000 * 60 * 60), // 1 hour ago
    ];

    const policy = createPolicy({
      soft: { weights: { energy: 1.0 } },
      limits: { repeatTrackWithinDays: 7 },
    });

    const ranked = await rankTracks(candidates, policy, history, 0);

    // Recently played track should be penalized to 0 score
    const recentTrack = ranked.find(r => r.track.id === 'track-recent');
    expect(recentTrack?.score).toBe(0);
  });

  it('should apply graduated penalty for artist repetition', async () => {
    const now = Date.now();
    const candidates = [
      createTrack({ id: 'track-1', artist: 'Artist A' }),
      createTrack({ id: 'track-2', artist: 'Artist B' }),
    ];

    const history: PlayRecord[] = [
      createPlayRecord('other-1', now - 1000 * 60 * 30, ['Artist A']), // 30 min ago
      createPlayRecord('other-2', now - 1000 * 60 * 60, ['Artist A']), // 1 hour ago
    ];

    const policy = createPolicy({
      soft: { weights: { energy: 1.0 } },
      limits: { repeatArtistWithinHours: 2 },
    });

    const ranked = await rankTracks(candidates, policy, history, 0);

    const artistATrack = ranked.find(r => r.track.id === 'track-1');
    const artistBTrack = ranked.find(r => r.track.id === 'track-2');

    // Artist A should be penalized more than Artist B
    expect(artistATrack?.score).toBeLessThan(artistBTrack?.score || 0);
  });

  it('should not penalize tracks outside recency window', async () => {
    const now = Date.now();
    const candidates = [
      createTrack({ id: 'track-1' }),
    ];

    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 60 * 24 * 8), // 8 days ago
    ];

    const policy = createPolicy({
      soft: { weights: { instrumentalness: 1.0 } },
      limits: { repeatTrackWithinDays: 7 },
    });

    const ranked = await rankTracks(candidates, policy, history, 0);

    // Should not be penalized (outside 7 day window)
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it('should handle no repetition limits', async () => {
    const now = Date.now();
    const candidates = [
      createTrack({ id: 'track-1' }),
    ];

    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60), // 1 minute ago
    ];

    const policy = createPolicy({
      soft: { weights: { instrumentalness: 1.0 } },
      // No limits specified
    });

    const ranked = await rankTracks(candidates, policy, history, 0);

    // Should not be penalized when no limits
    expect(ranked[0].score).toBeGreaterThan(0);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('rankTracks - Edge Cases', () => {
  it('should handle empty candidates array', async () => {
    const policy = createPolicy();
    const ranked = await rankTracks([], policy, [], 0);

    expect(ranked).toHaveLength(0);
  });

  it('should maintain sort order for tied scores', async () => {
    const candidates = [
      createTrack({ id: 'track-1', features: { energy: 0.5 } }),
      createTrack({ id: 'track-2', features: { energy: 0.5 } }),
      createTrack({ id: 'track-3', features: { energy: 0.5 } }),
    ];

    const policy = createPolicy({
      soft: { weights: { energy: 1.0 } },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(3);
    // All should have same score
    expect(ranked[0].score).toBe(ranked[1].score);
    expect(ranked[1].score).toBe(ranked[2].score);
  });

  it('should handle tracks with extreme feature values', async () => {
    const candidates = [
      createTrack({
        id: 'track-extreme',
        features: {
          energy: 1.0,
          instrumentalness: 1.0,
          speechiness: 0.0,
          valence: 1.0,
          acousticness: 0.0,
          tempo: 240,
        },
      }),
    ];

    const policy = createPolicy({
      soft: {
        weights: {
          energy: 1.0,
          instrumentalness: 1.0,
          speechiness: -1.0,
          valence: 1.0,
        },
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBeGreaterThanOrEqual(0);
    expect(ranked[0].score).toBeLessThanOrEqual(1);
  });

  it('should include debug reason in ranked results', async () => {
    const candidates = [
      createTrack({ id: 'track-1', name: 'Amazing Song' }),
    ];

    const policy = createPolicy();
    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked[0].reason).toBeDefined();
    expect(ranked[0].reason).toContain('Amazing Song');
    expect(ranked[0].reason).toContain('scored');
  });

  it('should handle policy with no soft or hard constraints', async () => {
    const candidates = [
      createTrack({ id: 'track-1' }),
      createTrack({ id: 'track-2' }),
    ];

    const policy: SessionPolicy = {
      version: 1,
    };

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2);
    // All tracks should pass and have equal scores
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it('should correctly rank with complex multi-constraint scenario', async () => {
    const candidates = [
      createTrack({
        id: 'perfect-match',
        artist: 'Artist X',
        features: {
          energy: 0.6,
          instrumentalness: 0.8,
          speechiness: 0.1,
          valence: 0.7,
          tempo: 120,
        },
      }),
      createTrack({
        id: 'okay-match',
        artist: 'Artist Y',
        features: {
          energy: 0.4,
          instrumentalness: 0.5,
          speechiness: 0.3,
          valence: 0.5,
          tempo: 100,
        },
      }),
      createTrack({
        id: 'fails-hard',
        artist: 'Artist Z',
        features: {
          energy: 0.2, // Fails energy constraint
          instrumentalness: 0.9,
          speechiness: 0.1,
          valence: 0.8,
          tempo: 130,
        },
      }),
    ];

    const policy = createPolicy({
      hard: {
        energy: { min: 0.3, max: 0.8 },
        tempo: { min: 90, max: 140 },
      },
      soft: {
        weights: {
          instrumentalness: 2.0,
          valence: 1.0,
          speechiness: -1.0,
        },
      },
    });

    const ranked = await rankTracks(candidates, policy, [], 0);

    expect(ranked).toHaveLength(2); // fails-hard filtered out
    expect(ranked[0].track.id).toBe('perfect-match');
    expect(ranked[1].track.id).toBe('okay-match');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});
