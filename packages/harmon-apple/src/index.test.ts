import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAppleMusicClient,
  createAppleMusicProvider,
} from './index.js';

describe('harmon-apple', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps catalog search results into the shared Apple shapes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          songs: {
            data: [
              {
                id: 'song-1',
                attributes: {
                  name: 'Song One',
                  artistName: 'Artist One',
                  albumName: 'Album One',
                  durationInMillis: 180000,
                  url: 'https://music.apple.com/us/song/song-1',
                },
              },
            ],
          },
        },
      }),
    }));

    const client = createAppleMusicClient({ developerToken: 'developer-token' });
    const result = await client.search('focus', ['songs'], { limit: 1 });

    expect(result.songs).toEqual([
      expect.objectContaining({
        id: 'song-1',
        name: 'Song One',
        artistName: 'Artist One',
      }),
    ]);
  });

  it('maps recent-played tracks from the Apple user surface', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'recent-song-1',
            attributes: {
              name: 'Recent Song',
              artistName: 'Recent Artist',
              albumName: 'Recent Album',
              durationInMillis: 210000,
              url: 'https://music.apple.com/us/song/recent-song-1',
            },
          },
        ],
      }),
    }));

    const client = createAppleMusicClient({
      developerToken: 'developer-token',
      userToken: 'user-token',
    });
    const result = await client.getRecentlyPlayedTracks({ limit: 1 });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'recent-song-1',
        name: 'Recent Song',
        artistName: 'Recent Artist',
      }),
    ]);
  });

  it('uses recent plays and catalog search for Apple provider recommendations', async () => {
    const provider = createAppleMusicProvider({
      getSong: async () => null,
      getAlbum: async () => null,
      getArtist: async () => null,
      getPlaylist: async () => null,
      getPlaylistTracks: async () => [
        {
          id: 'playlist-song-1',
          name: 'Playlist Song',
          artistName: 'Playlist Artist',
          albumName: 'Playlist Album',
          url: 'https://music.apple.com/us/song/playlist-song-1',
        },
      ],
      getRecentlyPlayedTracks: async () => [
        {
          id: 'recent-song-1',
          name: 'Recent Song',
          artistName: 'Recent Artist',
          albumName: 'Recent Album',
          url: 'https://music.apple.com/us/song/recent-song-1',
        },
      ],
      getLibrarySongs: async () => [
        {
          id: 'library-song-1',
          name: 'Library Song',
          artistName: 'Library Artist',
          albumName: 'Library Album',
        },
      ],
      getLibraryAlbums: async () => [],
      getLibraryPlaylists: async () => [],
      search: async (term: string) => ({
        songs: [
          {
            id: 'recommended-song-1',
            name: `Recommended from ${term}`,
            artistName: 'Recommended Artist',
            albumName: 'Recommended Album',
            url: 'https://music.apple.com/us/song/recommended-song-1',
          },
        ],
        albums: [],
        artists: [],
        playlists: [],
      }),
    });

    await expect(provider.getTopTracks()).resolves.toEqual([
      expect.objectContaining({
        id: 'recent-song-1',
        provider: 'apple',
      }),
    ]);
    await expect(provider.getRecentlyPlayed()).resolves.toEqual([
      expect.objectContaining({
        id: 'recent-song-1',
        provider: 'apple',
      }),
    ]);
    await expect(provider.getPlaylistTracks('playlist-id')).resolves.toEqual([
      expect.objectContaining({
        id: 'playlist-song-1',
        provider: 'apple',
      }),
    ]);
    await expect(provider.getLibraryTracks({ limit: 1 })).resolves.toEqual([
      expect.objectContaining({
        id: 'library-song-1',
        provider: 'apple',
      }),
    ]);
    await expect(provider.getRecommendations({ limit: 1 })).resolves.toEqual([
      expect.objectContaining({
        id: 'recommended-song-1',
        provider: 'apple',
      }),
    ]);
  });
});
