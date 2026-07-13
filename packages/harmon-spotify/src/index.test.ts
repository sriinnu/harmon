import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSpotifyAuth,
  createSpotifyClient,
  sanitizeSpotifyCookies,
  SpotifyRateLimitError,
  type SpotifyTokens,
} from './index.js';

function connectedAuth(): ReturnType<typeof createSpotifyAuth> {
  return createSpotifyAuth({
    clientId: 'client-id',
    redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
    tokenStore: {
      get: async (): Promise<SpotifyTokens> => ({
        accessToken: 'api-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60 * 60_000,
      }),
      set: async () => undefined,
    },
  });
}

function jsonResponse(body: unknown, init: { status?: number; retryAfter?: string } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'retry-after' ? init.retryAfter ?? null : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('sanitizeSpotifyCookies', () => {
  it('keeps only supported Spotify auth cookies', () => {
    const cookies = sanitizeSpotifyCookies([
      {
        domain: '.spotify.com',
        name: 'sp_dc',
        path: '/',
        value: 'keep',
        isSecure: true,
        isHTTPOnly: true,
      },
      {
        domain: '.spotify.com',
        name: 'other',
        path: '/',
        value: 'drop',
        isSecure: true,
        isHTTPOnly: true,
      },
    ]);

    expect(cookies).toEqual([
      expect.objectContaining({
        domain: 'spotify.com',
        name: 'sp_dc',
        value: 'keep',
      }),
    ]);
  });
});

describe('SpotifyAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports cookie-backed auth mode when only supported cookies are present', async () => {
    const auth = createSpotifyAuth({
      clientId: 'client-id',
      redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
    });

    await auth.setCookies([
      {
        domain: '.spotify.com',
        name: 'sp_dc',
        path: '/',
        value: 'cookie-value',
        isSecure: true,
        isHTTPOnly: true,
      },
    ]);

    expect(auth.getAuthMode()).toBe('cookies');
  });

  it('sends only supported cookies that apply to the access-token endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'web-token',
        accessTokenExpirationTimestampMs: Date.now() + 5 * 60_000,
        tokenType: 'Bearer',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = createSpotifyAuth({
      clientId: 'client-id',
      redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
      cookieStore: {
        get: async () => [
          {
            domain: '.spotify.com',
            name: 'sp_dc',
            path: '/',
            value: 'keep',
            isSecure: true,
            isHTTPOnly: true,
          },
          {
            domain: '.spotify.com',
            name: 'sp_key',
            path: '/account',
            value: 'skip-path',
            isSecure: true,
            isHTTPOnly: true,
          },
          {
            domain: '.spotify.com',
            name: 'other',
            path: '/',
            value: 'skip-name',
            isSecure: true,
            isHTTPOnly: true,
          },
        ],
        set: async () => undefined,
      },
    });

    const token = await auth.getAccessToken();

    expect(token).toBe('web-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({
        Cookie: 'sp_dc=keep',
      }),
    });
  });

  it('keeps multiple login attempts valid until each callback completes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'oauth-token',
        expires_in: 3600,
        token_type: 'Bearer',
        refresh_token: 'refresh-token',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = createSpotifyAuth({
      clientId: 'client-id',
      redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
    });

    const firstLoginUrl = new URL(auth.getLoginUrl());
    const secondLoginUrl = new URL(auth.getLoginUrl());
    const firstState = firstLoginUrl.searchParams.get('state');
    const secondState = secondLoginUrl.searchParams.get('state');

    expect(firstState).toBeTruthy();
    expect(secondState).toBeTruthy();
    expect(firstState).not.toBe(secondState);

    await expect(auth.handleCallback('code-one', firstState ?? undefined)).resolves.toBeUndefined();
    await expect(auth.handleCallback('code-two', secondState ?? undefined)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null instead of throwing when tokens are expired with no refresh token and no cookies', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const auth = createSpotifyAuth({
      clientId: 'client-id',
      redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
      tokenStore: {
        get: async (): Promise<SpotifyTokens> => ({
          accessToken: 'stale-token',
          expiresAt: Date.now() - 1000,
        }),
        set: async () => undefined,
      },
    });

    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consumes the OAuth state before the token exchange so it is single-use', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'server_error' }, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = createSpotifyAuth({
      clientId: 'client-id',
      redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
    });

    const state = new URL(auth.getLoginUrl()).searchParams.get('state') ?? undefined;

    await expect(auth.handleCallback('code-one', state)).rejects.toThrow('Spotify token exchange failed');
    await expect(auth.handleCallback('code-one', state)).rejects.toThrow('Invalid OAuth state');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports cookie auth as unsupported when Spotify rejects get_access_token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = createSpotifyAuth({
      clientId: 'client-id',
      redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
      cookieStore: {
        get: async () => [
          {
            domain: '.spotify.com',
            name: 'sp_dc',
            path: '/',
            value: 'cookie-value',
            isSecure: true,
            isHTTPOnly: true,
          },
        ],
        set: async () => undefined,
      },
    });

    await expect(auth.getAccessToken()).rejects.toThrow(
      'Spotify cookie-based auth is no longer supported by Spotify',
    );
  });

  it('includes the scopes required by the exported top-tracks surface', () => {
    const auth = createSpotifyAuth({
      clientId: 'client-id',
      redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
    });

    const loginUrl = new URL(auth.getLoginUrl());
    const scopes = (loginUrl.searchParams.get('scope') || '').split(' ');

    expect(scopes).toContain('user-top-read');
  });
});

describe('SpotifyClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops literal null entries from search item arrays', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      tracks: {
        items: [
          null,
          {
            id: 'track-1',
            name: 'Track One',
            duration_ms: 1000,
            uri: 'spotify:track:track-1',
            type: 'track',
            artists: [{ name: 'Artist One' }],
            album: { name: 'Album One' },
          },
        ],
      },
      playlists: {
        items: [
          null,
          {
            id: 'playlist-1',
            name: 'Playlist One',
            public: true,
            uri: 'spotify:playlist:playlist-1',
            owner: { display_name: 'Owner' },
            tracks: { total: 3 },
          },
          null,
        ],
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createSpotifyClient({ auth: connectedAuth() });
    const result = await client.search('focus', ['track', 'playlist']);

    expect(result.tracks).toEqual([expect.objectContaining({ id: 'track-1' })]);
    expect(result.playlists).toEqual([expect.objectContaining({ id: 'playlist-1' })]);
  });

  it('fails fast with a typed error when Retry-After exceeds the wait cap', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'rate limited' }, { status: 429, retryAfter: '120' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createSpotifyClient({ auth: connectedAuth() });

    await expect(client.search('focus', ['track'])).rejects.toThrow('Spotify rate limited; retry after 120s');
    await expect(client.search('focus', ['track'])).rejects.toBeInstanceOf(SpotifyRateLimitError);
    // No retry should have happened for the first call (one fetch per attempt).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('degrades gracefully when the audio-features endpoint is deprecated (403)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'forbidden' }, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const client = createSpotifyClient({ auth: connectedAuth() });

    await expect(client.getAudioFeatures(['a', 'b'])).resolves.toEqual([null, null]);
  });

  it('returns empty recommendations when the endpoint is deprecated (404)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'not found' }, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const client = createSpotifyClient({ auth: connectedAuth() });

    await expect(client.getRecommendations({ seedTracks: ['a'] })).resolves.toEqual([]);
  });
});
