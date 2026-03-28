import { describe, expect, it, vi } from 'vitest';
import type { MusicProvider, PlaybackController, SessionStore } from './types.js';
import { createEngine } from './engine.js';

describe('engine', () => {
  it('logs track.started events when playback is recorded', async () => {
    const queuedTrack = {
      id: 'track-1',
      name: 'Focus Loop',
      artist: 'Calm Artist',
      album: 'Focus Album',
      durationMs: 180000,
      provider: 'youtube' as const,
      uri: 'youtube:video:track-1',
    };
    const provider: MusicProvider = {
      name: 'youtube',
      isConnected: () => true,
      search: vi.fn().mockResolvedValue([queuedTrack]),
      getLibraryTracks: vi.fn().mockResolvedValue([]),
      getTopTracks: vi.fn().mockResolvedValue([]),
      getRecentlyPlayed: vi.fn().mockResolvedValue([]),
      getPlaylistTracks: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue([]),
      getTrackFeatures: vi.fn().mockResolvedValue([null]),
    };
    const playback: PlaybackController = {
      name: 'youtube',
      play: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      getNowPlaying: vi.fn().mockResolvedValue(null),
      addToQueue: vi.fn().mockResolvedValue(undefined),
    };
    const store: SessionStore = {
      createSession: vi.fn().mockResolvedValue('sess_test'),
      endSession: vi.fn().mockResolvedValue(undefined),
      logEvent: vi.fn().mockResolvedValue('event-1'),
    };

    const engine = createEngine({
      provider,
      playback,
      store,
    });

    await engine.start({
      version: 1,
      provider: 'youtube',
      sources: { searchQueries: ['focus'] },
    });
    await engine.recordPlay({
      ...queuedTrack,
      playbackTruth: 'daemon-managed',
    });

    expect(store.logEvent).toHaveBeenCalledWith(
      'track.started',
      expect.objectContaining({
        track: expect.objectContaining({
          id: 'track-1',
          playbackTruth: 'daemon-managed',
        }),
      }),
      'sess_test',
    );
    expect(engine.getState()?.currentTrack).toMatchObject({
      id: 'track-1',
      playbackTruth: 'daemon-managed',
    });
  });

  it('clears in-memory session state even when stop persistence fails', async () => {
    const queuedTrack = {
      id: 'track-1',
      name: 'Focus Loop',
      artist: 'Calm Artist',
      album: 'Focus Album',
      durationMs: 180000,
      provider: 'youtube' as const,
      uri: 'youtube:video:track-1',
    };
    const provider: MusicProvider = {
      name: 'youtube',
      isConnected: () => true,
      search: vi.fn().mockResolvedValue([queuedTrack]),
      getLibraryTracks: vi.fn().mockResolvedValue([]),
      getTopTracks: vi.fn().mockResolvedValue([]),
      getRecentlyPlayed: vi.fn().mockResolvedValue([]),
      getPlaylistTracks: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue([]),
      getTrackFeatures: vi.fn().mockResolvedValue([null]),
    };
    const playback: PlaybackController = {
      name: 'youtube',
      play: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      getNowPlaying: vi.fn().mockResolvedValue(null),
      addToQueue: vi.fn().mockResolvedValue(undefined),
    };
    const store: SessionStore = {
      createSession: vi.fn().mockResolvedValue('sess_test'),
      endSession: vi.fn().mockRejectedValue(new Error('session persistence failed')),
      logEvent: vi.fn().mockResolvedValue('event-1'),
    };

    const engine = createEngine({
      provider,
      playback,
      store,
    });

    await engine.start({
      version: 1,
      provider: 'youtube',
      sources: { searchQueries: ['focus'] },
    });

    await expect(engine.stop()).rejects.toThrow('session persistence failed');
    expect(engine.getState()).toBeNull();
  });
});
