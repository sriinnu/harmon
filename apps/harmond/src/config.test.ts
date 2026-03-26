import { describe, expect, it } from 'vitest';
import { validateDaemonEnvironment } from './config.js';

describe('validateDaemonEnvironment', () => {
  const baseOptions = {
    apiToken: 'token',
    corsOrigins: ['http://localhost:3000'],
    encryptionSecret: 'x'.repeat(32),
    host: '127.0.0.1',
    nodeEnv: 'production',
    port: 17373,
  };

  it('rejects production startup without an API token', () => {
    expect(() =>
      validateDaemonEnvironment({
        ...baseOptions,
        apiToken: undefined,
      }),
    ).toThrow('HARMON_API_TOKEN is required in production.');
  });

  it('rejects inferred Spotify callbacks in production', () => {
    expect(() =>
      validateDaemonEnvironment({
        ...baseOptions,
        spotifyClientId: 'client-id',
        spotifyRedirectUri: undefined,
      }),
    ).toThrow('SPOTIFY_REDIRECT_URI is required in production.');
  });

  it('accepts cookie-only Spotify production startup without OAuth callback config', () => {
    const result = validateDaemonEnvironment({
      ...baseOptions,
      spotifyClientId: undefined,
      spotifyRedirectUri: undefined,
    });

    expect(result.spotifyRedirectUri).toBe(
      'http://127.0.0.1:17373/v1/auth/spotify/callback',
    );
  });

  it('rejects redirect-only Spotify OAuth config in production', () => {
    expect(() =>
      validateDaemonEnvironment({
        ...baseOptions,
        spotifyClientId: undefined,
        spotifyRedirectUri: 'https://harmon.example/v1/auth/spotify/callback',
      }),
    ).toThrow('SPOTIFY_CLIENT_ID is required when SPOTIFY_REDIRECT_URI is set in production.');
  });

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      validateDaemonEnvironment({
        ...baseOptions,
        corsOrigins: ['*'],
        spotifyRedirectUri: 'https://harmon.example/v1/auth/spotify/callback',
      }),
    ).toThrow('HARMON_CORS_ORIGINS cannot include "*" in production.');
  });

  it('accepts loopback http callbacks in production', () => {
    const result = validateDaemonEnvironment({
      ...baseOptions,
      spotifyClientId: 'client-id',
      spotifyRedirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
    });

    expect(result.spotifyRedirectUri).toBe(
      'http://localhost:17373/v1/auth/spotify/callback',
    );
  });
});
