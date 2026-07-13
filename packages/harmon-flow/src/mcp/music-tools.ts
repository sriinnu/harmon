/**
 * Shared music/daemon tool table consumed by both MCP servers:
 * the remote HTTP app server and the local stdio server register
 * from this single source of truth.
 */

import { z } from 'zod';
import { SessionPolicy } from '@sriinnu/harmon-protocol';
import type { HarmonDaemonAppClient, MusicSearchKind } from './daemon-client.js';

export interface MusicToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface MusicToolSpec {
  annotations: {
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    readOnlyHint?: boolean;
    title: string;
  };
  description: string;
  handler: (args: Record<string, unknown>, daemon: HarmonDaemonAppClient) => Promise<MusicToolResult>;
  name: string;
  schema?: z.ZodObject<z.ZodRawShape>;
  write: boolean;
}

const PROVIDER = z.enum(['spotify', 'apple', 'youtube']);

/**
 * I return every daemon-backed music tool, read tools first.
 */
export function getMusicToolSpecs(): MusicToolSpec[] {
  return [
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Get Harmon Status' },
      description: 'Get provider readiness and current session state from the Harmon daemon. Call this first to check that Harmon is running and which providers are connected.',
      handler: async (_args, daemon) => jsonResult(await getPublicStatus(daemon)),
      name: 'get_status',
      write: false,
    },
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Search Music' },
      description: 'Search Spotify, Apple Music, or YouTube Music catalogs.',
      handler: async (args, daemon) => {
        const { kind, limit, provider, query } = args as {
          kind: MusicSearchKind; limit?: number; provider: 'spotify' | 'apple' | 'youtube'; query: string;
        };
        return jsonResult({
          provider,
          results: await daemon.searchMusic(provider, query, kind, limit),
        });
      },
      name: 'search_music',
      schema: z.object({
        kind: z.enum(['track', 'song', 'album', 'artist', 'playlist']).default('song'),
        limit: z.number().int().min(1).max(10).optional(),
        provider: PROVIDER,
        query: z.string().min(1),
      }),
      write: false,
    },
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Get Library Tracks' },
      description: 'List saved or liked tracks for a provider.',
      handler: async (args, daemon) => {
        const { limit, provider } = args as { limit?: number; provider: 'spotify' | 'apple' | 'youtube' };
        return jsonResult({
          provider,
          tracks: await daemon.getLibraryTracks(provider, limit),
        });
      },
      name: 'get_library_tracks',
      schema: z.object({
        limit: z.number().int().min(1).max(25).optional(),
        provider: PROVIDER,
      }),
      write: false,
    },
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'List Playlists' },
      description: 'List playlists for a provider.',
      handler: async (args, daemon) => {
        const { limit, provider } = args as { limit?: number; provider: 'spotify' | 'apple' | 'youtube' };
        return jsonResult({
          playlists: await daemon.listPlaylists(provider, limit),
          provider,
        });
      },
      name: 'list_playlists',
      schema: z.object({
        limit: z.number().int().min(1).max(25).optional(),
        provider: PROVIDER,
      }),
      write: false,
    },
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Get Playlist Tracks' },
      description: 'Fetch tracks from a playlist for a provider.',
      handler: async (args, daemon) => {
        const { limit, playlistId, provider } = args as {
          limit?: number; playlistId: string; provider: 'spotify' | 'apple' | 'youtube';
        };
        return jsonResult({
          playlistId,
          provider,
          tracks: await daemon.getPlaylistTracks(provider, playlistId, limit),
        });
      },
      name: 'get_playlist_tracks',
      schema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
        playlistId: z.string().min(1),
        provider: PROVIDER,
      }),
      write: false,
    },
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Get Now Playing' },
      description: 'Get the currently playing track. Omit provider to check the active session first, then every provider — the right default for "what\'s playing?".',
      handler: async (args, daemon) => {
        const { provider } = args as { provider?: 'spotify' | 'apple' | 'youtube' };
        if (provider) {
          return jsonResult({
            provider,
            track: await daemon.getNowPlaying(provider),
          });
        }

        // Active session wins: its current track carries provider context.
        try {
          const status = await daemon.getStatus();
          const sessionTrack = status.session?.isActive ? status.session.currentTrack : null;
          if (sessionTrack) {
            return jsonResult({
              provider: status.session?.provider ?? null,
              source: 'session',
              track: sessionTrack,
            });
          }
        } catch {
          // Fall through to the provider fan-out below.
        }

        const providers: Array<'spotify' | 'apple' | 'youtube'> = ['spotify', 'apple', 'youtube'];
        const tracks = await Promise.all(providers.map(async (name) => {
          try {
            return await daemon.getNowPlaying(name);
          } catch {
            return null;
          }
        }));
        const index = tracks.findIndex((track) => track !== null);
        if (index === -1) {
          return jsonResult({ provider: null, track: null });
        }
        return jsonResult({ provider: providers[index], track: tracks[index] });
      },
      name: 'get_now_playing',
      schema: z.object({
        provider: PROVIDER.optional().describe('Omit to auto-detect across the session and all providers'),
      }),
      write: false,
    },
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'List Devices' },
      description: 'List available Spotify playback devices. Use when playback fails with "no active device", then activate one with use_device.',
      handler: async (_args, daemon) => jsonResult(await daemon.listDevices()),
      name: 'list_devices',
      write: false,
    },
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Auth Status' },
      description:
        'Get authentication status for all music providers (Spotify, Apple Music, YouTube Music). Shows which providers are connected, their auth mode, and capabilities.',
      handler: async (_args, daemon) => {
        const status = await daemon.getStatus();
        return jsonResult({
          providers: status.providers ?? {},
        });
      },
      name: 'auth_status',
      write: false,
    },
    {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Smart Search' },
      description:
        'Search for a song, artist, or album across ALL connected music providers (Spotify, Apple Music, YouTube Music) simultaneously. Returns results from each provider so you can compare availability. Use this when the user says "find this song" or "who has this track".',
      handler: async (args, daemon) => {
        const { limit, query } = args as { limit?: number; query: string };
        return jsonResult(await daemon.smartSearch(query, limit));
      },
      name: 'smart_search',
      schema: z.object({
        query: z.string().min(1).describe('The song, artist, or album to search for'),
        limit: z.number().int().min(1).max(25).optional().describe('Max results per provider (default: 5)'),
      }),
      write: false,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
        title: 'Recognize Song',
      },
      description:
        'Identify a song from audio data. Send base64-encoded WAV audio (3-10 seconds). Returns song title, artist, album, and links to Spotify/Apple Music. Requires AUDD_API_TOKEN to be configured on the daemon.',
      handler: async (args, daemon) => {
        const { audio } = args as { audio: string };
        return jsonResult(await daemon.recognizeSong(audio));
      },
      name: 'recognize_song',
      schema: z.object({
        audio: z.string().min(1).describe('Base64-encoded WAV audio data (3-10 seconds, 16kHz mono)'),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Play Music',
      },
      description: 'Play a track on the active provider. Accepts a Spotify URI, Apple Music URL, or YouTube URL. For Apple Music, a direct URL is required — query-based playback is not supported.',
      handler: async (args, daemon) => {
        const { kind, provider, query, target } = args as {
          kind: 'track' | 'song'; provider: 'spotify' | 'apple' | 'youtube'; query?: string; target?: string;
        };
        if (provider === 'apple' && !target && query) {
          return {
            content: [{ type: 'text' as const, text: 'Apple Music requires a direct URL for playback. Search for the track first using search_music, then use the returned URL.' }],
            isError: true,
          };
        }
        const resolvedTarget = target ?? await resolvePlayTarget(daemon, provider, kind, query);
        if (!resolvedTarget) {
          throw new Error('play_music requires a target or a query that resolves to a playable track.');
        }
        await daemon.playMusic(provider, resolvedTarget);
        return jsonResult({
          provider,
          success: true,
          target: resolvedTarget,
        });
      },
      name: 'play_music',
      schema: z.object({
        kind: z.enum(['track', 'song']).default('song'),
        provider: PROVIDER,
        query: z.string().min(1).optional(),
        target: z.string().min(1).optional(),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Smart Play',
      },
      description:
        'Play a song by searching all connected providers and playing on the first match. If a specific provider is requested but needs authentication, returns an auth URL. Use this when the user says "play this song" without specifying a provider, or "play X on YouTube".',
      handler: async (args, daemon) => {
        const { provider, query, uri } = args as {
          provider?: 'spotify' | 'apple' | 'youtube'; query?: string; uri?: string;
        };
        if (!query && !uri) {
          return {
            content: [{ type: 'text' as const, text: 'smart_play needs a query (song name) or a uri (direct track link).' }],
            isError: true,
          };
        }
        const result = await daemon.smartPlay({
          query,
          uri,
          provider,
        });

        if (result.needsAuth) {
          return {
            content: [{
              type: 'text' as const,
              text: `${result.provider} needs authentication. ${result.authUrl ? `The user should open this URL: ${result.authUrl}` : `Use the auth_${result.provider}_login tool to start authentication.`}`,
            }],
          };
        }

        if (!result.success) {
          return {
            content: [{ type: 'text' as const, text: result.error || 'Playback failed.' }],
            isError: true,
          };
        }

        const track = result.track;
        let text = `Now playing on ${result.provider}`;
        if (track) {
          text += `: ${track.artist} - ${track.name}`;
          if (track.album) text += ` (${track.album})`;
        }
        if (result.alternateProviders?.length > 0) {
          text += `\n\nAlso available on: ${result.alternateProviders.map((a: { provider: string }) => a.provider).join(', ')}`;
        }

        return { content: [{ type: 'text' as const, text }] };
      },
      name: 'smart_play',
      schema: z.object({
        query: z.string().min(1).optional().describe('Song name or search query to find and play'),
        uri: z.string().min(1).optional().describe('Direct track URI (spotify:track:..., youtube URL, apple URL)'),
        provider: PROVIDER.optional().describe('Preferred provider (optional — if omitted, searches all)'),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Pause Music',
      },
      description: 'Pause playback for a provider runtime. YouTube browser-handoff does not support pause.',
      handler: async (args, daemon) => {
        const { provider } = args as { provider: 'spotify' | 'apple' | 'youtube' };
        if (provider === 'youtube') {
          throw new Error('YouTube Music pause is not supported in browser-handoff mode.');
        }
        return jsonResult(await daemon.pauseMusic(provider));
      },
      name: 'pause_music',
      schema: z.object({
        provider: PROVIDER,
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Resume Music',
      },
      description: 'Resume paused playback on a provider. Not supported for YouTube browser-handoff.',
      handler: async (args, daemon) => {
        const { provider } = args as { provider: 'spotify' | 'apple' };
        return jsonResult(await daemon.resumeMusic(provider));
      },
      name: 'resume_music',
      schema: z.object({
        provider: z.enum(['spotify', 'apple']),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Set Volume',
      },
      description: 'Set Spotify playback volume (0-100). Spotify only — Apple and YouTube playback have no daemon volume control.',
      handler: async (args, daemon) => {
        const { volumePercent } = args as { volumePercent: number };
        return jsonResult(await daemon.setVolume(volumePercent));
      },
      name: 'set_volume',
      schema: z.object({
        volumePercent: z.number().int().min(0).max(100),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Seek',
      },
      description: 'Seek to a position (milliseconds) in the current Spotify track. Spotify only.',
      handler: async (args, daemon) => {
        const { positionMs } = args as { positionMs: number };
        return jsonResult(await daemon.seek(positionMs));
      },
      name: 'seek',
      schema: z.object({
        positionMs: z.number().int().min(0),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Set Shuffle',
      },
      description: 'Turn Spotify shuffle on or off. Spotify only.',
      handler: async (args, daemon) => {
        const { state } = args as { state: boolean };
        return jsonResult(await daemon.setShuffle(state));
      },
      name: 'set_shuffle',
      schema: z.object({
        state: z.boolean(),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Set Repeat',
      },
      description: 'Set Spotify repeat mode: off, track (repeat one), or context (repeat album/playlist). Spotify only.',
      handler: async (args, daemon) => {
        const { state } = args as { state: 'off' | 'track' | 'context' };
        return jsonResult(await daemon.setRepeat(state));
      },
      name: 'set_repeat',
      schema: z.object({
        state: z.enum(['off', 'track', 'context']),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Add To Queue',
      },
      description: 'Add a track to the playback queue without interrupting the current track. Spotify (spotify:track:... URI) or YouTube (video URL/ID).',
      handler: async (args, daemon) => {
        const { provider, uri } = args as { provider: 'spotify' | 'youtube'; uri: string };
        return jsonResult(await daemon.addToQueue(provider, uri));
      },
      name: 'add_to_queue',
      schema: z.object({
        provider: z.enum(['spotify', 'youtube']),
        uri: z.string().min(1),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Use Device',
      },
      description: 'Transfer Spotify playback to a device (get IDs from list_devices). Fixes "no active device" errors.',
      handler: async (args, daemon) => {
        const { deviceId } = args as { deviceId: string };
        return jsonResult(await daemon.useDevice(deviceId));
      },
      name: 'use_device',
      schema: z.object({
        deviceId: z.string().min(1),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Next Track',
      },
      description: 'Skip to the next track for a provider runtime.',
      handler: async (args, daemon) => {
        const { provider } = args as { provider: 'spotify' | 'apple' | 'youtube' };
        return jsonResult(await daemon.nextTrack(provider));
      },
      name: 'next_track',
      schema: z.object({
        provider: PROVIDER,
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Previous Track',
      },
      description: 'Return to the previous track for a provider runtime.',
      handler: async (args, daemon) => {
        const { provider } = args as { provider: 'spotify' | 'apple' | 'youtube' };
        return jsonResult(await daemon.previousTrack(provider));
      },
      name: 'previous_track',
      schema: z.object({
        provider: PROVIDER,
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Start Session',
      },
      description: 'Start a Harmon session using the shared policy contract.',
      handler: async (args, daemon) => {
        const { policy } = args as { policy: SessionPolicy };
        const result = await daemon.startSession(policy);
        return jsonResult({
          provider: policy.provider ?? 'spotify',
          success: result.success,
        });
      },
      name: 'start_session',
      schema: z.object({
        policy: SessionPolicy,
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Nudge Session',
      },
      description: 'Nudge the active session calmer or sharper.',
      handler: async (args, daemon) => {
        const { amount, direction, reason } = args as {
          amount?: number; direction: 'calmer' | 'sharper'; reason?: string;
        };
        return jsonResult(await daemon.nudgeSession(direction, amount, reason));
      },
      name: 'nudge_session',
      schema: z.object({
        amount: z.number().min(0).max(1).optional(),
        direction: z.enum(['calmer', 'sharper']),
        reason: z.string().max(280).optional(),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Stop Session',
      },
      description: 'Stop the active Harmon session.',
      handler: async (_args, daemon) => jsonResult(await daemon.stopSession()),
      name: 'stop_session',
      write: true,
    },

    // ---- Auth write tools ----

    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
        title: 'YouTube Login',
      },
      description:
        'Start YouTube Music OAuth login. Returns a URL the user must open in their browser to authorize Harmon.',
      handler: async (_args, daemon) => jsonResult(await daemon.youtubeAuthLogin()),
      name: 'auth_youtube_login',
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'YouTube Refresh Token',
      },
      description:
        'Refresh the YouTube Music access token using the stored refresh token.',
      handler: async (_args, daemon) => jsonResult(await daemon.youtubeAuthRefresh()),
      name: 'auth_youtube_refresh',
      write: true,
    },
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'YouTube Logout',
      },
      description: 'Clear YouTube Music authentication tokens.',
      handler: async (_args, daemon) => jsonResult(await daemon.youtubeAuthLogout()),
      name: 'auth_youtube_logout',
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
        title: 'Spotify Login',
      },
      description:
        'Start Spotify OAuth login. Returns a URL the user must open in their browser to authorize Harmon.',
      handler: async (_args, daemon) => jsonResult(await daemon.spotifyAuthLogin()),
      name: 'auth_spotify_login',
      write: true,
    },
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Spotify Logout',
      },
      description: 'Clear Spotify authentication tokens and cookies.',
      handler: async (_args, daemon) => jsonResult(await daemon.spotifyAuthLogout()),
      name: 'auth_spotify_logout',
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Apple Set User Token',
      },
      description:
        "Set the Apple Music user token (obtained via MusicKit JS in a browser). Required for accessing the user's Apple Music library.",
      handler: async (args, daemon) => {
        const { token } = args as { token: string };
        return jsonResult(await daemon.appleAuthSetUserToken(token));
      },
      name: 'auth_apple_set_token',
      schema: z.object({
        token: z.string().min(1),
      }),
      write: true,
    },
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Apple Refresh Token',
      },
      description:
        'Refresh the Apple Music developer token. Requires key material (APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY) to be configured.',
      handler: async (_args, daemon) => jsonResult(await daemon.appleAuthRefresh()),
      name: 'auth_apple_refresh',
      write: true,
    },
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Apple Logout',
      },
      description: 'Clear Apple Music authentication tokens.',
      handler: async (_args, daemon) => jsonResult(await daemon.appleAuthLogout()),
      name: 'auth_apple_logout',
      write: true,
    },
  ];
}

/**
 * I shape daemon status for tool consumers without leaking internals.
 */
export async function getPublicStatus(daemon: HarmonDaemonAppClient): Promise<Record<string, unknown>> {
  const status = await daemon.getStatus();
  return {
    features: status.features ?? {},
    isRunning: status.isRunning,
    providers: status.providers ?? {},
    session: status.session
      ? {
          currentTrack: status.session.currentTrack ?? null,
          isActive: status.session.isActive,
          policy: summarizePolicy(status.session.policy),
          provider: status.session.provider ?? null,
          queueDepth: status.session.queueDepth,
        }
      : null,
  };
}

async function resolvePlayTarget(
  daemon: HarmonDaemonAppClient,
  provider: 'spotify' | 'apple' | 'youtube',
  kind: 'track' | 'song',
  query: string | undefined,
): Promise<string | null> {
  if (!query) {
    return null;
  }

  const results = await daemon.searchMusic(provider, query, kind, 1);
  const first = results[0];
  if (!first) {
    return null;
  }

  if (first.uri) {
    return first.uri;
  }
  if (first.url) {
    return first.url;
  }
  if (provider === 'spotify') {
    return `spotify:track:${first.id}`;
  }
  if (provider === 'apple') {
    return null;
  }
  return `youtube:video:${first.id}`;
}

function jsonResult(value: unknown): MusicToolResult {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: 'text' as const }],
  };
}

function summarizePolicy(policy: SessionPolicy | undefined): Record<string, unknown> | null {
  if (!policy) {
    return null;
  }

  return {
    durationMs: policy.durationMs ?? null,
    mode: policy.mode ?? null,
    provider: policy.provider ?? 'spotify',
    queue: policy.queue
      ? {
          refillWhenBelow: policy.queue.refillWhenBelow ?? null,
          target: policy.queue.target ?? null,
        }
      : null,
    sources: policy.sources ?? null,
  };
}
