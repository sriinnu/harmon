import { describe, expect, it } from 'vitest';
import { classifyError } from './error-classification.js';

describe('classifyError', () => {
  it('maps prefixed upstream API errors to their status', () => {
    const classified = classifyError(new Error('Spotify API error: 404 not found'));
    expect(classified.code).toBe('UPSTREAM_SERVICE_ERROR');
  });

  it('maps typed rate-limit errors to upstream 429, not INTERNAL_ERROR', () => {
    for (const message of [
      'Spotify rate limited; retry after 120s',
      'YouTube API rate limited; retry after 60s',
    ]) {
      const classified = classifyError(new Error(message));
      expect(classified.code).toBe('UPSTREAM_SERVICE_ERROR');
      expect(classified.message).toContain('retry after');
    }
  });

  it('maps quota exhaustion to an upstream error', () => {
    const classified = classifyError(new Error('YouTube API daily quota exceeded'));
    expect(classified.code).toBe('UPSTREAM_SERVICE_ERROR');
  });

  it('maps the retired Spotify cookie flow to provider-unavailable', () => {
    const classified = classifyError(new Error(
      'Spotify cookie-based auth is no longer supported by Spotify. Use OAuth (PKCE) login instead.',
    ));
    expect(classified.code).toBe('PROVIDER_UNAVAILABLE');
  });
});
