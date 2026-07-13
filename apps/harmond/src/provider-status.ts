/**
 * provider-status.ts — Provider status probes
 *
 * Gathers the read-only status snapshot for each music provider
 * (Spotify, Apple Music, YouTube Music).  These functions were
 * extracted from Harmond so the class does not own status-formatting
 * logic directly.
 *
 * Every function receives only the fields it needs from the daemon
 * context so it stays independently testable.
 *
 * @module provider-status
 */

import type { SpotifyAuth } from '@sriinnu/harmon-spotify';
import type { ProviderRuntime, BrowserLaunchSupport } from './provider-runtime.js';
import type { AppleRemoteBridge } from './apple-remote.js';
import type { ProviderStatusDetails } from './daemon-context.js';

// ============================================================================
// Spotify
// ============================================================================

/** Dependencies needed to compute Spotify status. */
export interface SpotifyStatusDeps {
  spotifyAuth: SpotifyAuth;
  spotifyTokenLoadFailure: boolean;
  spotifyCookieLoadFailure: boolean;
}

/**
 * Read the richer auth mode when the Spotify package exposes it,
 * keeping an honest fallback for older type surfaces.
 */
export function getSpotifyAuthMode(auth: SpotifyAuth): 'none' | 'oauth' | 'cookies' {
  const extended = auth as SpotifyAuth & {
    getAuthMode?: () => 'none' | 'oauth' | 'cookies';
  };
  return extended.getAuthMode?.() ?? (extended.isConnected() ? 'oauth' : 'none');
}

/**
 * Probe Spotify provider status.  Async because it may refresh tokens.
 */
export async function getSpotifyProviderStatus(
  deps: SpotifyStatusDeps,
): Promise<ProviderStatusDetails> {
  const authMode = getSpotifyAuthMode(deps.spotifyAuth);
  const loadFailure = deps.spotifyTokenLoadFailure || deps.spotifyCookieLoadFailure;
  const capabilities = {
    cookieImport: true,
    deviceTransfer: true,
    library: true,
    playback: true,
    queue: true,
    search: true,
    sessionControl: true,
  };

  if (authMode === 'none') {
    return {
      connected: false,
      name: 'Spotify',
      status: loadFailure ? 'degraded' : 'missing',
      auth: authMode,
      playbackMode: 'native',
      capabilities,
    };
  }

  try {
    const accessToken = await deps.spotifyAuth.getAccessToken();
    const isReady = typeof accessToken === 'string' && accessToken.length > 0;

    return {
      connected: isReady,
      name: 'Spotify',
      status: isReady ? 'ready' : 'degraded',
      auth: authMode,
      playbackMode: 'native',
      capabilities,
    };
  } catch {
    return {
      connected: false,
      name: 'Spotify',
      status: 'degraded',
      auth: authMode,
      playbackMode: 'native',
      capabilities,
    };
  }
}

// ============================================================================
// Apple Music
// ============================================================================

/** Dependencies needed to compute Apple Music status. */
export interface AppleStatusDeps {
  appleMusicClient?: unknown | undefined;
  appleRuntime?: ProviderRuntime | undefined;
  appleRemoteBridge?: AppleRemoteBridge | undefined;
  appleCatalogEnabled: boolean;
  appleLibraryEnabled: boolean;
  appleLocalPlaybackEnabled: boolean;
}

/** Get Apple Music provider status (sync). */
export function getAppleProviderStatus(deps: AppleStatusDeps): ProviderStatusDetails {
  const playbackRuntime = deps.appleRuntime;
  const remoteBridgeStatus = deps.appleRemoteBridge?.getStatus();
  const localPlaybackReady =
    deps.appleLocalPlaybackEnabled &&
    Boolean(deps.appleMusicClient);
  const remotePlaybackReady = Boolean(remoteBridgeStatus?.connected);
  const playbackReady = localPlaybackReady || remotePlaybackReady;
  const auth =
    deps.appleLibraryEnabled
      ? 'developer-and-user-token'
      : deps.appleCatalogEnabled
        ? 'developer-token'
        : 'none';
  const hasAppleCapability =
    deps.appleCatalogEnabled ||
    deps.appleLibraryEnabled ||
    !!playbackRuntime ||
    !!deps.appleRemoteBridge;
  const playbackMode =
    remotePlaybackReady
      ? 'remote'
      : localPlaybackReady
        ? 'applescript'
        : deps.appleRemoteBridge
          ? 'remote'
          : playbackRuntime?.playbackMode;
  const ready = playbackReady;

  return {
    connected: hasAppleCapability,
    name: 'Apple Music',
    status: !hasAppleCapability ? 'missing' : ready ? 'ready' : 'configured',
    auth,
    playbackMode,
    capabilities: {
      catalog: deps.appleCatalogEnabled,
      companion: Boolean(remoteBridgeStatus?.connected),
      library: deps.appleLibraryEnabled,
      next: playbackReady,
      pause: playbackReady,
      previous: playbackReady,
      playback: playbackReady,
      recommendations: deps.appleCatalogEnabled,
      recentPlays: deps.appleCatalogEnabled,
      search: deps.appleCatalogEnabled,
      sessionControl: playbackReady && (deps.appleCatalogEnabled || deps.appleLibraryEnabled),
      topTracks: deps.appleCatalogEnabled,
    },
  };
}

// ============================================================================
// YouTube Music
// ============================================================================

/** Dependencies needed to compute YouTube Music status. */
export interface YouTubeStatusDeps {
  youtubeMusicClient?: unknown | undefined;
  youtubeRuntime?: ProviderRuntime | undefined;
  youtubeBrowserSupport: BrowserLaunchSupport;
  youtubeAccessToken?: string | undefined;
  youtubeApiKey?: string | undefined;
  youtubeAuth?: { getAuthMode(): 'none' | 'oauth' | 'api-key' } | undefined;
}

/** Get YouTube Music provider status (sync). */
export function getYouTubeProviderStatus(deps: YouTubeStatusDeps): ProviderStatusDetails {
  const configured = !!deps.youtubeMusicClient;
  const runtime = !!deps.youtubeRuntime && deps.youtubeBrowserSupport.available;
  // OAuth completed through the daemon counts as user auth even without a
  // static env token — the client resolves tokens through youtubeAuth.
  const hasUserAuth = Boolean(deps.youtubeAccessToken) || deps.youtubeAuth?.getAuthMode() === 'oauth';
  const auth: ProviderStatusDetails['auth'] =
    hasUserAuth ? 'oauth' : deps.youtubeApiKey ? 'api-key' : 'none';

  return {
    connected: configured,
    name: 'YouTube Music',
    status: !configured ? 'missing' : runtime ? 'ready' : 'configured',
    auth,
    playbackMode: runtime ? 'browser-handoff' : undefined,
    capabilities: {
      library: hasUserAuth,
      playback: runtime,
      pause: false,
      playlists: hasUserAuth,
      previous: runtime,
      queue: runtime,
      recommendations: configured,
      search: configured,
      sessionControl: runtime && configured,
      songLookup: configured,
      topTracks: configured,
      recentPlays: configured,
    },
  };
}
