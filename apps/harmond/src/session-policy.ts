/**
 * session-policy.ts — Session policy validation, normalization, and probing
 *
 * Contains the logic that validates whether a session policy is compatible
 * with a given provider, fills in provider-aware source defaults, probes
 * the provider to confirm readiness, and validates imported Spotify cookies.
 *
 * Extracted from Harmond so the orchestrator only delegates to these
 * functions rather than owning them inline.
 *
 * @module session-policy
 */

import type { MusicProvider } from '@sriinnu/harmon-core';
import type { SessionPolicy, MusicProviderName } from '@sriinnu/harmon-protocol';
import type { SpotifyCookieRecord } from '@sriinnu/harmon-spotify';
import { createSpotifyAuth } from '@sriinnu/harmon-spotify';
import { ProviderUnavailableError, ValidationError } from './errors.js';
import type { ProviderRuntime, BrowserLaunchSupport } from './provider-runtime.js';
import type { AppleRemoteBridge } from './apple-remote.js';
import type { ProviderStatusDetails } from './daemon-context.js';

// -- Context interfaces (only the fields each function needs) ----------------

/** Dependencies for session-policy validation and normalization. */
export interface SessionPolicyDeps {
  appleLibraryEnabled: boolean;
  youtubeAccessToken?: string | undefined;
  youtubeAuth?: { getAuthMode(): 'none' | 'oauth' | 'api-key' } | undefined;
}

/** True when YouTube has user-level auth (static token or completed OAuth). */
function hasYouTubeUserAuth(deps: SessionPolicyDeps): boolean {
  return Boolean(deps.youtubeAccessToken) || deps.youtubeAuth?.getAuthMode() === 'oauth';
}

/** Dependencies for session-provider probing. */
export interface SessionProbeDeps {
  getRuntime(provider: MusicProviderName): ProviderRuntime | null;
  getReadProvider(provider: MusicProviderName): MusicProvider;
  getProviderPlaybackUnavailableMessage(provider: Extract<MusicProviderName, 'apple' | 'youtube'>): string;
}

/** Dependencies for generating provider-unavailable messages. */
export interface ProviderMessageDeps {
  appleRemoteBridge?: AppleRemoteBridge | undefined;
  youtubeBrowserSupport: { available: boolean; reason?: string };
}

/** Dependencies for assertProviderReady. */
export interface AssertProviderReadyDeps extends SessionProbeDeps {
  getSpotifyProviderStatus(): Promise<ProviderStatusDetails>;
  getAppleProviderStatus(): ProviderStatusDetails;
  getYouTubeProviderStatus(): ProviderStatusDetails;
  youtubeBrowserSupport: BrowserLaunchSupport;
}

/** Dependencies for Spotify cookie validation. */
export interface CookieValidationDeps {
  spotifyRedirectUri: string;
}

// -- Session Policy Validation -----------------------------------------------

/**
 * Reject provider/policy combinations the current runtime cannot honor,
 * rather than silently degrading them into empty sessions.
 */
export function validateSessionPolicyForProvider(
  policy: SessionPolicy,
  deps: SessionPolicyDeps,
): void {
  const provider = policy.provider ?? 'spotify';
  const sources = policy.sources ?? {};

  if (sources.seedArtists && sources.seedArtists.length > 0) {
    throw new ValidationError('Session policy source seedArtists is not implemented in this build.');
  }

  if (provider === 'spotify') {
    return;
  }

  if (hasFeatureDependentPolicy(policy)) {
    const providerLabel = provider === 'apple' ? 'Apple Music' : 'YouTube Music';
    throw new ValidationError(
      `${providerLabel} sessions do not support audio-feature constraints (hard.energy, hard.tempo, soft.weights, etc.) because ${providerLabel} does not expose per-track audio features. Remove feature-dependent constraints or switch to Spotify.`,
    );
  }

  if (sources.topTracks) {
    const providerLabel = provider === 'apple' ? 'Apple Music' : 'YouTube Music';
    throw new ValidationError(
      `${providerLabel} does not support top tracks as a session source. Remove sources.topTracks or switch to Spotify.`,
    );
  }

  if (provider === 'apple') {
    if (sources.likedTracks && !deps.appleLibraryEnabled) {
      throw new ProviderUnavailableError(
        'Apple Music likedTracks sessions require APPLE_MUSIC_USER_TOKEN to enable the library surface.',
      );
    }

    return;
  }

  if (sources.likedTracks && !hasYouTubeUserAuth(deps)) {
    throw new ProviderUnavailableError(
      'YouTube Music likedTracks require OAuth login (POST /v1/auth/youtube/login) or YOUTUBE_MUSIC_ACCESS_TOKEN.',
    );
  }
}

/**
 * Return true when the policy references audio-feature hard constraints
 * or soft weights that only Spotify can honour.
 */
export function hasFeatureDependentPolicy(policy: SessionPolicy): boolean {
  const hard = policy.hard;
  const weights = policy.soft?.weights;

  return Boolean(
    hard?.noVocals ||
    hard?.tempo ||
    hard?.energy ||
    hard?.instrumentalnessMin !== undefined ||
    hard?.explicit === 'require' ||
    typeof weights?.energy === 'number' ||
    typeof weights?.instrumentalness === 'number' ||
    typeof weights?.speechiness === 'number' ||
    typeof weights?.valence === 'number' ||
    typeof weights?.acousticness === 'number' ||
    typeof weights?.tempo === 'number',
  );
}

// -- Session Policy Normalization --------------------------------------------

/**
 * Fill in provider-aware source defaults so API callers do not need to know
 * each provider's partial surface to get a working session.
 */
export function normalizeSessionPolicy(
  policy: SessionPolicy,
  deps: SessionPolicyDeps,
): SessionPolicy {
  const provider = policy.provider ?? 'spotify';
  const sources = policy.sources && Object.keys(policy.sources).length > 0
    ? policy.sources
    : defaultSourcesForProvider(provider, policy.mode, deps);

  return {
    ...policy,
    provider,
    sources,
  };
}

/**
 * Provide sensible default sources for a given provider and session mode.
 */
export function defaultSourcesForProvider(
  provider: MusicProviderName,
  mode: SessionPolicy['mode'],
  deps: SessionPolicyDeps,
): NonNullable<SessionPolicy['sources']> {
  const modeQuery = modeSearchQuery(mode);

  if (provider === 'apple') {
    return {
      likedTracks: deps.appleLibraryEnabled,
      recentPlays: deps.appleLibraryEnabled,
      searchQueries: [modeQuery],
    };
  }

  if (provider === 'youtube') {
    return {
      likedTracks: hasYouTubeUserAuth(deps),
      searchQueries: [modeQuery],
    };
  }

  return {
    likedTracks: true,
    topTracks: true,
    recentPlays: true,
    discovery: { enabled: true, ratio: 0.15 },
  };
}

/**
 * Map a session mode to a default search query for providers that
 * rely on search as a track source.
 */
export function modeSearchQuery(mode?: SessionPolicy['mode']): string {
  switch (mode) {
    case 'relax':
      return 'calm instrumental music';
    case 'energize':
      return 'high energy workout music';
    case 'meditate':
      return 'meditation ambient music';
    case 'workout':
      return 'workout mix';
    case 'custom':
      return 'focus music';
    case 'focus':
    default:
      return 'focus instrumental music';
  }
}

// -- Session Provider Probing ------------------------------------------------

/**
 * Probe a non-Spotify provider by issuing lightweight API calls against
 * each configured session source to confirm the provider is reachable.
 */
export async function probeSessionProvider(
  provider: MusicProviderName,
  policy: SessionPolicy,
  deps: SessionProbeDeps,
): Promise<void> {
  const sources = policy.sources ?? {};
  const providerRuntime = deps.getRuntime(provider);
  if (!providerRuntime) {
    throw new ProviderUnavailableError(
      deps.getProviderPlaybackUnavailableMessage(provider as Extract<MusicProviderName, 'apple' | 'youtube'>),
    );
  }
  const musicProvider = deps.getReadProvider(provider);

  const probes: Array<Promise<unknown>> = [];

  if (sources.seedPlaylists?.length) {
    probes.push(musicProvider.getPlaylistTracks(
      extractSessionSourceId(sources.seedPlaylists[0]),
      { limit: 1 },
    ));
  }
  if (sources.likedTracks) {
    probes.push(musicProvider.getLibraryTracks({ limit: 1 }));
  }
  if (sources.topTracks) {
    probes.push(musicProvider.getTopTracks({ limit: 1 }));
  }
  if (sources.recentPlays) {
    probes.push(musicProvider.getRecentlyPlayed({ limit: 1 }));
  }

  const query = sources.searchQueries?.find((value) => typeof value === 'string' && value.trim().length > 0)
    ?? (probes.length === 0 ? modeSearchQuery(policy.mode) : undefined);
  if (query) {
    probes.push(musicProvider.search(query, 1));
  }

  if (probes.length === 0) {
    throw new ValidationError(`No supported session sources were configured for ${provider}.`);
  }

  // All probes are already in flight; awaiting them together means a second
  // failure can't become an unhandled rejection (which kills the process)
  // while the first one is being thrown.
  await Promise.all(probes);
}

/**
 * Extract the provider-native ID from a URI, URL, or bare ID string.
 */
export function extractSessionSourceId(value: string): string {
  if (value.startsWith('spotify:') || value.startsWith('youtube:playlist:') || value.startsWith('apple:playlist:')) {
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

// -- Provider Pre-flight Check -----------------------------------------------

/**
 * Pre-flight check that a provider is ready for an operation.
 * Probes auth state and, when a session policy is provided, validates
 * that the provider can satisfy the requested source configuration.
 */
export async function assertProviderReady(
  provider: MusicProviderName,
  operation: string,
  deps: AssertProviderReadyDeps,
  policy?: SessionPolicy,
): Promise<void> {
  if (provider === 'spotify') {
    const spotify = await deps.getSpotifyProviderStatus();
    if (spotify.connected) {
      return;
    }

    const message =
      spotify.auth === 'none'
        ? `Spotify is not connected. Complete authentication before ${operation}.`
        : `Spotify is not ready. Refresh authentication before ${operation}.`;
    throw new ProviderUnavailableError(message);
  }

  if (provider === 'apple') {
    const apple = deps.getAppleProviderStatus();
    if (policy) {
      if (apple.capabilities?.sessionControl) {
        await probeSessionProvider(provider, policy, deps);
        return;
      }
    } else if (apple.capabilities?.playback) {
      return;
    }
    throw new ProviderUnavailableError(`Apple Music is not ready. Complete setup before ${operation}.`);
  }

  const youtube = deps.getYouTubeProviderStatus();
  if (policy) {
    if (youtube.capabilities?.sessionControl) {
      await probeSessionProvider(provider, policy, deps);
      return;
    }
  } else if (youtube.capabilities?.playback) {
    return;
  }

  throw new ProviderUnavailableError(
    deps.youtubeBrowserSupport.available
      ? `YouTube Music is not ready. Complete setup before ${operation}.`
      : `${deps.youtubeBrowserSupport.reason ?? 'Browser handoff is not available on this host.'} Complete setup before ${operation}.`,
  );
}

// -- Provider Playback Unavailable Messages ----------------------------------

/**
 * Keep playback-unavailable errors explicit about the missing local runtime.
 */
export function getProviderPlaybackUnavailableMessage(
  provider: Extract<MusicProviderName, 'apple' | 'youtube'>,
  deps: ProviderMessageDeps,
): string {
  if (provider === 'apple') {
    if (deps.appleRemoteBridge) {
      return deps.appleRemoteBridge.isConnected()
        ? 'Apple Music remote playback is not available on this daemon instance.'
        : 'Apple Music remote playback is configured, but no iOS companion is connected.';
    }
    return 'Apple Music playback is not available on this daemon instance.';
  }

  return deps.youtubeBrowserSupport.reason
    ? `YouTube Music playback is not available on this daemon instance: ${deps.youtubeBrowserSupport.reason}`
    : 'YouTube Music playback is not available on this daemon instance.';
}

// -- Spotify Cookie Validation -----------------------------------------------

/**
 * Validate imported Spotify cookies against the Spotify API before persisting
 * them so invalid browser exports cannot wipe a working daemon auth state.
 */
export async function validateImportedSpotifyCookies(
  cookies: SpotifyCookieRecord[],
  deps: CookieValidationDeps,
): Promise<void> {
  const probeAuth = createSpotifyAuth({
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: deps.spotifyRedirectUri,
  });

  await probeAuth.setCookies(cookies);

  try {
    const accessToken = await probeAuth.getAccessToken();
    if (!accessToken) {
      throw new ValidationError('Imported Spotify cookies did not produce an access token.');
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new ValidationError(
      'Imported Spotify cookies were rejected by Spotify. Export a fresh spotify.com session and try again.',
    );
  }
}
