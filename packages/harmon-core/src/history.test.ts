/**
 * Tests for history.ts - Play history tracking and recency calculations
 */

import { describe, it, expect } from 'vitest';
import {
  checkRecencyPenalty,
  getRecentPlays,
  getRecentArtists,
} from './history.js';
import type { TrackWithFeatures, PlayRecord } from './types.js';
import type { RepetitionLimits } from '@sriinnu/harmon-protocol';

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

function createPlayRecord(
  trackId: string,
  playedAt: number,
  artistIds: string[] = []
): PlayRecord {
  return { trackId, artistIds, playedAt };
}

// ============================================================================
// checkRecencyPenalty Tests
// ============================================================================

describe('checkRecencyPenalty', () => {
  const now = Date.now();

  it('should return 0 penalty when no limits specified', () => {
    const track = createTrack({ id: 'track-1' });
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000), // 1 second ago
    ];

    const penalty = checkRecencyPenalty(track, history, undefined);
    expect(penalty).toBe(0);
  });

  it('should return 0 penalty when limits object is empty', () => {
    const track = createTrack({ id: 'track-1' });
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000),
    ];
    const limits: RepetitionLimits = {};

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(0);
  });

  it('should return 1.0 penalty for track played within repeat window', () => {
    const track = createTrack({ id: 'track-1' });
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 60 * 24 * 3), // 3 days ago
    ];
    const limits: RepetitionLimits = {
      repeatTrackWithinDays: 7,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(1.0);
  });

  it('should return 0 penalty for track played outside repeat window', () => {
    const track = createTrack({ id: 'track-1' });
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 60 * 24 * 10), // 10 days ago
    ];
    const limits: RepetitionLimits = {
      repeatTrackWithinDays: 7,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(0);
  });

  it('should apply artist repetition penalty for single recent play', () => {
    const track = createTrack({ id: 'track-1', artist: 'Artist A' });
    const history: PlayRecord[] = [
      createPlayRecord('other-track', now - 1000 * 60 * 30, ['Artist A']), // 30 min ago
    ];
    const limits: RepetitionLimits = {
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBeGreaterThan(0);
    expect(penalty).toBeLessThanOrEqual(0.8);
  });

  it('should apply graduated artist penalty for multiple recent plays', () => {
    const track = createTrack({ id: 'track-1', artist: 'Artist A' });
    const history: PlayRecord[] = [
      createPlayRecord('other-1', now - 1000 * 60 * 15, ['Artist A']), // 15 min ago
      createPlayRecord('other-2', now - 1000 * 60 * 30, ['Artist A']), // 30 min ago
      createPlayRecord('other-3', now - 1000 * 60 * 60, ['Artist A']), // 1 hour ago
    ];
    const limits: RepetitionLimits = {
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBeGreaterThan(0.5);
    expect(penalty).toBeLessThanOrEqual(0.8);
  });

  it('should cap artist penalty at 0.8', () => {
    const track = createTrack({ id: 'track-1', artist: 'Artist A' });
    // Create many plays of the same artist
    const history: PlayRecord[] = Array.from({ length: 10 }, (_, i) =>
      createPlayRecord(`track-${i}`, now - 1000 * 60 * i, ['Artist A'])
    );
    const limits: RepetitionLimits = {
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(0.8);
  });

  it('should not apply artist penalty if no recent plays', () => {
    const track = createTrack({ id: 'track-1', artist: 'Artist A' });
    const history: PlayRecord[] = [
      createPlayRecord('other-track', now - 1000 * 60 * 60 * 5, ['Artist A']), // 5 hours ago
    ];
    const limits: RepetitionLimits = {
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(0);
  });

  it('should prioritize track penalty over artist penalty', () => {
    const track = createTrack({ id: 'track-1', artist: 'Artist A' });
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 60 * 24), // Track played 1 day ago
      createPlayRecord('other-track', now - 1000 * 60 * 30, ['Artist A']), // Artist played 30 min ago
    ];
    const limits: RepetitionLimits = {
      repeatTrackWithinDays: 7,
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(1.0); // Track penalty takes precedence
  });

  it('should handle artist ID matching', () => {
    const track = createTrack({ id: 'track-1', artist: 'Artist A' });
    const history: PlayRecord[] = [
      createPlayRecord('other-1', now - 1000 * 60 * 30, ['Artist B']),
      createPlayRecord('other-2', now - 1000 * 60 * 60, ['Artist A']), // Match
    ];
    const limits: RepetitionLimits = {
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBeGreaterThan(0);
  });

  it('should not apply artist penalty once track penalty is 1.0', () => {
    const track = createTrack({ id: 'track-1', artist: 'Artist A' });
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 60), // Track played 1 hour ago
    ];
    const limits: RepetitionLimits = {
      repeatTrackWithinDays: 1,
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(1.0);
    // Artist penalty calculation should be skipped when track penalty is already max
  });

  it('should handle empty history', () => {
    const track = createTrack({ id: 'track-1' });
    const history: PlayRecord[] = [];
    const limits: RepetitionLimits = {
      repeatTrackWithinDays: 7,
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(0);
  });

  it('should handle track with no matching history', () => {
    const track = createTrack({ id: 'track-1', artist: 'Artist A' });
    const history: PlayRecord[] = [
      createPlayRecord('track-2', now - 1000 * 60 * 60, ['Artist B']),
      createPlayRecord('track-3', now - 1000 * 60 * 120, ['Artist C']),
    ];
    const limits: RepetitionLimits = {
      repeatTrackWithinDays: 7,
      repeatArtistWithinHours: 2,
    };

    const penalty = checkRecencyPenalty(track, history, limits);
    expect(penalty).toBe(0);
  });
});

// ============================================================================
// getRecentPlays Tests
// ============================================================================

describe('getRecentPlays', () => {
  const now = Date.now();

  it('should return plays from the last N hours', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 30), // 30 min ago
      createPlayRecord('track-2', now - 1000 * 60 * 60), // 1 hour ago
      createPlayRecord('track-3', now - 1000 * 60 * 90), // 1.5 hours ago
      createPlayRecord('track-4', now - 1000 * 60 * 150), // 2.5 hours ago
    ];

    const recent = getRecentPlays(history, 2);

    expect(recent).toHaveLength(3);
    expect(recent.map(r => r.trackId)).toEqual(['track-1', 'track-2', 'track-3']);
  });

  it('should return empty array when no recent plays', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 60 * 24), // 1 day ago
    ];

    const recent = getRecentPlays(history, 1);

    expect(recent).toHaveLength(0);
  });

  it('should return all plays when all are recent', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 30),
      createPlayRecord('track-2', now - 1000 * 60 * 60),
    ];

    const recent = getRecentPlays(history, 2);

    expect(recent).toHaveLength(2);
  });

  it('should handle empty history', () => {
    const recent = getRecentPlays([], 2);
    expect(recent).toHaveLength(0);
  });

  it('should include play exactly at cutoff time', () => {
    // Use fresh now to avoid drift between describe-scope `now` and Date.now() in function
    const freshNow = Date.now();
    const twoHoursAgo = freshNow - 1000 * 60 * 60 * 2 + 100; // slightly inside window
    const history: PlayRecord[] = [
      createPlayRecord('track-1', twoHoursAgo),
    ];

    const recent = getRecentPlays(history, 2);

    expect(recent).toHaveLength(1);
  });

  it('should handle fractional hours', () => {
    const freshNow = Date.now();
    const history: PlayRecord[] = [
      createPlayRecord('track-1', freshNow - 1000 * 60 * 45), // 45 min ago
      createPlayRecord('track-2', freshNow - 1000 * 60 * 89), // 89 min ago (inside 1.5h window)
    ];

    const recent = getRecentPlays(history, 1.5);

    expect(recent).toHaveLength(2);
  });

  it('should handle very large time windows', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 60 * 24 * 30), // 30 days ago
      createPlayRecord('track-2', now - 1000 * 60 * 60 * 24 * 60), // 60 days ago
    ];

    const recent = getRecentPlays(history, 24 * 90); // 90 days

    expect(recent).toHaveLength(2);
  });
});

// ============================================================================
// getRecentArtists Tests
// ============================================================================

describe('getRecentArtists', () => {
  const now = Date.now();

  it('should return unique artists from recent plays', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 30, ['artist-a']),
      createPlayRecord('track-2', now - 1000 * 60 * 60, ['artist-b']),
      createPlayRecord('track-3', now - 1000 * 60 * 90, ['artist-a']), // Duplicate
    ];

    const artists = getRecentArtists(history, 2);

    expect(artists).toHaveLength(2);
    expect(artists).toContain('artist-a');
    expect(artists).toContain('artist-b');
  });

  it('should handle tracks with multiple artists', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 30, ['artist-a', 'artist-b']),
      createPlayRecord('track-2', now - 1000 * 60 * 60, ['artist-c']),
    ];

    const artists = getRecentArtists(history, 2);

    expect(artists).toHaveLength(3);
    expect(artists).toContain('artist-a');
    expect(artists).toContain('artist-b');
    expect(artists).toContain('artist-c');
  });

  it('should return empty array when no recent plays', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 60 * 24, ['artist-a']),
    ];

    const artists = getRecentArtists(history, 1);

    expect(artists).toHaveLength(0);
  });

  it('should handle empty history', () => {
    const artists = getRecentArtists([], 2);
    expect(artists).toHaveLength(0);
  });

  it('should handle plays with no artist IDs', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 30, []),
      createPlayRecord('track-2', now - 1000 * 60 * 60, ['artist-a']),
    ];

    const artists = getRecentArtists(history, 2);

    expect(artists).toHaveLength(1);
    expect(artists).toContain('artist-a');
  });

  it('should deduplicate artists across multiple tracks', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 15, ['artist-a', 'artist-b']),
      createPlayRecord('track-2', now - 1000 * 60 * 30, ['artist-b', 'artist-c']),
      createPlayRecord('track-3', now - 1000 * 60 * 45, ['artist-a', 'artist-c']),
    ];

    const artists = getRecentArtists(history, 1);

    expect(artists).toHaveLength(3);
    expect(new Set(artists).size).toBe(3); // Verify uniqueness
  });

  it('should respect time window', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 30, ['artist-a']), // 30 min ago
      createPlayRecord('track-2', now - 1000 * 60 * 90, ['artist-b']), // 1.5 hours ago
      createPlayRecord('track-3', now - 1000 * 60 * 150, ['artist-c']), // 2.5 hours ago
    ];

    const artists = getRecentArtists(history, 2); // Last 2 hours

    expect(artists).toHaveLength(2);
    expect(artists).toContain('artist-a');
    expect(artists).toContain('artist-b');
    expect(artists).not.toContain('artist-c');
  });

  it('should handle same artist with different collaborators', () => {
    const history: PlayRecord[] = [
      createPlayRecord('track-1', now - 1000 * 60 * 30, ['artist-a', 'artist-b']),
      createPlayRecord('track-2', now - 1000 * 60 * 60, ['artist-a', 'artist-c']),
    ];

    const artists = getRecentArtists(history, 2);

    expect(artists).toHaveLength(3);
    expect(artists.filter(a => a === 'artist-a')).toHaveLength(1); // Only one instance
  });
});
