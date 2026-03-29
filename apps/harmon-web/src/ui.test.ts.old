import { describe, expect, it } from 'vitest';

import { getDaemonControlAvailability, getDaemonPlayAvailability, getNowPlayingMessage } from './ui.js';

describe('web ui helpers', () => {
  it('rejects Apple playlist daemon play', () => {
    expect(
      getDaemonPlayAvailability(
        {
          id: 'playlist-1',
          kind: 'playlist',
          provider: 'apple',
          title: 'Focus Set',
        },
        { connected: true, capabilities: { playback: true, sessionControl: true } },
      ),
    ).toEqual({
      enabled: false,
      reason: 'Apple daemon playback only supports song items in this build.',
    });
  });

  it('allows Apple song daemon play when playback is available', () => {
    expect(
      getDaemonPlayAvailability(
        {
          id: 'song-1',
          kind: 'song',
          provider: 'apple',
          title: 'Focus Song',
        },
        { connected: true, capabilities: { playback: true } },
      ),
    ).toEqual({ enabled: true });
  });

  it('rejects YouTube pause when the daemon marks it unsupported', () => {
    expect(
      getDaemonControlAvailability(
        { connected: true, capabilities: { playback: true, pause: false } },
        'pause',
      ),
    ).toEqual({
      enabled: false,
      reason: 'I cannot pause this provider from the daemon runtime on this host.',
    });
  });

  it('reports browse-only provider status honestly in now-playing', () => {
    expect(
      getNowPlayingMessage(
        { connected: true, capabilities: { playback: false } },
        'youtube',
        null,
      ),
    ).toBe('I can browse this provider here, but playback is not available on this host.');
  });
});
