import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpotifyAuth, sanitizeSpotifyCookies } from './index.js';

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
});
