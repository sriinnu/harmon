/**
 * routes/smart.ts — Cross-provider smart search and play routes
 *
 * These endpoints search across all connected providers to find content
 * and route playback to the best available provider. When a provider
 * needs authentication, the response includes the auth URL so the
 * caller (CLI, web, AI assistant) can guide the user through auth.
 *
 * @module routes/smart
 */

import type { Application, Request, Response } from 'express';
import type { TrackInfo } from '@sriinnu/harmon-protocol';
import type { DaemonContext } from '../daemon-context.js';
import { parseBodyString, clampNumber } from '../helpers.js';

type ProviderName = 'spotify' | 'apple' | 'youtube';

interface ProviderSearchResult {
  provider: ProviderName;
  tracks: TrackInfo[];
}

export function registerSmartRoutes(app: Application, ctx: DaemonContext): void {

  /**
   * GET /v1/smart/search?q=<query>&limit=5
   *
   * Search across ALL connected providers in parallel.
   * Returns results grouped by provider with availability info.
   */
  app.get('/v1/smart/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q;
      if (typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Missing query (q)' });
        return;
      }

      const limit = clampNumber(req.query.limit, 1, 10) ?? 5;
      const results: ProviderSearchResult[] = [];
      const unavailable: Array<{ provider: string; reason: string; authUrl?: string }> = [];
      const providerErrors: Array<{ provider: string; error: string }> = [];

      const searchPromises: Array<Promise<void>> = [];

      // Spotify
      const spotifyStatus = await ctx.getSpotifyProviderStatus();
      if (spotifyStatus.connected) {
        searchPromises.push(
          ctx.spotifyRuntime.provider.search(query.trim(), limit)
            .then(tracks => {
              if (tracks.length > 0) {
                results.push({ provider: 'spotify', tracks });
              }
            })
            .catch((error) => {
              providerErrors.push({
                provider: 'spotify',
                error: error instanceof Error ? error.message : String(error),
              });
            })
        );
      } else {
        unavailable.push({
          provider: 'spotify',
          reason: 'Not authenticated',
        });
      }

      // Apple Music
      if (ctx.appleCatalogEnabled && ctx.appleMusicClient) {
        searchPromises.push(
          (async () => {
            try {
              const provider = ctx.getReadProvider('apple');
              const tracks = await provider.search(query.trim(), limit);
              if (tracks.length > 0) {
                results.push({ provider: 'apple', tracks });
              }
            } catch (error) {
              providerErrors.push({
                provider: 'apple',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })()
        );
      } else {
        unavailable.push({
          provider: 'apple',
          reason: 'Not configured',
        });
      }

      // YouTube Music
      if (ctx.youtubeMusicClient) {
        searchPromises.push(
          (async () => {
            try {
              const provider = ctx.getReadProvider('youtube');
              const tracks = await provider.search(query.trim(), limit);
              if (tracks.length > 0) {
                results.push({ provider: 'youtube', tracks });
              }
            } catch (error) {
              providerErrors.push({
                provider: 'youtube',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })()
        );
      } else if (ctx.youtubeAuth) {
        // YouTube configured but needs OAuth
        unavailable.push({
          provider: 'youtube',
          reason: 'Authentication required',
          authUrl: '/v1/auth/youtube/login',
        });
      } else {
        unavailable.push({ provider: 'youtube', reason: 'Not configured' });
      }

      await Promise.all(searchPromises);

      res.json({
        success: true,
        query: query.trim(),
        results,
        unavailable,
        providerErrors: providerErrors.length > 0 ? providerErrors : undefined,
        connectedProviders: results.map(r => r.provider),
      });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  /**
   * POST /v1/smart/play
   * Body: { query: "song name", provider?: "spotify"|"apple"|"youtube", uri?: "..." }
   *
   * If provider specified: play on that provider (auto-auth if needed).
   * If no provider: search all connected providers, play on first match.
   */
  app.post('/v1/smart/play', async (req: Request, res: Response) => {
    try {
      const query = parseBodyString(req.body?.query);
      const uri = parseBodyString(req.body?.uri);
      const preferredProvider = parseBodyString(req.body?.provider) as ProviderName | undefined;

      if (!query && !uri) {
        res.status(400).json({ success: false, error: 'Provide a query or uri' });
        return;
      }

      // If URI provided with a known provider prefix, route directly
      if (uri) {
        const provider = detectProviderFromUri(uri) ?? preferredProvider ?? 'spotify';
        const playResult = await playOnProvider(ctx, provider, { uri });
        res.json(playResult);
        return;
      }

      // Search for the track across providers
      const providers = preferredProvider
        ? [preferredProvider]
        : getConnectedProviders(ctx);

      if (providers.length === 0) {
        res.status(503).json({
          success: false,
          error: 'No music providers are connected. Authenticate at least one provider.',
          authHints: getAuthHints(ctx),
        });
        return;
      }

      // Search in parallel across all target providers
      const errors: Array<{ provider: string; error: string }> = [];
      const searchResults = await searchProviders(ctx, query!, providers, 3, errors);

      if (searchResults.length === 0) {
        res.status(404).json({
          success: false,
          error: `No results found for "${query}" on ${providers.join(', ')}`,
          providerErrors: errors.length > 0 ? errors : undefined,
        });
        return;
      }

      // Play the best match (first result from first provider that returned results)
      const best = searchResults[0];
      const playResult = await playOnProvider(ctx, best.provider, {
        uri: best.track.uri,
        trackId: best.track.id,
      });

      res.json({
        ...playResult,
        track: best.track,
        provider: best.provider,
        providerErrors: errors.length > 0 ? errors : undefined,
        searchedProviders: providers,
        alternateProviders: searchResults
          .filter(r => r.provider !== best.provider)
          .map(r => ({ provider: r.provider, track: r.track })),
      });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });
}

// ── Helper functions ──────────────────────────────────────────────────────────

function getConnectedProviders(ctx: DaemonContext): ProviderName[] {
  const connected: ProviderName[] = [];
  // Spotify runtime is always initialized
  if (ctx.spotifyRuntime) connected.push('spotify');
  if (ctx.appleRuntime) connected.push('apple');
  if (ctx.youtubeRuntime) connected.push('youtube');
  return connected;
}

function getAuthHints(ctx: DaemonContext): Array<{ provider: string; action: string; endpoint: string }> {
  const hints: Array<{ provider: string; action: string; endpoint: string }> = [];
  hints.push({ provider: 'spotify', action: 'POST to get OAuth URL', endpoint: '/v1/auth/spotify/login' });
  if (ctx.youtubeAuth) {
    hints.push({ provider: 'youtube', action: 'POST to get OAuth URL', endpoint: '/v1/auth/youtube/login' });
  }
  if (ctx.appleAuth) {
    hints.push({ provider: 'apple', action: 'POST user token from MusicKit JS', endpoint: '/v1/auth/apple/set-user-token' });
  }
  return hints;
}

function detectProviderFromUri(uri: string): ProviderName | undefined {
  if (uri.startsWith('spotify:') || uri.includes('open.spotify.com')) return 'spotify';
  if (uri.includes('music.apple.com')) return 'apple';
  if (uri.includes('youtube.com') || uri.includes('youtu.be') || uri.includes('music.youtube.com')) return 'youtube';
  return undefined;
}

async function searchProviders(
  ctx: DaemonContext,
  query: string,
  providers: ProviderName[],
  limit: number,
  errors: Array<{ provider: string; error: string }> = [],
): Promise<Array<{ provider: ProviderName; track: TrackInfo }>> {
  const results: Array<{ provider: ProviderName; track: TrackInfo }> = [];

  const promises = providers.map(async (provider) => {
    try {
      const readProvider = ctx.getReadProvider(provider);
      const tracks = await readProvider.search(query, limit);
      if (tracks.length > 0) {
        results.push({ provider, track: tracks[0] });
      }
    } catch (error) {
      errors.push({
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await Promise.all(promises);
  return results;
}

async function playOnProvider(
  ctx: DaemonContext,
  provider: ProviderName,
  options: { uri?: string; trackId?: string },
): Promise<{ success: boolean; provider: string; needsAuth?: boolean; authUrl?: string; authEndpoint?: string }> {
  const runtime = ctx.getRuntime(provider);

  if (!runtime) {
    // Provider not ready — return auth hint
    const authHint = getProviderAuthHint(ctx, provider);
    return {
      success: false,
      provider,
      needsAuth: true,
      ...authHint,
    };
  }

  await runtime.playback.play(options.uri ? { uri: options.uri } : undefined);
  return { success: true, provider };
}

function getProviderAuthHint(
  _ctx: DaemonContext,
  provider: ProviderName,
): { authUrl?: string; authEndpoint: string } {
  if (provider === 'spotify') {
    return { authEndpoint: '/v1/auth/spotify/login' };
  }
  if (provider === 'apple') {
    return { authEndpoint: '/v1/auth/apple/set-user-token' };
  }
  if (provider === 'youtube') {
    return { authEndpoint: '/v1/auth/youtube/login' };
  }
  return { authEndpoint: `/v1/auth/${provider}/login` };
}
