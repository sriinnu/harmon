import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshToken, type YouTubeAuthState, type YouTubePackConfig } from './auth-cli.js';

const config: YouTubePackConfig = {
  clientId: 'client-id',
  redirectUri: 'http://127.0.0.1:8789/callback',
  scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
};

function baseState(): YouTubeAuthState {
  return {
    provider: 'youtube-music',
    updatedAt: new Date(0).toISOString(),
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    expiresAt: new Date(0).toISOString(),
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    tokenType: 'Bearer',
  };
}

describe('youtube auth-cli refreshToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves a rotated refresh token returned by Google', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'rotated-refresh-token',
      }),
    }));

    const state = await refreshToken(config, baseState());

    expect(state.accessToken).toBe('new-access-token');
    expect(state.refreshToken).toBe('rotated-refresh-token');
  });

  it('keeps the stored refresh token when Google does not rotate it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 3600,
      }),
    }));

    const state = await refreshToken(config, baseState());

    expect(state.refreshToken).toBe('old-refresh-token');
  });
});
