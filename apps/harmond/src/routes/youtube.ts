/**
 * routes/youtube.ts — YouTube Music browse, playback, and queue routes
 *
 * Registers all /v1/youtube/* endpoints. YouTube Music uses browser-handoff
 * for playback (opens URLs in the user's default browser).
 *
 * @module routes/youtube
 */

import type { Application, Request, Response } from 'express';
import type { DaemonContext } from '../daemon-context.js';
import { clampNumber, parseBodyString, parseYouTubeSearchTypes } from '../helpers.js';

export function registerYouTubeRoutes(app: Application, ctx: DaemonContext): void {
  // ── Catalog search ──────────────────────────────────────────────────
  app.get('/v1/youtube/search', async (req: Request, res: Response) => {
    try {
      const client = ctx.getYouTubeMusicClient();
      const query = req.query.q;
      if (typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ success: false, error: 'Missing query (q)' });
        return;
      }
      const type = typeof req.query.type === 'string' ? req.query.type : 'songs';
      const types = parseYouTubeSearchTypes(type);
      res.json(
        await client.search(query, types, {
          limit: clampNumber(req.query.limit, 1, 25),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Single-resource lookups ─────────────────────────────────────────
  app.get('/v1/youtube/songs/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid id' });
        return;
      }
      res.json(await ctx.getYouTubeMusicClient().getSong(id));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/youtube/playlists/:id/tracks', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid id' });
        return;
      }
      res.json(
        await ctx.getYouTubeMusicClient().getPlaylistTracks(id, {
          limit: clampNumber(req.query.limit, 1, 100),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/youtube/playlists', async (req: Request, res: Response) => {
    try {
      res.json(
        await ctx.getYouTubeMusicClient().getPlaylists({
          limit: clampNumber(req.query.limit, 1, 50),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Library ─────────────────────────────────────────────────────────
  app.get('/v1/youtube/library/tracks', async (req: Request, res: Response) => {
    try {
      res.json(
        await ctx.getYouTubeMusicClient().getLibrarySongs({
          limit: clampNumber(req.query.limit, 1, 100),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Recommendations ─────────────────────────────────────────────────
  app.get('/v1/youtube/recommendations', async (req: Request, res: Response) => {
    try {
      const provider = ctx.getReadProvider('youtube');
      const seedTrackIds =
        typeof req.query.seed === 'string'
          ? req.query.seed
              .split(',')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
          : [];
      res.json(
        await provider.getRecommendations({
          seedTrackIds,
          limit: clampNumber(req.query.limit, 1, 50),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Now-playing ─────────────────────────────────────────────────────
  app.get('/v1/youtube/now-playing', async (_req: Request, res: Response) => {
    try {
      const playback = ctx.getPlaybackRuntime('youtube').playback;
      res.json(await playback.getNowPlaying());
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Playback controls ──────────────────────────────────────────────
  app.post('/v1/youtube/play', async (req: Request, res: Response) => {
    try {
      const uri = parseBodyString(req.body?.uri);
      const playback = ctx.getPlaybackRuntime('youtube').playback;
      await ctx.pauseOtherProviders('youtube');
      await playback.play(uri ? { uri } : undefined);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/youtube/pause', async (_req: Request, res: Response) => {
    try {
      await ctx.getPlaybackRuntime('youtube').playback.pause();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/youtube/next', async (_req: Request, res: Response) => {
    try {
      await ctx.getPlaybackRuntime('youtube').playback.next();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/youtube/prev', async (_req: Request, res: Response) => {
    try {
      await ctx.getPlaybackRuntime('youtube').playback.previous();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Queue ───────────────────────────────────────────────────────────
  app.post('/v1/youtube/queue', async (req: Request, res: Response) => {
    try {
      const uri = parseBodyString(req.body?.uri);
      if (!uri) {
        res.status(400).json({ success: false, error: 'Missing uri' });
        return;
      }
      await ctx.getPlaybackRuntime('youtube').playback.addToQueue(uri);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });
}
