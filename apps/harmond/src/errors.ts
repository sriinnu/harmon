/**
 * Error handling middleware and custom error types
 */

import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';

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

export class SessionNotFoundError extends ApiError {
  constructor() {
    super(404, 'No active session', 'SESSION_NOT_FOUND');
  }
}

export class SpotifyApiError extends ApiError {
  constructor(message: string, public spotifyStatusCode?: number) {
    super(500, message, 'SPOTIFY_API_ERROR', { spotifyStatusCode });
  }
}

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
