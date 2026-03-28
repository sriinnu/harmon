import { describe, expect, it } from 'vitest';
import { HarmonWebClient } from './api.js';
import { getDaemonPlaybackTarget, getLocalPlaybackUrl } from './types.js';

describe('HarmonWebClient', () => {
  it('normalizes spotify search results', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          tracks: {
            items: [
              { id: 'track-1', name: 'Focus', artist: 'Alpha', uri: 'spotify:track:track-1' },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const client = new HarmonWebClient({ baseUrl: 'http://127.0.0.1:17373' });
    const items = await client.search('spotify', 'focus', 'song', 5);

    expect(items).toHaveLength(1);
    expect(items[0]?.uri).toBe('spotify:track:track-1');
    globalThis.fetch = originalFetch;
  });

  it('builds a local youtube playback url', () => {
    expect(
      getLocalPlaybackUrl({
        id: 'yt-1',
        kind: 'song',
        provider: 'youtube',
        title: 'Mix',
        uri: 'youtube:video:yt-1',
      })
    ).toBe('https://music.youtube.com/watch?v=yt-1');
  });

  it('does not fabricate YouTube artist or album playback targets', () => {
    expect(
      getDaemonPlaybackTarget({
        id: 'artist-1',
        kind: 'artist',
        provider: 'youtube',
        title: 'Artist',
      })
    ).toBeUndefined();

    expect(
      getLocalPlaybackUrl({
        id: 'album-1',
        kind: 'album',
        provider: 'youtube',
        title: 'Album',
      })
    ).toBeUndefined();
  });

  it('preserves daemon base-path prefixes', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = async (input) => {
      requestedUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      return new Response(JSON.stringify({ isRunning: true, version: '0.1.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new HarmonWebClient({ baseUrl: 'https://example.com/harmon' });
    await client.fetchStatus();

    expect(requestedUrl).toBe('https://example.com/harmon/v1/status');
    globalThis.fetch = originalFetch;
  });

  it('rejects bearer-token requests to insecure remote daemon URLs', async () => {
    const client = new HarmonWebClient({
      baseUrl: 'http://10.0.0.8:17373',
      token: 'demo-token',
    });

    await expect(client.fetchStatus()).rejects.toThrow(
      'Bearer tokens are only sent to HTTPS or loopback daemon URLs.',
    );
  });

  it('rejects arbitrary remote playback URLs from upstream payloads', () => {
    expect(
      getLocalPlaybackUrl({
        id: 'track-1',
        kind: 'song',
        provider: 'apple',
        title: 'Unsafe Song',
        url: 'https://evil.example.com/track',
      }),
    ).toBeUndefined();
  });
});
