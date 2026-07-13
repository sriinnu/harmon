import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createYouTubeMusicClient,
  createYouTubeMusicProvider,
} from './index.js';

describe('harmon-youtube', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requires a supported credential source', () => {
    expect(() => createYouTubeMusicClient({ cookies: 'SID=abc' })).toThrow(
      'Cookies-only mode is not implemented in this build',
    );
  });

  it('reports connected when Data API access is configured', () => {
    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    expect(client.isConnected()).toBe(true);
  });

  it('maps song search results from the Data API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: { videoId: 'video-1' },
            snippet: {
              title: 'Song One',
              channelTitle: 'Artist One - Topic',
              thumbnails: { medium: { url: 'https://img.test/song-1.jpg' } },
            },
          },
        ],
      }),
    }));

    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    const result = await client.search('focus', ['songs'], { limit: 1 });

    expect(result.songs).toEqual([
      expect.objectContaining({
        id: 'video-1',
        name: 'Song One',
        artistName: 'Artist One',
      }),
    ]);
  });

  it('maps playlist and artist search results from the Data API', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { channelId: 'channel-1' },
              snippet: {
                title: 'Artist Channel',
                channelTitle: 'Artist Channel',
                thumbnails: { medium: { url: 'https://img.test/artist.jpg' } },
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { playlistId: 'playlist-1' },
              snippet: {
                title: 'Focus Playlist',
                channelTitle: 'Playlist Owner',
                thumbnails: { medium: { url: 'https://img.test/playlist.jpg' } },
              },
            },
          ],
        }),
      }));

    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    const result = await client.search('focus', ['artists', 'playlists'], { limit: 1 });

    expect(result.artists).toEqual([
      expect.objectContaining({
        id: 'channel-1',
        name: 'Artist Channel',
      }),
    ]);
    expect(result.playlists).toEqual([
      expect.objectContaining({
        id: 'playlist-1',
        name: 'Focus Playlist',
      }),
    ]);
  });

  it('maps single-song lookups from the Data API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'video-1',
            snippet: {
              title: 'Song One',
              channelTitle: 'Artist One - Topic',
              thumbnails: { medium: { url: 'https://img.test/song-1.jpg' } },
            },
            contentDetails: { duration: 'PT3M10S' },
          },
        ],
      }),
    }));

    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    const song = await client.getSong('video-1');

    expect(song).toEqual(
      expect.objectContaining({
        id: 'video-1',
        name: 'Song One',
        artistName: 'Artist One',
        durationMs: 190000,
      }),
    );
  });

  it('requires OAuth for user-library surfaces', async () => {
    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });

    await expect(client.getLibrarySongs()).rejects.toThrow('requires YOUTUBE_MUSIC_ACCESS_TOKEN');
    await expect(client.getPlaylists()).rejects.toThrow('requires YOUTUBE_MUSIC_ACCESS_TOKEN');
  });

  it('maps playlist tracks from the Data API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            snippet: {
              title: 'Playlist Song',
              channelTitle: 'Playlist Artist - Topic',
              resourceId: { videoId: 'playlist-video-1' },
              thumbnails: { medium: { url: 'https://img.test/playlist-song.jpg' } },
            },
            contentDetails: { videoId: 'playlist-video-1' },
          },
        ],
      }),
    }));

    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    const songs = await client.getPlaylistTracks('PL123');

    expect(songs).toEqual([
      expect.objectContaining({
        id: 'playlist-video-1',
        name: 'Playlist Song',
        artistName: 'Playlist Artist',
      }),
    ]);
  });

  it('maps liked-library tracks and owned playlists with an access token', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              contentDetails: {
                relatedPlaylists: {
                  likes: 'LL123',
                },
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              snippet: {
                title: 'Liked Song',
                channelTitle: 'Liked Artist - Topic',
                resourceId: { videoId: 'liked-video-1' },
              },
              contentDetails: { videoId: 'liked-video-1' },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'playlist-1',
              snippet: {
                title: 'Owned Playlist',
                channelTitle: 'Owner',
              },
              contentDetails: { itemCount: 12 },
            },
          ],
        }),
      }));

    const client = createYouTubeMusicClient({ accessToken: 'yt-token' });
    const songs = await client.getLibrarySongs({ limit: 1 });
    const playlists = await client.getPlaylists({ limit: 1 });

    expect(songs).toEqual([
      expect.objectContaining({
        id: 'liked-video-1',
        name: 'Liked Song',
      }),
    ]);
    expect(playlists).toEqual([
      expect.objectContaining({
        id: 'playlist-1',
        name: 'Owned Playlist',
        trackCount: 12,
      }),
    ]);
  });

  it('builds heuristic recommendations from the seed video artist, excluding the seed', async () => {
    const fetchMock = vi.fn()
      // Seed video metadata lookup (videos endpoint)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'video-1',
              snippet: {
                title: 'Seed Song',
                channelTitle: 'Seed Artist - Topic',
              },
              contentDetails: { duration: 'PT3M' },
            },
          ],
        }),
      })
      // Artist-name song search
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: 'video-1' },
              snippet: { title: 'Seed Song', channelTitle: 'Seed Artist - Topic' },
            },
            {
              id: { videoId: 'video-2' },
              snippet: { title: 'Related Song', channelTitle: 'Seed Artist - Topic' },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createYouTubeMusicProvider(createYouTubeMusicClient({ apiKey: 'yt-key' }));
    const recommendations = await provider.getRecommendations({ seedTrackIds: ['video-1'], limit: 1 });

    expect(recommendations).toEqual([
      expect.objectContaining({
        id: 'video-2',
        provider: 'youtube',
      }),
    ]);

    const videosUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(videosUrl.pathname).toContain('/videos');
    const searchUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(searchUrl.pathname).toContain('/search');
    expect(searchUrl.searchParams.get('q')).toBe('Seed Artist');
    expect(searchUrl.searchParams.has('relatedToVideoId')).toBe(false);
  });

  it('clamps search maxResults to the Data API limit of 50', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    await client.search('focus', ['songs'], { limit: 200 });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('maxResults')).toBe('50');
  });

  it('fails fast when rate limited longer than the wait cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '60' : null) },
      text: async () => 'rate limited',
    }));

    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    await expect(client.search('focus')).rejects.toThrow('YouTube API rate limited; retry after 60s');
  });

  it('maps quota-exhausted 403 responses to a clear error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }),
    }));

    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    await expect(client.search('focus')).rejects.toThrow('YouTube API daily quota exceeded');
  });

  it('re-fetches the token and retries once on 401 when using a token callback', async () => {
    const getAccessToken = vi.fn()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: async () => 'unauthorized',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createYouTubeMusicClient({ getAccessToken });
    const result = await client.search('focus', ['songs']);

    expect(result.songs).toEqual([]);
    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer stale-token' },
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: { Authorization: 'Bearer fresh-token' },
    });
  });

  it('caches the callback token across requests until a 401', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('cached-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createYouTubeMusicClient({ getAccessToken });
    await client.search('one', ['songs']);
    await client.search('two', ['songs']);

    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported personal-history surfaces consistently', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = createYouTubeMusicProvider(createYouTubeMusicClient({ accessToken: 'yt-token' }));

    await expect(provider.getTopTracks({ limit: 1 })).rejects.toThrow(
      'YouTube Music top tracks are not available from the official provider contract.',
    );
    await expect(provider.getRecentlyPlayed({ limit: 1 })).rejects.toThrow(
      'not supported by the YouTube Data API',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
