import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

import { createYouTubeMusicPlaybackController, getBrowserLaunchSupport } from './provider-runtime.js';

describe('provider-runtime', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('returns daemon-managed YouTube now-playing state without claiming verification', async () => {
    const playback = createYouTubeMusicPlaybackController();
    (playback as any).currentTrack = {
      id: 'yt-track-1',
      name: 'Focus Stream',
      artist: 'Channel',
      album: '',
      durationMs: 0,
      uri: 'https://music.youtube.com/watch?v=yt-track-1',
      provider: 'youtube',
    };

    await expect(playback.getNowPlaying()).resolves.toEqual(
      expect.objectContaining({
        id: 'yt-track-1',
        playbackTruth: 'daemon-managed',
      }),
    );
  });

  it('keeps YouTube runtime state unchanged when browser handoff launch fails', async () => {
    const playback = createYouTubeMusicPlaybackController();
    execFileMock.mockImplementation((_file: string, _args: string[], callback: (error: Error) => void) => {
      callback(new Error('launcher failed'));
    });

    await playback.addToQueue('youtube:video:yt-track-2', {
      id: 'yt-track-2',
      name: 'Queued Stream',
      artist: 'Queue Channel',
      album: '',
      durationMs: 0,
      uri: 'youtube:video:yt-track-2',
      provider: 'youtube',
    });

    await expect(playback.play()).rejects.toThrow('launcher failed');
    expect((playback as any).currentTrack).toBeNull();
    expect((playback as any).history).toEqual([]);
  });

  it('reports browser handoff as unavailable when xdg-open is missing on Linux', () => {
    expect(getBrowserLaunchSupport('linux', '')).toEqual({
      available: false,
      reason: 'Browser handoff requires xdg-open on PATH.',
    });
  });
});
