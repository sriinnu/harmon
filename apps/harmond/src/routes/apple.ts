/**
 * routes/apple.ts — Apple Music browse, playback, library, and remote routes
 *
 * Registers all /v1/apple/* endpoints including the companion remote
 * protocol for iOS device playback bridging.
 *
 * @module routes/apple
 */

import type { Application, Request, Response } from 'express';
import type { DaemonContext } from '../daemon-context.js';
import { TrackInfo as TrackInfoSchema } from '@sriinnu/harmon-protocol';
import { ProviderUnavailableError } from '../errors.js';
import {
  clampNumber,
  parseBodyString,
  parseAppleSearchTypes,
  parseAppleRemotePlaybackState,
} from '../helpers.js';

export function registerAppleRoutes(app: Application, ctx: DaemonContext): void {
  // ── Catalog search ──────────────────────────────────────────────────
  app.get('/v1/apple/search', async (req: Request, res: Response) => {
    try {
      const client = ctx.getAppleMusicClient();
      const query = req.query.q;
      if (typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ success: false, error: 'Missing query (q)' });
        return;
      }
      const types = parseAppleSearchTypes(
        typeof req.query.type === 'string' ? req.query.type : 'songs',
      );
      res.json(
        await client.search(query, types, {
          limit: clampNumber(req.query.limit, 1, 25),
          offset: clampNumber(req.query.offset, 0, 10000),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Single-resource lookups ─────────────────────────────────────────
  app.get('/v1/apple/songs/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid id' });
        return;
      }
      res.json(await ctx.getAppleMusicClient().getSong(id));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/apple/albums/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid id' });
        return;
      }
      res.json(await ctx.getAppleMusicClient().getAlbum(id));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/apple/artists/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid id' });
        return;
      }
      res.json(await ctx.getAppleMusicClient().getArtist(id));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/apple/playlists/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid id' });
        return;
      }
      res.json(await ctx.getAppleMusicClient().getPlaylist(id));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/apple/playlists/:id/tracks', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid id' });
        return;
      }
      res.json(
        await ctx.getAppleMusicClient().getPlaylistTracks(id, {
          limit: clampNumber(req.query.limit, 1, 100),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Library endpoints ───────────────────────────────────────────────
  app.get('/v1/apple/library/songs', async (req: Request, res: Response) => {
    try {
      res.json(
        await ctx.getAppleMusicClient().getLibrarySongs({
          limit: clampNumber(req.query.limit, 1, 100),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/apple/library/albums', async (req: Request, res: Response) => {
    try {
      res.json(
        await ctx.getAppleMusicClient().getLibraryAlbums({
          limit: clampNumber(req.query.limit, 1, 100),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/apple/library/playlists', async (req: Request, res: Response) => {
    try {
      res.json(
        await ctx.getAppleMusicClient().getLibraryPlaylists({
          limit: clampNumber(req.query.limit, 1, 100),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── History ─────────────────────────────────────────────────────────
  app.get('/v1/apple/history', async (req: Request, res: Response) => {
    try {
      res.json(
        await ctx.getReadProvider('apple').getRecentlyPlayed({
          limit: clampNumber(req.query.limit, 1, 100),
        }),
      );
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Recommendations ─────────────────────────────────────────────────
  app.get('/v1/apple/recommendations', async (req: Request, res: Response) => {
    try {
      if (!ctx.appleCatalogEnabled) {
        throw new ProviderUnavailableError(
          'Apple Music is not configured on this daemon instance.',
        );
      }
      const provider =
        ctx.appleRuntime?.provider ?? ctx.createAppleMusicProviderFallback();
      const seedTrackIds =
        typeof req.query.seed === 'string'
          ? req.query.seed
              .split(',')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
          : [];
      if (seedTrackIds.length === 0 && !ctx.appleLibraryEnabled) {
        throw new ProviderUnavailableError(
          'Apple Music recommendations without an explicit seed require APPLE_MUSIC_USER_TOKEN.',
        );
      }
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
  app.get('/v1/apple/now-playing', async (_req: Request, res: Response) => {
    try {
      const playback = ctx.getPlaybackRuntime('apple').playback;
      res.json(await playback.getNowPlaying());
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Playback controls ──────────────────────────────────────────────
  app.post('/v1/apple/play', async (req: Request, res: Response) => {
    try {
      const url = parseBodyString(req.body?.url);
      await ctx.assertProviderReady('apple', 'starting Apple Music playback');
      const playback = ctx.getPlaybackRuntime('apple').playback;
      await playback.play(url ? { uri: url } : undefined);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/apple/pause', async (_req: Request, res: Response) => {
    try {
      await ctx.assertProviderReady('apple', 'pausing Apple Music playback');
      await ctx.getPlaybackRuntime('apple').playback.pause();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/apple/next', async (_req: Request, res: Response) => {
    try {
      await ctx.assertProviderReady('apple', 'skipping Apple Music playback');
      await ctx.getPlaybackRuntime('apple').playback.next();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/apple/prev', async (_req: Request, res: Response) => {
    try {
      await ctx.assertProviderReady('apple', 'rewinding Apple Music playback');
      await ctx.getPlaybackRuntime('apple').playback.previous();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Apple Remote (companion bridge) ────────────────────────────────
  app.get('/v1/apple/remote/status', async (_req: Request, res: Response) => {
    try {
      res.json(ctx.getAppleRemoteBridge().getStatus());
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/apple/remote/connect', async (req: Request, res: Response) => {
    try {
      const deviceId = parseBodyString(req.body?.deviceId);
      if (!deviceId) {
        res.status(400).json({ success: false, error: 'Missing deviceId' });
        return;
      }
      res.json({
        success: true,
        status: ctx.getAppleRemoteBridge().registerCompanion({
          appVersion: parseBodyString(req.body?.appVersion),
          deviceId,
          name: parseBodyString(req.body?.name),
          platform: parseBodyString(req.body?.platform),
        }),
      });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.get('/v1/apple/remote/commands', async (req: Request, res: Response) => {
    try {
      const deviceId = parseBodyString(req.query.deviceId);
      if (!deviceId) {
        res.status(400).json({ success: false, error: 'Missing deviceId' });
        return;
      }
      res.json({
        commands: ctx.getAppleRemoteBridge().listCommands(deviceId),
        success: true,
      });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/apple/remote/commands/:id/ack', async (req: Request, res: Response) => {
    try {
      const deviceId = parseBodyString(req.body?.deviceId);
      if (!deviceId) {
        res.status(400).json({ success: false, error: 'Missing deviceId' });
        return;
      }
      ctx.getAppleRemoteBridge().acknowledgeCommand(deviceId, String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/apple/remote/state', async (req: Request, res: Response) => {
    try {
      const deviceId = parseBodyString(req.body?.deviceId);
      if (!deviceId) {
        res.status(400).json({ success: false, error: 'Missing deviceId' });
        return;
      }
      const playbackState = parseAppleRemotePlaybackState(req.body?.playbackState);
      const currentTrackResult =
        req.body?.currentTrack === undefined
          ? { success: true as const, data: undefined }
          : req.body?.currentTrack === null
            ? { success: true as const, data: null }
            : TrackInfoSchema.safeParse(req.body.currentTrack);
      if (!currentTrackResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid currentTrack',
          issues: currentTrackResult.error.issues,
        });
        return;
      }
      if (
        currentTrackResult.data &&
        currentTrackResult.data.provider &&
        currentTrackResult.data.provider !== 'apple'
      ) {
        res.status(400).json({
          success: false,
          error: 'Apple remote currentTrack must use provider apple',
        });
        return;
      }
      res.json({
        success: true,
        status: ctx.getAppleRemoteBridge().updateState({
          ackCommandId: parseBodyString(req.body?.ackCommandId),
          currentTrack:
            currentTrackResult.data && currentTrackResult.data !== null
              ? {
                  ...currentTrackResult.data,
                  playbackTruth: undefined,
                  provider: 'apple',
                }
              : currentTrackResult.data,
          deviceId,
          playbackState,
        }),
      });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });
}
