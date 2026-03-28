import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MusicProvider } from '@sriinnu/harmon-core';
import { HarmonStore } from '@sriinnu/harmon-store';
import { createHistoryBackedProvider } from './history-provider.js';

function createBaseProvider(name: 'apple' | 'youtube'): MusicProvider {
  return {
    name,
    isConnected: () => true,
    search: vi.fn().mockResolvedValue([]),
    getLibraryTracks: vi.fn().mockResolvedValue([]),
    getTopTracks: vi.fn().mockRejectedValue(new Error('top tracks unavailable')),
    getRecentlyPlayed: vi.fn().mockRejectedValue(new Error('recent plays unavailable')),
    getPlaylistTracks: vi.fn().mockResolvedValue([]),
    getRecommendations: vi.fn().mockResolvedValue([]),
    getTrackFeatures: vi.fn().mockResolvedValue([]),
  };
}

function createTrack(provider: 'apple' | 'youtube', id: string, name: string) {
  return {
    id,
    name,
    artist: `${name} Artist`,
    album: `${name} Album`,
    durationMs: 180000,
    provider,
    uri: `${provider}:track:${id}`,
  };
}

describe('history-provider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives top tracks from daemon-observed playback history', async () => {
    vi.useFakeTimers();
    const store = new HarmonStore({ memory: true });
    await store.migrate();
    vi.setSystemTime(new Date('2026-03-27T10:00:00.000Z'));
    await store.logEvent('track.started', { track: createTrack('apple', 'track-1', 'Alpha') });
    vi.setSystemTime(new Date('2026-03-27T10:00:01.000Z'));
    await store.logEvent('track.started', { track: createTrack('apple', 'track-2', 'Beta') });
    vi.setSystemTime(new Date('2026-03-27T10:00:02.000Z'));
    await store.logEvent('track.started', { track: createTrack('apple', 'track-1', 'Alpha') });
    vi.setSystemTime(new Date('2026-03-27T10:00:03.000Z'));
    await store.logEvent('track.started', { track: createTrack('youtube', 'track-3', 'Gamma') });

    const provider = createHistoryBackedProvider({
      baseProvider: createBaseProvider('apple'),
      provider: 'apple',
      recentPlaysMode: 'delegate-or-local',
      store,
    });

    await expect(provider.getTopTracks({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ id: 'track-1', provider: 'apple' }),
      expect.objectContaining({ id: 'track-2', provider: 'apple' }),
    ]);
  });

  it('falls back to local recent plays when the upstream surface is unavailable', async () => {
    vi.useFakeTimers();
    const store = new HarmonStore({ memory: true });
    await store.migrate();
    vi.setSystemTime(new Date('2026-03-27T11:00:00.000Z'));
    await store.logEvent('track.started', { track: createTrack('apple', 'track-1', 'Alpha') });
    vi.setSystemTime(new Date('2026-03-27T11:00:01.000Z'));
    await store.logEvent('track.started', { track: createTrack('apple', 'track-2', 'Beta') });
    vi.setSystemTime(new Date('2026-03-27T11:00:02.000Z'));
    await store.logEvent('track.started', { track: createTrack('apple', 'track-1', 'Alpha') });

    const provider = createHistoryBackedProvider({
      baseProvider: createBaseProvider('apple'),
      provider: 'apple',
      recentPlaysMode: 'delegate-or-local',
      store,
    });

    await expect(provider.getRecentlyPlayed({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ id: 'track-1', provider: 'apple' }),
      expect.objectContaining({ id: 'track-2', provider: 'apple' }),
    ]);
  });

  it('falls back to local recent plays when Apple recent history requires user auth', async () => {
    vi.useFakeTimers();
    const store = new HarmonStore({ memory: true });
    await store.migrate();
    vi.setSystemTime(new Date('2026-03-27T11:30:00.000Z'));
    await store.logEvent('track.started', { track: createTrack('apple', 'track-1', 'Alpha') });
    vi.setSystemTime(new Date('2026-03-27T11:30:01.000Z'));
    await store.logEvent('track.started', { track: createTrack('apple', 'track-2', 'Beta') });

    const baseProvider = createBaseProvider('apple');
    baseProvider.getRecentlyPlayed = vi.fn().mockRejectedValue(
      new Error('Apple Music user token required for library endpoints'),
    );

    const provider = createHistoryBackedProvider({
      baseProvider,
      provider: 'apple',
      recentPlaysMode: 'delegate-or-local',
      store,
    });

    await expect(provider.getRecentlyPlayed({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ id: 'track-2', provider: 'apple' }),
      expect.objectContaining({ id: 'track-1', provider: 'apple' }),
    ]);
  });

  it('keeps YouTube recent plays local instead of collapsing back to library tracks', async () => {
    vi.useFakeTimers();
    const store = new HarmonStore({ memory: true });
    await store.migrate();
    vi.setSystemTime(new Date('2026-03-27T12:00:00.000Z'));
    await store.logEvent('track.started', { track: createTrack('youtube', 'track-2', 'Beta') });
    vi.setSystemTime(new Date('2026-03-27T12:00:01.000Z'));
    await store.logEvent('track.started', { track: createTrack('youtube', 'track-1', 'Alpha') });

    const baseProvider = createBaseProvider('youtube');
    baseProvider.getLibraryTracks = vi.fn().mockResolvedValue([createTrack('youtube', 'library-track', 'Library')]);

    const provider = createHistoryBackedProvider({
      baseProvider,
      provider: 'youtube',
      recentPlaysMode: 'local',
      store,
    });

    await expect(provider.getRecentlyPlayed({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ id: 'track-1', provider: 'youtube' }),
      expect.objectContaining({ id: 'track-2', provider: 'youtube' }),
    ]);
    expect(baseProvider.getLibraryTracks).not.toHaveBeenCalled();
  });
});
