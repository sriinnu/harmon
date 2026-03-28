import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDaemonAppClient } from './daemon-client.js';

/**
 * I keep direct MCP daemon-client coverage on real daemon payload shapes so
 * wrapper regressions do not slip past the fake-client app-server tests.
 */
describe('createDaemonAppClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps spotify wrapped track items for saved tracks and playlist tracks', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.includes('/v1/spotify/library/tracks')) {
        return Response.json({
          items: [{
            addedAt: '2026-03-27T00:00:00.000Z',
            track: {
              artist: 'Artist One',
              durationMs: 180000,
              id: 'track-1',
              name: 'Track One',
              uri: 'spotify:track:track-1',
            },
          }],
        });
      }

      if (url.includes('/v1/spotify/playlists/playlist-1/tracks')) {
        return Response.json({
          items: [{
            addedAt: '2026-03-27T00:00:00.000Z',
            track: {
              artist: 'Artist Two',
              durationMs: 200000,
              id: 'track-2',
              name: 'Track Two',
              uri: 'spotify:track:track-2',
            },
          }],
        });
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch);

    const client = createDaemonAppClient({
      endpoint: 'http://127.0.0.1:17373',
      token: 'demo-token',
    });

    await expect(client.getLibraryTracks('spotify')).resolves.toEqual([{
      durationMs: 180000,
      id: 'track-1',
      kind: 'track',
      provider: 'spotify',
      subtitle: 'Artist One',
      title: 'Track One',
      uri: 'spotify:track:track-1',
    }]);

    await expect(client.getPlaylistTracks('spotify', 'playlist-1')).resolves.toEqual([{
      durationMs: 200000,
      id: 'track-2',
      kind: 'track',
      provider: 'spotify',
      subtitle: 'Artist Two',
      title: 'Track Two',
      uri: 'spotify:track:track-2',
    }]);
  });

  it('preserves daemon base-path prefixes', async () => {
    let requestedUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      requestedUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      return Response.json({ isRunning: true, spotifyConnected: false, version: '0.1.0' });
    }) as typeof fetch);

    const client = createDaemonAppClient({
      endpoint: 'https://example.com/harmon',
    });

    await client.getStatus();
    expect(requestedUrl).toBe('https://example.com/harmon/v1/status');
  });
});
