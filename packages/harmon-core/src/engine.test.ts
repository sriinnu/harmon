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

  it('emits session.nudged event on nudge', async () => {
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
    const onEvent = vi.fn();

    const engine = createEngine({
      provider,
      playback,
      store,
      onEvent,
    });

    await engine.start({
      version: 1,
      provider: 'youtube',
      sources: { searchQueries: ['focus'] },
    });

    // Reset onEvent mock to ignore startup events
    onEvent.mockClear();

    await engine.nudge('calmer', 0.5);

    const nudgeEvent = onEvent.mock.calls.find(
      ([event]: [{ type: string }]) => event.type === 'session.nudged',
    );
    expect(nudgeEvent).toBeDefined();
    expect(nudgeEvent![0]).toMatchObject({
      type: 'session.nudged',
      payload: expect.objectContaining({
        direction: 'calmer',
        amount: 0.5,
      }),
    });
  });

  it('uses injected logger instead of console', async () => {
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
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Make the event callback throw so the engine's emit() catches the error
    // and calls logger.error
    const onEvent = vi.fn().mockImplementation(() => {
      throw new Error('callback boom');
    });

    const engine = createEngine({
      provider,
      playback,
      store,
      onEvent,
      logger,
    });

    await engine.start({
      version: 1,
      provider: 'youtube',
      sources: { searchQueries: ['focus'] },
    });

    // The onEvent callback throws, which should trigger logger.error
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'callback boom' }),
      'Event callback error',
    );
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

  it('does not feed the playback queue when the session stops mid-refill', async () => {
    const track = (id: string) => ({
      id,
      name: `Track ${id}`,
      artist: 'Calm Artist',
      album: 'Focus Album',
      durationMs: 180000,
      provider: 'youtube' as const,
      uri: `youtube:video:${id}`,
    });
    let resolveSlowSearch: (value: ReturnType<typeof track>[]) => void = () => {};
    const search = vi.fn()
      .mockResolvedValueOnce([track('t1')])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSlowSearch = resolve; }));
    const provider: MusicProvider = {
      name: 'youtube',
      isConnected: () => true,
      search,
      getLibraryTracks: vi.fn().mockResolvedValue([]),
      getTopTracks: vi.fn().mockResolvedValue([]),
      getRecentlyPlayed: vi.fn().mockResolvedValue([]),
      getPlaylistTracks: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue([]),
      getTrackFeatures: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids.map(() => null))),
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

    const engine = createEngine({ provider, playback, store });
    await engine.start({
      version: 1,
      provider: 'youtube',
      sources: { searchQueries: ['focus'] },
    });

    const callsAfterStart = (playback.addToQueue as ReturnType<typeof vi.fn>).mock.calls.length;

    // Second refill hangs on the provider; stop the session mid-flight.
    const refillPromise = engine.refillQueue();
    await engine.stop();
    resolveSlowSearch([track('t2'), track('t3')]);
    await refillPromise;

    expect((playback.addToQueue as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterStart);
    expect(engine.getState()).toBeNull();
  });

  it('nudge shifts targetEnergy instead of corrupting the energy weight', async () => {
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

    const engine = createEngine({ provider, playback, store });
    await engine.start({
      version: 1,
      provider: 'youtube',
      sources: { searchQueries: ['focus'] },
    });

    await engine.nudge('calmer', 0.2);
    let soft = engine.getState()?.policy.soft;
    expect(soft?.targetEnergy).toBeCloseTo(0.3);
    expect(soft?.weights?.energy).toBeGreaterThan(0);

    await engine.nudge('calmer', 0.2);
    soft = engine.getState()?.policy.soft;
    expect(soft?.targetEnergy).toBeCloseTo(0.1);
    // Repeated calming must never flip the weight negative (which would
    // reward maximum-energy tracks under proximity scoring).
    expect(soft?.weights?.energy).toBeGreaterThan(0);
  });
});
