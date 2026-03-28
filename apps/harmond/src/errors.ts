/**
 * Error handling middleware and custom error types
 */

import type { Request, Response, NextFunction } from 'express';
import type { Logger } from '@sriinnu/harmon-logger';

/**
 * I use ApiError as the canonical HTTP error envelope for the daemon.
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * I use this when a request expects an active session but none exists.
 */
export class SessionNotFoundError extends ApiError {
  constructor() {
    super(404, 'No active session', 'SESSION_NOT_FOUND');
  }
}

/**
 * I use this for daemon or provider configuration gaps that make a route unavailable.
 */
export class ConfigurationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(503, message, 'CONFIGURATION_ERROR', details);
  }
}

/**
 * I use this when the daemon depends on provider state that is not ready yet.
 */
export class ProviderUnavailableError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(503, message, 'PROVIDER_UNAVAILABLE', details);
  }
}

/**
 * I use this for upstream provider failures so callers can distinguish them from bad input.
 */
export class UpstreamServiceError extends ApiError {
  constructor(message: string, public upstreamStatusCode?: number, code = 'UPSTREAM_SERVICE_ERROR') {
    super(upstreamStatusCode === 429 ? 503 : 502, message, code, { upstreamStatusCode });
  }
}

/**
 * I use this when a route is valid in general but unavailable on the current platform.
 */
export class UnsupportedPlatformError extends ApiError {
  constructor(message: string) {
    super(501, message, 'UNSUPPORTED_PLATFORM');
  }
}

export class SpotifyApiError extends ApiError {
  constructor(message: string, public spotifyStatusCode?: number) {
    super(500, message, 'SPOTIFY_API_ERROR', { spotifyStatusCode });
  }
}

/**
 * I use this for caller-supplied payload, query, and path validation failures.
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'VALIDATION_ERROR', details);
  }
}

export function errorHandler(logger: Logger) {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    // Handle known API errors
    if (err instanceof ApiError) {
      logger.warn({
        error: err.message,
        code: err.code,
        path: req.path,
        statusCode: err.statusCode,
      }, 'API error');

      res.status(err.statusCode).json({
        success: false,
        error: err.message,
        code: err.code,
        details: err.details,
      });
      return;
    }

    // Handle validation errors (Zod)
    if (err.name === 'ZodError') {
      logger.warn({ error: err, path: req.path }, 'Validation error');
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: (err as any).issues,
      });
      return;
    }

    // Handle malformed JSON bodies from express.json/body-parser.
    if (err instanceof SyntaxError && 'body' in err && (err as { status?: number }).status === 400) {
      logger.warn({ error: err.message, path: req.path }, 'Invalid JSON body');
      res.status(400).json({
        success: false,
        error: 'Invalid JSON',
        code: 'INVALID_JSON',
      });
      return;
    }

    // Handle unexpected errors
    logger.error({
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      path: req.path,
      method: req.method,
    }, 'Unexpected error');

    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
      code: 'INTERNAL_ERROR',
    });
  };
}
