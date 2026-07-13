/**
 * daemon-context.ts — Shared context interface for daemon route modules
 *
 * Every route module receives a DaemonContext instead of reaching into the
 * Harmond class directly. This keeps route files decoupled from the daemon's
 * internal wiring and makes each module independently testable.
 *
 * @module daemon-context
 */

import type { Response } from 'express';
import type { HarmonStore } from '@sriinnu/harmon-store';
import type { SessionEngine, MusicProvider } from '@sriinnu/harmon-core';
import type { Logger } from '@sriinnu/harmon-logger';
import type { Encryptor } from '@sriinnu/harmon-crypto';
import type {
  SpotifyAuth,
  SpotifyClient,
  SpotifyCookieRecord,
} from '@sriinnu/harmon-spotify';
import type { AppleMusicClient } from '@sriinnu/harmon-apple';
import type { YouTubeMusicClient } from '@sriinnu/harmon-youtube';
import type {
  MusicProviderName,
  SessionPolicy,
  Event,
} from '@sriinnu/harmon-protocol';
import type {
  BrowserLaunchSupport,
  ProviderRuntime,
} from './provider-runtime.js';
import type { AppleRemoteBridge } from './apple-remote.js';
import type { YouTubeAuth } from './youtube-auth.js';
import type { AppleAuth } from './apple-auth.js';

// ============================================================================
// Provider status shape returned by getXxxProviderStatus() methods
// ============================================================================

export interface ProviderStatusDetails {
  connected: boolean;
  name?: string;
  status?: 'missing' | 'configured' | 'ready' | 'degraded';
  auth?: 'none' | 'oauth' | 'cookies' | 'api-key' | 'developer-token' | 'developer-and-user-token';
  playbackMode?: 'native' | 'applescript' | 'browser-handoff' | 'remote';
  capabilities?: Record<string, boolean>;
}

// ============================================================================
// DaemonContext — the route module contract
// ============================================================================

/**
 * Shared context that route modules use to access daemon services.
 *
 * Harmond implements this interface and passes `this` to each
 * `register*Routes(app, ctx)` call during startup.
 */
export interface DaemonContext {
  /** Structured logger for the daemon process. */
  readonly logger: Logger;

  /** SQLite-backed persistence (journal, sessions, events, settings). */
  readonly store: HarmonStore;

  /** Optional AES-256-GCM encryptor for credential storage. */
  readonly encryptor?: Encryptor;

  // -- Spotify ----------------------------------------------------------
  readonly spotifyAuth: SpotifyAuth;
  readonly spotifyClient: SpotifyClient;
  readonly spotifyRuntime: ProviderRuntime;
  readonly spotifyRedirectUri: string;
  spotifyTokenLoadFailure: boolean;
  spotifyCookieLoadFailure: boolean;

  // -- Apple Music ------------------------------------------------------
  readonly appleMusicClient?: AppleMusicClient;
  readonly appleRuntime?: ProviderRuntime;
  readonly appleRemoteBridge?: AppleRemoteBridge;
  readonly appleRemoteToken?: string;
  readonly appleCatalogEnabled: boolean;
  readonly appleLibraryEnabled: boolean;
  readonly appleLocalPlaybackEnabled: boolean;

  // -- YouTube Music ----------------------------------------------------
  readonly youtubeMusicClient?: YouTubeMusicClient;
  readonly youtubeRuntime?: ProviderRuntime;
  readonly youtubeBrowserSupport: BrowserLaunchSupport;
  readonly youtubeAccessToken?: string;
  readonly youtubeApiKey?: string;

  // -- Multi-provider auth ---------------------------------------------
  readonly youtubeAuth?: YouTubeAuth;
  readonly appleAuth?: AppleAuth;

  // -- Session engine ---------------------------------------------------
  readonly engines: Map<MusicProviderName, SessionEngine>;
  activeProvider: MusicProviderName | null;

  // -- API token (embedded in player pages for SSE auth) -----------------
  readonly apiToken?: string;

  // -- SSE --------------------------------------------------------------
  readonly sseClients: Set<Response>;
  readonly enableSSE: boolean;

  // -- Methods exposed to route modules ---------------------------------

  /** Broadcast an SSE event to all connected clients. */
  broadcastEvent(type: string, payload?: Record<string, unknown>): void;

  /** Create a typed Event envelope with fresh ID and timestamp. */
  createEvent(type: string, payload?: Record<string, unknown>): Event;

  /** Normalize a route handler error into an HTTP response. */
  handleRouteError(res: Response, error: unknown, asText?: boolean): void;

  /** Apply a MusicKit user token to the live Apple client (activates library endpoints). */
  applyAppleUserToken(token: string): void;

  /** Resolve a provider's read-only MusicProvider (works even without local playback). */
  getReadProvider(provider: MusicProviderName): MusicProvider;

  /** Get a provider's full runtime (provider + playback), or null. */
  getRuntime(provider: MusicProviderName): ProviderRuntime | null;

  /** Get a provider's runtime, throwing ProviderUnavailableError if missing. */
  getPlaybackRuntime(provider: MusicProviderName): ProviderRuntime;

  /** Return the active session engine, or null. */
  getActiveEngine(): SessionEngine | null;

  /** Return the active provider runtime, or null. */
  getActiveRuntime(): ProviderRuntime | null;

  /** Return the currently active provider name, or null. */
  getActiveProvider(): MusicProviderName | null;

  /** Pre-flight check that a provider is ready for an operation. */
  assertProviderReady(provider: MusicProviderName, operation: string, policy?: SessionPolicy): Promise<void>;

  /** Get the Apple Music client, throwing ConfigurationError if not configured. */
  getAppleMusicClient(): AppleMusicClient;

  /** Get the YouTube Music client, throwing ConfigurationError if not configured. */
  getYouTubeMusicClient(): YouTubeMusicClient;

  /** Get the Apple remote bridge, throwing ProviderUnavailableError if not configured. */
  getAppleRemoteBridge(): AppleRemoteBridge;

  /** Probe Spotify provider status (async — may refresh tokens). */
  getSpotifyProviderStatus(): Promise<ProviderStatusDetails>;

  /** Get Apple Music provider status (sync). */
  getAppleProviderStatus(): ProviderStatusDetails;

  /** Get YouTube Music provider status (sync). */
  getYouTubeProviderStatus(): ProviderStatusDetails;

  // -- Session lifecycle (called by session routes) ----------------------

  /** Start a new session with the given policy. */
  startSession(policy: SessionPolicy): Promise<{ success: boolean; sessionId: string }>;

  /** Stop the active session. */
  stopSession(): Promise<{ success: boolean }>;

  /** Nudge the active session calmer or sharper. */
  nudgeSession(direction: 'calmer' | 'sharper', amount?: number): Promise<{ success: boolean; newWeights?: Record<string, number | undefined> }>;

  /** Skip the current track. */
  skipTrack(reason?: string): Promise<{ success: boolean }>;

  /** Start track-change polling (called after session start). */
  startTrackPolling(): void;

  /** Stop track-change polling (called after session stop). */
  stopTrackPolling(): void;

  /** Get full daemon status. */
  getStatus(): Promise<import('@sriinnu/harmon-protocol').DaemonStatus>;

  /** Validate imported Spotify cookies against the Spotify API before persisting. */
  validateImportedSpotifyCookies(cookies: SpotifyCookieRecord[]): Promise<void>;

  /** Create a fresh Apple Music MusicProvider for catalog-only operations. */
  createAppleMusicProviderFallback(): import('@sriinnu/harmon-core').MusicProvider;
}
