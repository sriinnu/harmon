/**
 * error-classification.ts — Route error classification and HTTP response formatting
 *
 * Converts arbitrary thrown errors into stable HTTP error responses by
 * pattern-matching on known provider/daemon error messages.  Extracted
 * from the Harmond class so error classification is independently testable.
 *
 * @module error-classification
 */

import type { Response } from 'express';
import {
  ApiError,
  ConfigurationError,
  ProviderUnavailableError,
  SessionNotFoundError,
  UnsupportedPlatformError,
  UpstreamServiceError,
  ValidationError,
} from './errors.js';

/**
 * Classify an arbitrary error into a stable {@link ApiError} with correct
 * HTTP status code and error code.
 */
export function classifyError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  const upstreamStatusCode = extractUpstreamStatusCode(message);

  if (upstreamStatusCode !== undefined) {
    return new UpstreamServiceError(message, upstreamStatusCode);
  }

  // Typed provider errors that no longer carry an "API error: <status>"
  // prefix: rate limits, quota exhaustion, and the retired cookie flow.
  if (/rate limited; retry after \d+s/i.test(message)) {
    return new UpstreamServiceError(message, 429);
  }
  if (message.includes('daily quota exceeded')) {
    return new UpstreamServiceError(message, 429);
  }
  if (message.includes('cookie-based auth is no longer supported')) {
    return new ProviderUnavailableError(message);
  }

  if (
    message.includes('configuration missing') ||
    message.includes('not configured')
  ) {
    return new ConfigurationError(message);
  }

  if (
    message.includes('not connected') ||
    message.includes('session expired') ||
    message.includes('No refresh token available') ||
    message.includes('user token required') ||
    message.includes('requires YOUTUBE_MUSIC_ACCESS_TOKEN')
  ) {
    return new ProviderUnavailableError(message);
  }

  if (message === 'No active session') {
    return new SessionNotFoundError();
  }

  if (message === 'Apple Music local playback is only supported on macOS.') {
    return new UnsupportedPlatformError(message);
  }

  if (message.includes('not supported in browser-handoff mode')) {
    return new ApiError(501, message, 'UNSUPPORTED_OPERATION');
  }

  if (
    message.startsWith('Invalid ') ||
    message.startsWith('Missing ') ||
    message.includes('Login flow expired') ||
    message.includes('must be one of') ||
    message.includes('must use') ||
    message.includes('queue is empty') ||
    message.includes('playback history is empty') ||
    message.includes('could not be resolved to a playable URL') ||
    message.includes('Maximum 5 total seeds allowed') ||
    message.includes('At least one seed')
  ) {
    return new ValidationError(message);
  }

  return new ApiError(500, message, 'INTERNAL_ERROR');
}

/**
 * Extract a numeric HTTP status code from known upstream error message prefixes
 * (e.g. "Spotify API error: 429 ...").
 */
export function extractUpstreamStatusCode(message: string): number | undefined {
  const match = message.match(
    /^(Spotify API error|Spotify token refresh failed|Spotify token exchange failed|Spotify cookie token failed|Apple Music API error|YouTube API error): (\d+)/
  );

  if (!match) {
    return undefined;
  }

  return Number.parseInt(match[2], 10);
}

/**
 * Normalize a route handler error into an HTTP response.
 *
 * In production the raw message of internal errors is hidden behind a
 * generic "Internal server error" string.
 */
export function handleRouteError(res: Response, error: unknown, asText = false): void {
  const apiError = classifyError(error);
  const message =
    apiError.code === 'INTERNAL_ERROR' && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : apiError.message;

  if (asText) {
    res.status(apiError.statusCode).send(message);
    return;
  }

  res.status(apiError.statusCode).json({
    success: false,
    error: message,
    code: apiError.code,
    details: apiError.details,
  });
}
