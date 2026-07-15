/**
 * middleware.ts — Express middleware setup for the Harmon daemon
 *
 * Configures body parsing, request logging, security headers, rate
 * limiting, CORS, and auth token verification.  Extracted from the
 * Harmond class so the middleware stack is declared in one place.
 *
 * @module middleware
 */

import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '@sriinnu/harmon-logger';

/** Options for configuring daemon middleware. */
export interface MiddlewareOptions {
  /** Logger for HTTP request traces. */
  requestLogger: Logger;
  /** Whether the daemon accepts all origins. */
  allowAllOrigins: boolean;
  /** Set of allowed CORS origins. */
  corsOrigins: Set<string>;
}

/**
 * Apply the standard daemon middleware stack to an Express app.
 *
 * Adds (in order): body parsing, request-id + logging, security headers,
 * rate limiters (global, auth, command), and CORS.
 */
export function applyMiddleware(
  app: express.Application,
  opts: MiddlewareOptions,
): void {
  // Explicit body size limit. /v1/recognize carries base64 audio (up to
  // ~2 MB raw → ~2.7 MB encoded), so it gets its own parser budget; the
  // global 100 KB cap would otherwise reject every recognition request.
  const jsonBody = express.json({ limit: '100kb' });
  const audioJsonBody = express.json({ limit: '4mb' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Express routes case-insensitively and tolerates trailing slashes, so
    // normalize before matching or /V1/recognize/ gets the 100 KB parser.
    const normalizedPath = req.path.replace(/\/+$/, '').toLowerCase();
    (normalizedPath === '/v1/recognize' ? audioJsonBody : jsonBody)(req, res, next);
  });

  // Request ID + logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const requestId = uuidv4();
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      if (process.env.NODE_ENV === 'test') {
        return;
      }
      opts.requestLogger.info({
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: Date.now() - start,
      }, 'HTTP request');
    });

    next();
  });

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Rate limiting — more generous for a music daemon
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300,            // several live surfaces (web, menubar, MCP) poll at once
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests' },
    // /v1/apple/remote/* is the device-bridge protocol: a registered player
    // polls commands every ~2s and reports state — that's infrastructure
    // traffic like /v1/events, not a client to throttle. Starving it makes
    // playback silently fall back to opening Music.app.
    skip: (req) =>
      req.path === '/health' ||
      req.path === '/v1/events' ||
      req.path.startsWith('/v1/apple/remote/'),
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Too many authentication attempts' },
    // Exempt the harmless flows: OAuth callbacks (browser redirects,
    // state-protected) and login-URL/logout requests — fetching a login URL
    // is not brute-forceable, and budgeting it like one locks users out of
    // their own auth for 15 minutes after a few retries.
    skip: (req) =>
      req.path === '/spotify/callback' ||
      req.path === '/youtube/callback' ||
      req.path.endsWith('/login') ||
      req.path.endsWith('/logout'),
  });

  const commandLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, error: 'Command rate limit exceeded' },
  });

  app.use(globalLimiter);
  app.use('/v1/auth', authLimiter);
  app.use('/v1/command', commandLimiter);

  // CORS
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (!origin) { next(); return; }

    if (!isOriginAllowed(origin, opts.allowAllOrigins, opts.corsOrigins)) {
      res.status(403).json({ success: false, error: 'Origin not allowed' });
      return;
    }

    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
}

/**
 * Check whether the given origin is allowed by the daemon's CORS policy.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowAllOrigins: boolean,
  corsOrigins: Set<string>,
): boolean {
  if (!origin) return false;
  if (allowAllOrigins) {
    if (process.env.NODE_ENV === 'production') return false;
    return true;
  }
  return corsOrigins.has(origin);
}

// ============================================================================
// Auth helpers
// ============================================================================

/**
 * Create an Express middleware that enforces Bearer token authentication
 * on all `/v1` routes except the Spotify OAuth callback.
 *
 * Apple remote endpoints accept either the dedicated remote token or
 * the main API token.
 */
export function createAuthMiddleware(
  apiToken: string | undefined,
  appleRemoteToken: string | undefined,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // OAuth callbacks are browser redirects that cannot carry a bearer
    // header; both are CSRF-protected by single-use state validation.
    if (req.path === '/auth/spotify/callback' || req.path === '/auth/youtube/callback') { next(); return; }
    const token = extractAuthorizationToken(req) ||
      // EventSource cannot send an Authorization header, so the SSE stream
      // (read-only) may authenticate with a ?token= query parameter.
      (req.path === '/events' && typeof req.query.token === 'string' ? req.query.token : '');

    if (req.path.startsWith('/apple/remote')) {
      const authorized =
        tokensMatch(appleRemoteToken, token) || tokensMatch(apiToken, token);
      if (authorized) {
        next();
        return;
      }
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!apiToken) { next(); return; }

    if (!tokensMatch(apiToken, token)) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    next();
  };
}

/**
 * Extract the Bearer token from an Authorization header.
 */
export function extractAuthorizationToken(req: Request): string {
  const authHeader = req.header('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

/**
 * Timing-safe comparison of two tokens via HMAC.
 */
export function tokensMatch(expected: string | undefined, provided: string): boolean {
  if (!expected) {
    return false;
  }
  const hmacKey = 'harmon-auth-compare';
  const expectedMac = createHmac('sha256', hmacKey).update(expected).digest();
  const providedMac = createHmac('sha256', hmacKey).update(provided).digest();
  return timingSafeEqual(expectedMac, providedMac);
}
