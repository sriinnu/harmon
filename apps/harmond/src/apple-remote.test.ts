import { describe, expect, it, vi } from 'vitest';
import type { RuntimePlaybackController } from './provider-runtime.js';
import {
  createAppleRemoteBridge,
  createAppleRemotePlaybackController,
  createAppleUnifiedPlaybackController,
} from './apple-remote.js';

describe('apple-remote', () => {
  it('prefers local Apple playback when no remote companion is connected', async () => {
    const localCalls: string[] = [];
    const remoteCalls: string[] = [];
    const bridge = createAppleRemoteBridge();
    const playback = createAppleUnifiedPlaybackController({
      bridge,
      local: createStubPlaybackController(localCalls),
      remote: createStubPlaybackController(remoteCalls),
    });

    await playback.addToQueue('apple:song:local-first');
    await playback.play();

    expect(localCalls).toEqual(['queue:apple:song:local-first', 'play']);
    expect(remoteCalls).toEqual(['queue:apple:song:local-first']);
  });

  it('returns daemon-managed state until the iOS companion reports verified playback', async () => {
    const bridge = createAppleRemoteBridge();
    const playback = createAppleRemotePlaybackController({
      bridge,
      client: {
        getSong: async () => ({ url: 'https://music.apple.com/us/song/apple-track-1' }),
        search: async () => ({ albums: [], artists: [], playlists: [], songs: [] }),
      } as any,
    });

    bridge.registerCompanion({ deviceId: 'iphone-1', name: 'My iPhone', platform: 'ios' });
    await playback.addToQueue('apple:song:apple-track-1', {
      album: 'Focus Album',
      artist: 'Focus Artist',
      durationMs: 180000,
      id: 'apple-track-1',
      name: 'Focus Track',
      provider: 'apple',
    });
    await playback.play();

    expect(await playback.getNowPlaying()).toEqual(
      expect.objectContaining({
        id: 'apple-track-1',
        playbackTruth: 'daemon-managed',
      }),
    );

    const [command] = bridge.listCommands('iphone-1');
    bridge.updateState({
      ackCommandId: command.id,
      currentTrack: {
        album: 'Focus Album',
        artist: 'Focus Artist',
        durationMs: 180000,
        id: 'apple-track-1',
        name: 'Focus Track',
        provider: 'apple',
        uri: 'https://music.apple.com/us/song/apple-track-1',
      },
      deviceId: 'iphone-1',
      playbackState: 'playing',
    });

    expect(await playback.getNowPlaying()).toEqual(
      expect.objectContaining({
        id: 'apple-track-1',
        playbackTruth: 'verified',
      }),
    );
  });

  it('clears stale bridge state when a different companion replaces the active device', () => {
    const bridge = createAppleRemoteBridge();

    bridge.registerCompanion({ deviceId: 'iphone-1', name: 'Phone 1', platform: 'ios' });
    bridge.queueCommand({ type: 'pause' });
    bridge.updateState({
      currentTrack: {
        album: 'Focus Album',
        artist: 'Focus Artist',
        durationMs: 180000,
        id: 'apple-track-1',
        name: 'Focus Track',
        provider: 'apple',
      },
      deviceId: 'iphone-1',
      playbackState: 'playing',
    });

    const nextStatus = bridge.registerCompanion({ deviceId: 'iphone-2', name: 'Phone 2', platform: 'ios' });

    expect(nextStatus.pendingCommands).toBe(0);
    expect(nextStatus.currentTrack).toBeNull();
    expect(nextStatus.playbackState).toBe('stopped');
  });

  it('drops Apple remote now-playing truth after the companion times out', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'));
      const bridge = createAppleRemoteBridge({ companionTimeoutMs: 1000 });
      const playback = createAppleRemotePlaybackController({ bridge });

      bridge.registerCompanion({ deviceId: 'iphone-1', name: 'My iPhone', platform: 'ios' });
      bridge.updateState({
        currentTrack: {
          album: 'Focus Album',
          artist: 'Focus Artist',
          durationMs: 180000,
          id: 'apple-track-1',
          name: 'Focus Track',
          provider: 'apple',
          uri: 'https://music.apple.com/us/song/apple-track-1',
        },
        deviceId: 'iphone-1',
        playbackState: 'playing',
      });

      vi.advanceTimersByTime(1500);

      expect(await playback.getNowPlaying()).toBeNull();
      expect(bridge.getStatus()).toMatchObject({
        connected: false,
        currentTrack: null,
        playbackState: 'stopped',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not keep phantom now-playing state when queueing to the companion fails', async () => {
    const playback = createAppleRemotePlaybackController({
      bridge: {
        acknowledgeCommand() {},
        getStatus: () => ({
          companion: null,
          connected: false,
          currentTrack: null,
          pendingCommands: 0,
          playbackState: 'stopped' as const,
        }),
        isConnected: () => true,
        listCommands: () => [],
        queueCommand: () => {
          throw new Error('Apple Music remote companion is not connected.');
        },
        registerCompanion: () => ({
          companion: null,
          connected: false,
          currentTrack: null,
          pendingCommands: 0,
          playbackState: 'stopped' as const,
        }),
        resetPlaybackState() {},
        updateState: () => ({
          companion: null,
          connected: false,
          currentTrack: null,
          pendingCommands: 0,
          playbackState: 'stopped' as const,
        }),
      },
    });

    await expect(playback.play({ uri: 'https://music.apple.com/us/song/apple-track-2' })).rejects.toThrow(
      'Apple Music remote companion is not connected.',
    );
    expect(await playback.getNowPlaying()).toBeNull();
  });

  it('rejects Apple remote playback when no companion is connected', async () => {
    const bridge = createAppleRemoteBridge();
    const playback = createAppleRemotePlaybackController({ bridge });

    await expect(playback.play({ uri: 'https://music.apple.com/us/song/apple-track-2' })).rejects.toThrow(
      'Apple Music remote companion is not connected.',
    );
  });
});

function createStubPlaybackController(log: string[]): RuntimePlaybackController {
  return {
    name: 'apple',
    supportsPause: true,
    async addToQueue(trackUri: string) {
      log.push(`queue:${trackUri}`);
    },
    async getNowPlaying() {
      return null;
    },
    async next() {
      log.push('next');
    },
    async pause() {
      log.push('pause');
    },
    async play() {
      log.push('play');
    },
    async previous() {
      log.push('previous');
    },
    async resetSessionState() {
      log.push('reset');
    },
  };
}
