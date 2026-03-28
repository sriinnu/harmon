import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCLI } from './index.js';

/**
 * I keep the thin CLI client honest about the daemon response shapes it
 * normalizes for higher-level commands.
 */
describe('harmon CLI client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('unwraps Spotify paged library and playlist responses into item arrays', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson({
        items: [{ track: { id: 'saved-track-1', name: 'Saved Track' } }],
      }))
      .mockResolvedValueOnce(okJson({
        items: [{ id: 'playlist-1', name: 'Saved Playlist' }],
      }))
      .mockResolvedValueOnce(okJson({
        items: [{ track: { id: 'playlist-track-1', name: 'Playlist Track' } }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const cli = createCLI({ endpoint: 'http://127.0.0.1:17373' });

    await expect(cli.spotifyLibraryTracks({ limit: 1 })).resolves.toEqual([
      { track: { id: 'saved-track-1', name: 'Saved Track' } },
    ]);
    await expect(cli.spotifyPlaylists({ limit: 1 })).resolves.toEqual([
      { id: 'playlist-1', name: 'Saved Playlist' },
    ]);
    await expect(cli.spotifyPlaylistTracks('playlist-1', { limit: 1 })).resolves.toEqual([
      { track: { id: 'playlist-track-1', name: 'Playlist Track' } },
    ]);
  });

  it('calls the dedicated Spotify recommendations endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([
      { id: 'recommended-track-1', name: 'Recommended Track' },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const cli = createCLI({ endpoint: 'http://127.0.0.1:17373' });
    const result = await cli.spotifyRecommendations({ limit: 2, seed: 'spotify:track:abc123' });

    expect(result).toEqual([
      { id: 'recommended-track-1', name: 'Recommended Track' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/v1/spotify/recommendations?limit=2&seed=spotify%3Atrack%3Aabc123'),
      }),
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });
});

function okJson(payload: unknown): Response {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  } as Response;
}
