import { describe, expect, it } from 'vitest';
import {
  createYouTubeMusicClient,
  createYouTubeMusicProvider,
} from './index.js';

describe('harmon-youtube', () => {
  it('requires a supported credential source', () => {
    expect(() => createYouTubeMusicClient({ cookies: 'SID=abc' })).toThrow(
      'Cookies-only mode is not implemented in this build',
    );
  });

  it('reports connected when Data API access is configured', () => {
    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });
    expect(client.isConnected()).toBe(true);
  });

  it('rejects unsupported search types instead of returning empty result groups', async () => {
    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });

    await expect(client.search('bonobo', ['albums'])).rejects.toThrow(
      'search types not implemented in this build: albums',
    );
  });

  it('fails fast on unimplemented library and recommendation surfaces', async () => {
    const client = createYouTubeMusicClient({ apiKey: 'yt-key' });

    await expect(client.getLibrarySongs()).rejects.toThrow('library access is not implemented');
    await expect(client.getPlaylists()).rejects.toThrow('playlist listing is not implemented');
    await expect(client.getRecommendations()).rejects.toThrow('recommendations are not implemented');
    await expect(client.getWatchPlaylist('video-id')).rejects.toThrow('watch playlists are not implemented');
  });

  it('keeps provider-only unsupported surfaces explicit', async () => {
    const provider = createYouTubeMusicProvider(createYouTubeMusicClient({ apiKey: 'yt-key' }));

    await expect(provider.getTopTracks()).rejects.toThrow('top tracks are not implemented');
    await expect(provider.getRecentlyPlayed()).rejects.toThrow('recently played is not implemented');
  });
});
