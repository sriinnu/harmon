/**
 * routes/auth.ts — Spotify authentication routes
 *
 * Registers /v1/auth/spotify/* endpoints for OAuth login,
 * callback handling, logout, and cookie import.
 *
 * @module routes/auth
 */

import type { Application, Request, Response } from 'express';
import type { DaemonContext } from '../daemon-context.js';
import { parseBodyString, sanitizeImportedSpotifyCookies } from '../helpers.js';

export function registerAuthRoutes(app: Application, ctx: DaemonContext): void {
  // Login — return the OAuth authorization URL
  app.post('/v1/auth/spotify/login', (_req: Request, res: Response) => {
    try {
      res.json({ url: ctx.spotifyAuth.getLoginUrl() });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Callback — exchange the OAuth code for tokens
  app.get('/v1/auth/spotify/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      if (!code) {
        res.status(400).send('Missing code.');
        return;
      }
      await ctx.spotifyAuth.handleCallback(code, state);
      ctx.broadcastEvent('spotify.connected', {});
      res.status(200).send('Spotify connected. You can close this window.');
    } catch (error) {
      ctx.handleRouteError(res, error, true);
    }
  });

  // Logout — clear tokens and disconnect
  app.post('/v1/auth/spotify/logout', async (_req: Request, res: Response) => {
    try {
      await ctx.spotifyAuth.logout();
      ctx.broadcastEvent('spotify.disconnected', {});
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Cookie import — with schema validation
  app.post('/v1/auth/spotify/import', async (req: Request, res: Response) => {
    try {
      const cookies = req.body?.cookies;
      if (!Array.isArray(cookies) || cookies.length === 0) {
        res.status(400).json({ success: false, error: 'Missing cookies array' });
        return;
      }
      const validated = sanitizeImportedSpotifyCookies(cookies);
      if (validated.length === 0) {
        res.status(400).json({
          success: false,
          error:
            'No supported Spotify auth cookies found. Import sp_dc and/or sp_key from spotify.com.',
        });
        return;
      }
      await ctx.validateImportedSpotifyCookies(validated);
      await ctx.spotifyAuth.setCookies(validated);
      res.json({ success: true, cookiesImported: validated.length });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ==========================================================================
  // YouTube Music OAuth
  // ==========================================================================

  app.post('/v1/auth/youtube/login', (_req: Request, res: Response) => {
    try {
      if (!ctx.youtubeAuth) {
        res.status(503).json({ success: false, error: 'YouTube Music OAuth not configured (set YOUTUBE_MUSIC_CLIENT_ID)' });
        return;
      }
      res.json({ url: ctx.youtubeAuth.getLoginUrl() });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/auth/youtube/callback', async (req: Request, res: Response) => {
    try {
      if (!ctx.youtubeAuth) {
        res.status(503).send('YouTube Music OAuth not configured.');
        return;
      }
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      if (!code) {
        res.status(400).send('Missing code.');
        return;
      }
      await ctx.youtubeAuth.handleCallback(code, state);
      ctx.broadcastEvent('youtube.connected', {});
      res.status(200).send('YouTube Music connected. You can close this window.');
    } catch (error) {
      ctx.handleRouteError(res, error, true);
    }
  });

  app.post('/v1/auth/youtube/refresh', async (_req: Request, res: Response) => {
    try {
      if (!ctx.youtubeAuth) {
        res.status(503).json({ success: false, error: 'YouTube Music OAuth not configured' });
        return;
      }
      await ctx.youtubeAuth.refresh();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/auth/youtube/logout', async (_req: Request, res: Response) => {
    try {
      if (!ctx.youtubeAuth) {
        res.status(503).json({ success: false, error: 'YouTube Music OAuth not configured' });
        return;
      }
      await ctx.youtubeAuth.logout();
      ctx.broadcastEvent('youtube.disconnected', {});
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ==========================================================================
  // Apple Music
  // ==========================================================================

  app.post('/v1/auth/apple/set-user-token', async (req: Request, res: Response) => {
    try {
      if (!ctx.appleAuth) {
        res.status(503).json({ success: false, error: 'Apple Music auth not configured' });
        return;
      }
      const token = parseBodyString(req.body?.token);
      if (!token) {
        res.status(400).json({ success: false, error: 'Missing token' });
        return;
      }
      await ctx.appleAuth.setUserToken(token);
      // Persisting alone is not enough — the running client must pick the
      // token up or library endpoints stay dead until restart.
      ctx.applyAppleUserToken(token);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/auth/apple/refresh', async (_req: Request, res: Response) => {
    try {
      if (!ctx.appleAuth) {
        res.status(503).json({ success: false, error: 'Apple Music auth not configured' });
        return;
      }
      // Force regenerate developer token if key material available
      const token = await ctx.appleAuth.getDeveloperToken();
      res.json({ success: true, hasToken: !!token });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/auth/apple/logout', async (_req: Request, res: Response) => {
    try {
      if (!ctx.appleAuth) {
        res.status(503).json({ success: false, error: 'Apple Music auth not configured' });
        return;
      }
      await ctx.appleAuth.logout();
      ctx.broadcastEvent('apple.disconnected', {});
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });
}
