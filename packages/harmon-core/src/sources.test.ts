import { describe, expect, it, vi } from 'vitest';
import { fetchCandidates } from './sources.js';
import type { MusicProvider } from './types.js';

function createProvider(overrides = {}) {
  return {
    name: 'spotify',
    isConnected: () => true,
    search: vi.fn(),
    getLibraryTracks: vi.fn().mockResolvedValue([
      { id: 't1', name: 'Track 1', artist: 'Artist 1', album: 'Album 1', durationMs: 1000, uri: 'spotify:track:t1', provider: 'spotify' },
      { id: 't2', name: 'Track 2', artist: 'Artist 2', album: 'Album 2', durationMs: 1000, uri: 'spotify:track:t2', provider: 'spotify' },
      { id: 't3', name: 'Track 3', artist: 'Artist 3', album: 'Album 3', durationMs: 1000, uri: 'spotify:track:t3', provider: 'spotify' },
    ]),
    getTopTracks: vi.fn().mockResolvedValue([]),
    getRecentlyPlayed: vi.fn().mockResolvedValue([]),
    getPlaylistTracks: vi.fn().mockResolvedValue([]),
    getRecommendations: vi.fn().mockResolvedValue([]),
    getTrackFeatures: vi.fn().mockResolvedValue([]),
    ...overrides,
  } satisfies MusicProvider;
}

describe('fetchCandidates', () => {
  it('falls back to default features when the provider breaks positional correspondence', async () => {
    const provider = createProvider({
      getTrackFeatures: vi.fn().mockResolvedValue([
        {
          energy: 0.9,
          instrumentalness: 0.8,
          speechiness: 0.1,
          valence: 0.5,
          acousticness: 0.2,
          tempo: 123,
          danceability: 0.7,
          liveness: 0.1,
          loudness: -7,
          key: 1,
          mode: 1,
          timeSignature: 4,
        },
        null,
      ]),
    });

    const candidates = await fetchCandidates(provider, { likedTracks: true }, 3);

    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.features.energy === 0.5)).toBe(true);
    expect(candidates.map((candidate) => candidate.id)).toEqual(['t1', 't2', 't3']);
  });

  it('keeps supported sources when one provider surface is explicitly unsupported', async () => {
    const provider = createProvider({
      getTopTracks: vi.fn().mockRejectedValue(new Error('top tracks are not implemented in this build')),
      getTrackFeatures: vi.fn().mockResolvedValue([null, null, null]),
    });

    const candidates = await fetchCandidates(
      provider,
      { likedTracks: true, topTracks: true },
      3,
    );

    expect(candidates).toHaveLength(3);
    expect(provider.getLibraryTracks).toHaveBeenCalledTimes(1);
    expect(provider.getTopTracks).toHaveBeenCalledTimes(1);
  });

  it('bubbles upstream provider failures instead of masking them as empty sources', async () => {
    const provider = createProvider({
      getLibraryTracks: vi.fn().mockRejectedValue(new Error('Apple Music API error: 401 invalid token')),
    });

    await expect(fetchCandidates(provider, { likedTracks: true }, 3)).rejects.toThrow(
      'Apple Music API error: 401 invalid token',
    );
  });
});
