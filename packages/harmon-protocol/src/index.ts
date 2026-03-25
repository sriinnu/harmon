/**
 * Harmon Protocol - Zod schemas for Command, Event, and Policy types
 */

import { z } from 'zod';

// ============================================================================
// Common Types
// ============================================================================

/** Device type enum */
export const DeviceKind = z.enum(['cli', 'menubar', 'voice']);
export type DeviceKind = z.infer<typeof DeviceKind>;

/** OS/platform enum */
export const DeviceOS = z.enum(['macos', 'windows', 'wsl', 'linux']);
export type DeviceOS = z.infer<typeof DeviceOS>;

/** Source information for commands */
export const SourceInfo = z.object({
  kind: DeviceKind,
  device: DeviceOS,
});
export type SourceInfo = z.infer<typeof SourceInfo>;

// ============================================================================
// SessionPolicy Schema - The heart of the system
// ============================================================================

/** Hard constraints that must be satisfied */
export const HardConstraints = z.object({
  noVocals: z.boolean().optional(),
  explicit: z.enum(['allow', 'avoid', 'require']).optional(),
  tempo: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  energy: z
    .object({
      min: z.number().min(0).max(1).optional(),
      max: z.number().min(0).max(1).optional(),
    })
    .optional(),
  instrumentalnessMin: z.number().min(0).max(1).optional(),
});
export type HardConstraints = z.infer<typeof HardConstraints>;

/** Soft weights for ranking tracks (bounded to prevent extreme values) */
export const SoftWeights = z.object({
  energy: z.number().min(-1).max(1).optional(),
  instrumentalness: z.number().min(-1).max(1).optional(),
  speechiness: z.number().min(-1).max(1).optional(),
  valence: z.number().min(-1).max(1).optional(),
  acousticness: z.number().min(-1).max(1).optional(),
  tempo: z.number().min(-1).max(1).optional(),
  recencyPenalty: z.number().min(0).max(1).optional(),
});
export type SoftWeights = z.infer<typeof SoftWeights>;

/** Energy arc for session */
export const EnergyArc = z.object({
  shape: z.enum(['flat', 'ramp-up', 'ramp-down', 'wave']).optional(),
  warmupMs: z.number().int().min(0).optional(),
  cooldownMs: z.number().int().min(0).optional(),
});
export type EnergyArc = z.infer<typeof EnergyArc>;

/** Soft preferences for ranking */
export const SoftPreferences = z.object({
  weights: SoftWeights.optional(),
  arc: EnergyArc.optional(),
});
export type SoftPreferences = z.infer<typeof SoftPreferences>;

/** Music sources for queue */
export const MusicSources = z.object({
  likedTracks: z.boolean().optional(),
  topTracks: z.boolean().optional(),
  recentPlays: z.boolean().optional(),
  seedPlaylists: z.array(z.string()).optional(),
  seedArtists: z.array(z.string()).optional(),
  discovery: z
    .object({
      enabled: z.boolean().optional(),
      ratio: z.number().min(0).max(1).optional(),
    })
    .optional(),
});
export type MusicSources = z.infer<typeof MusicSources>;

/** Repetition limits */
export const RepetitionLimits = z.object({
  repeatTrackWithinDays: z.number().int().min(0).max(365).optional(),
  repeatArtistWithinHours: z.number().min(0).max(168).optional(),
});
export type RepetitionLimits = z.infer<typeof RepetitionLimits>;

/** Dhyana/meditation settings */
export const BreathCadence = z.enum(['slow', 'medium', 'none']);
export type BreathCadence = z.infer<typeof BreathCadence>;

export const DhyanaSettings = z.object({
  breath: z
    .object({
      cadence: BreathCadence.optional(),
    })
    .optional(),
  fadeInMs: z.number().optional(),
  fadeOutMs: z.number().optional(),
  volumeCeiling: z.number().min(0).max(100).optional(),
});
export type DhyanaSettings = z.infer<typeof DhyanaSettings>;

/** Device preferences */
export const DevicePreferences = z.object({
  preferActive: z.boolean().optional(),
  deviceId: z.string().nullable().optional(),
});
export type DevicePreferences = z.infer<typeof DevicePreferences>;

/** Queue preferences */
export const QueuePreferences = z.object({
  target: z.number().int().min(1).max(100).optional(),
  refillWhenBelow: z.number().int().min(0).max(100).optional(),
});
export type QueuePreferences = z.infer<typeof QueuePreferences>;

/** Session mode */
export const SessionMode = z.enum(['focus', 'relax', 'energize', 'meditate', 'workout', 'custom']);
export type SessionMode = z.infer<typeof SessionMode>;

/** Main SessionPolicy schema - v1 */
export const SessionPolicy = z.object({
  version: z.literal(1),
  mode: SessionMode.optional(),
  durationMs: z.number().int().min(1000).max(86400000).optional(), // 1s to 24h
  device: DevicePreferences.optional(),
  queue: QueuePreferences.optional(),
  hard: HardConstraints.optional(),
  soft: SoftPreferences.optional(),
  sources: MusicSources.optional(),
  limits: RepetitionLimits.optional(),
  dhyana: DhyanaSettings.optional(),
});
export type SessionPolicy = z.infer<typeof SessionPolicy>;

// ============================================================================
// Command Schema
// ============================================================================

/** Session start command */
export const SessionStartCommand = z.object({
  policy: SessionPolicy,
});
export type SessionStartCommand = z.infer<typeof SessionStartCommand>;

/** Session nudge command */
export const SessionNudgeCommand = z.object({
  direction: z.enum(['calmer', 'sharper']),
  amount: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});
export type SessionNudgeCommand = z.infer<typeof SessionNudgeCommand>;

/** Skip command */
export const SkipCommand = z.object({
  reason: z.string().optional(),
});
export type SkipCommand = z.infer<typeof SkipCommand>;

/** Device use command */
export const DeviceUseCommand = z.object({
  deviceId: z.string(),
});
export type DeviceUseCommand = z.infer<typeof DeviceUseCommand>;

/** Command envelope */
export const Command = z.object({
  id: z.string().startsWith('c_'),
  ts: z.number(),
  source: SourceInfo,
  type: z.enum([
    'session.start',
    'session.stop',
    'session.nudge',
    'skip',
    'device.use',
    'device.discover',
    'auth.spotify.login',
    'auth.spotify.logout',
    'auth.apple.login',
    'auth.apple.logout',
    'auth.youtube.login',
    'auth.youtube.logout',
  ]),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type Command = z.infer<typeof Command>;

// ============================================================================
// Event Schema
// ============================================================================

/** Track information (provider-agnostic) */
export const TrackInfo = z.object({
  id: z.string(),
  name: z.string(),
  artist: z.string(),
  artistIds: z.array(z.string()).optional(),
  album: z.string(),
  durationMs: z.number(),
  uri: z.string().optional(),
  provider: z.enum(['spotify', 'apple', 'youtube', 'local']).optional(),
  imageUrl: z.string().optional(),
  isrc: z.string().optional(),
});
export type TrackInfo = z.infer<typeof TrackInfo>;

/** Device information */
export const DeviceInfo = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['speaker', 'computer', 'phone', 'tablet', 'tv', 'cast', 'unknown']),
  isActive: z.boolean(),
  volumePercent: z.number().optional(),
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

/** Session status */
export const SessionStatus = z.object({
  id: z.string().startsWith('sess_'),
  isActive: z.boolean(),
  policy: SessionPolicy.optional(),
  currentTrack: TrackInfo.nullable(),
  queueDepth: z.number(),
  elapsedMs: z.number().optional(),
  startedAt: z.number().optional(),
});
export type SessionStatus = z.infer<typeof SessionStatus>;

/** Daemon status */
export const DaemonStatus = z.object({
  isRunning: z.boolean(),
  version: z.string(),
  spotifyConnected: z.boolean(),
  providers: z.record(z.string(), z.object({
    connected: z.boolean(),
    name: z.string().optional(),
  })).optional(),
  session: SessionStatus.optional(),
});
export type DaemonStatus = z.infer<typeof DaemonStatus>;

/** Event envelope */
export const Event = z.object({
  id: z.string().startsWith('e_'),
  ts: z.number(),
  type: z.enum([
    'session.started',
    'session.stopped',
    'session.nudged',
    'session.paused',
    'session.resumed',
    'track.started',
    'track.ended',
    'track.skipped',
    'queue.refilled',
    'user.nudged',
    'device.discovered',
    'device.changed',
    'spotify.connected',
    'spotify.disconnected',
    'apple.connected',
    'apple.disconnected',
    'youtube.connected',
    'youtube.disconnected',
    'connected',
    'heartbeat',
    'command',
    'error',
  ]),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type Event = z.infer<typeof Event>;

// ============================================================================
// Validation Helpers
// ============================================================================

export function validateCommand(data: unknown): Command {
  return Command.parse(data);
}

export function validateEvent(data: unknown): Event {
  return Event.parse(data);
}

export function validatePolicy(data: unknown): SessionPolicy {
  return SessionPolicy.parse(data);
}

export function parseCommandSafe(data: unknown): { success: true; data: Command } | { success: false; error: z.ZodError } {
  const result = Command.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function parseEventSafe(data: unknown): { success: true; data: Event } | { success: false; error: z.ZodError } {
  const result = Event.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function parsePolicySafe(data: unknown): { success: true; data: SessionPolicy } | { success: false; error: z.ZodError } {
  const result = SessionPolicy.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
