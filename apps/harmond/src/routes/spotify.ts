/**
 * routes/spotify.ts — Spotify browse, playback, and library routes
 *
 * Registers all /v1/spotify/* endpoints on the Express app.
 * Each route delegates to the SpotifyClient or SpotifyRuntime
 * via the shared DaemonContext.
 *
 * @module routes/spotify
 */

import type { Application, Request, Response } from 'express';
import type { DaemonContext } from '../daemon-context.js';
import { ProviderUnavailableError } from '../errors.js';
import {
  clampNumber,
  parseBodyString,
  parseBodyNumber,
  parseBodyBoolean,
  parseSearchTypes,
} from '../helpers.js';

/**
 * Extract the canonical resource id from a URI, URL, or plain id string.
 */
function extractSessionSourceId(value: string): string {
  if (
    value.startsWith('spotify:') ||
    value.startsWith('youtube:playlist:') ||
    value.startsWith('apple:playlist:')
  ) {
    return value.split(':').pop() || value;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value);
      const playlistId = url.searchParams.get('list');
      if (playlistId) {
        return playlistId;
      }
      const segments = url.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || value;
    } catch {
      return value;
    }
  }

  return value;
}

/**
 * Resolve Spotify recommendation seeds from explicit input first, then fall
 * back to the strongest personal listening signals the provider exposes.
 */
async function resolveRecommendationSeeds(
  ctx: DaemonContext,
  seed: string | undefined,
): Promise<string[]> {
  const explicitSeeds = seed
    ? seed
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => extractSessionSourceId(entry))
    : [];
  if (explicitSeeds.length > 0) {
    return explicitSeeds.slice(0, 5);
  }

  const provider = ctx.spotifyRuntime.provider;
  const candidates = [
    ...(await provider.getTopTracks({ limit: 1 })),
    ...(await provider.getRecentlyPlayed({ limit: 1 })),
    ...(await provider.getLibraryTracks({ limit: 1 })),
  ];
  const fallbackSeedIds = candidates
    .map((track) => track.id)
    .filter(
      (trackId, index, all) =>
        typeof trackId === 'string' &&
        trackId.length > 0 &&
        all.indexOf(trackId) === index,
    );
  if (fallbackSeedIds.length === 0) {
    throw new ProviderUnavailableError(
      'Spotify recommendations require a seed track or personal listening history.',
    );
  }
  return fallbackSeedIds.slice(0, 5);
}

export function registerSpotifyRoutes(app: Application, ctx: DaemonContext): void {
  // Search
  app.get('/v1/spotify/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q;
      if (typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Missing query (q)' });
        return;
      }
      const typeParam = typeof req.query.type === 'string' ? req.query.type : 'track';
      const types = parseSearchTypes(typeParam);
      const limit = clampNumber(req.query.limit, 1, 50);
      const offset = clampNumber(req.query.offset, 0, 10000);
      const result = await ctx.spotifyClient.search(query, types, { limit, offset });
      res.json(result);
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Playback token for the Web Playback SDK: lets an authenticated web
  // client register the browser as a Spotify Connect device ("Harmon
  // Player"). Bearer-gated like every /v1 route; returns the user's own
  // current access token.
  app.get('/v1/spotify/playback-token', async (_req: Request, res: Response) => {
    try {
      const accessToken = await ctx.spotifyAuth.getAccessToken();
      if (!accessToken) {
        res.status(503).json({ success: false, error: 'Spotify is not connected. Log in first.', code: 'PROVIDER_UNAVAILABLE' });
        return;
      }
      res.json({ accessToken });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Now playing
  app.get('/v1/spotify/now-playing', async (_req: Request, res: Response) => {
    try {
      res.json(await ctx.spotifyClient.getNowPlaying());
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Play
  app.post('/v1/spotify/play', async (req: Request, res: Response) => {
    try {
      const uri = parseBodyString(req.body?.uri);
      const contextUri = parseBodyString(req.body?.contextUri);
      await ctx.spotifyClient.play({ uri, contextUri });
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Pause
  app.post('/v1/spotify/pause', async (_req: Request, res: Response) => {
    try {
      await ctx.spotifyClient.pause();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Next
  app.post('/v1/spotify/next', async (_req: Request, res: Response) => {
    try {
      await ctx.spotifyClient.next();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Previous
  app.post('/v1/spotify/prev', async (_req: Request, res: Response) => {
    try {
      await ctx.spotifyClient.previous();
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Seek
  app.post('/v1/spotify/seek', async (req: Request, res: Response) => {
    try {
      const positionMs = parseBodyNumber(req.body?.positionMs);
      if (positionMs === undefined || positionMs < 0) {
        res.status(400).json({ success: false, error: 'Invalid positionMs' });
        return;
      }
      await ctx.spotifyClient.seek(positionMs);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Volume
  app.post('/v1/spotify/volume', async (req: Request, res: Response) => {
    try {
      const vol = parseBodyNumber(req.body?.volumePercent);
      if (vol === undefined || vol < 0 || vol > 100) {
        res.status(400).json({ success: false, error: 'Invalid volumePercent: must be 0-100' });
        return;
      }
      await ctx.spotifyClient.setVolume(vol);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Shuffle
  app.post('/v1/spotify/shuffle', async (req: Request, res: Response) => {
    try {
      const state = parseBodyBoolean(req.body?.state);
      if (state === undefined) {
        res.status(400).json({ success: false, error: 'Invalid state' });
        return;
      }
      await ctx.spotifyClient.setShuffle(state);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Repeat
  app.post('/v1/spotify/repeat', async (req: Request, res: Response) => {
    try {
      const state = parseBodyString(req.body?.state);
      if (state !== 'off' && state !== 'track' && state !== 'context') {
        res.status(400).json({ success: false, error: 'Invalid state: must be off|track|context' });
        return;
      }
      await ctx.spotifyClient.setRepeat(state);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Queue
  app.post('/v1/spotify/queue', async (req: Request, res: Response) => {
    try {
      const uri = parseBodyString(req.body?.uri);
      if (!uri) {
        res.status(400).json({ success: false, error: 'Missing uri' });
        return;
      }
      await ctx.spotifyClient.addToQueue(uri);
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Playlists
  app.get('/v1/spotify/playlists', async (req: Request, res: Response) => {
    try {
      res.json(await ctx.spotifyClient.getPlaylists({
        limit: clampNumber(req.query.limit, 1, 50),
        offset: clampNumber(req.query.offset, 0, 10000),
      }));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Playlist tracks
  app.get('/v1/spotify/playlists/:id/tracks', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!id || !/^[a-zA-Z0-9]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid playlist id' });
        return;
      }
      res.json(await ctx.spotifyClient.getPlaylistTracks(id, {
        limit: clampNumber(req.query.limit, 1, 100),
        offset: clampNumber(req.query.offset, 0, 10000),
      }));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Recently played
  app.get('/v1/spotify/history', async (req: Request, res: Response) => {
    try {
      const limit = clampNumber(req.query.limit, 1, 50);
      res.json(await ctx.spotifyClient.getRecentlyPlayed({ limit }));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Saved tracks
  app.get('/v1/spotify/library/tracks', async (req: Request, res: Response) => {
    try {
      res.json(await ctx.spotifyClient.getSavedTracks({
        limit: clampNumber(req.query.limit, 1, 50),
        offset: clampNumber(req.query.offset, 0, 10000),
      }));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Saved albums
  app.get('/v1/spotify/library/albums', async (req: Request, res: Response) => {
    try {
      res.json(await ctx.spotifyClient.getSavedAlbums({
        limit: clampNumber(req.query.limit, 1, 50),
        offset: clampNumber(req.query.offset, 0, 10000),
      }));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // Recommendations
  app.get('/v1/spotify/recommendations', async (req: Request, res: Response) => {
    try {
      const seedTrackIds = await resolveRecommendationSeeds(
        ctx,
        typeof req.query.seed === 'string' ? req.query.seed : undefined,
      );
      res.json(await ctx.spotifyRuntime.provider.getRecommendations({
        seedTrackIds,
        limit: clampNumber(req.query.limit, 1, 50),
      }));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });
}
