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

  it('uses related-video search for YouTube recommendations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: { videoId: 'video-2' },
            snippet: {
              title: 'Related Song',
              channelTitle: 'Related Artist - Topic',
              thumbnails: { medium: { url: 'https://img.test/related-song.jpg' } },
            },
          },
        ],
      }),
    }));

    const provider = createYouTubeMusicProvider(createYouTubeMusicClient({ apiKey: 'yt-key' }));
    const recommendations = await provider.getRecommendations({ seedTrackIds: ['video-1'], limit: 1 });

    expect(recommendations).toEqual([
      expect.objectContaining({
        id: 'video-2',
        provider: 'youtube',
      }),
    ]);
  });

  it('uses liked-library order as the best available YouTube affinity signal', async () => {
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
                title: 'Affinity Song',
                channelTitle: 'Affinity Artist - Topic',
                resourceId: { videoId: 'affinity-video-1' },
              },
              contentDetails: { videoId: 'affinity-video-1' },
            },
          ],
        }),
      })
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
                title: 'Affinity Song',
                channelTitle: 'Affinity Artist - Topic',
                resourceId: { videoId: 'affinity-video-1' },
              },
              contentDetails: { videoId: 'affinity-video-1' },
            },
          ],
        }),
      }));

    const provider = createYouTubeMusicProvider(createYouTubeMusicClient({ accessToken: 'yt-token' }));

    await expect(provider.getTopTracks({ limit: 1 })).resolves.toEqual([
      expect.objectContaining({
        id: 'affinity-video-1',
        provider: 'youtube',
      }),
    ]);
    await expect(provider.getRecentlyPlayed({ limit: 1 })).resolves.toEqual([
      expect.objectContaining({
        id: 'affinity-video-1',
        provider: 'youtube',
      }),
    ]);
  });
});
