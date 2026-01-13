/**
 * Harmon Protocol - Zod schemas for Command, Event, and Policy types
 */
import { z } from 'zod';
// ============================================================================
// Common Types
// ============================================================================
/** Device type enum */
export const DeviceKind = z.enum(['cli', 'menubar', 'voice']);
/** OS/platform enum */
export const DeviceOS = z.enum(['macos', 'windows', 'wsl', 'linux']);
/** Source information for commands */
export const SourceInfo = z.object({
    kind: DeviceKind,
    device: DeviceOS,
});
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
/** Soft weights for ranking tracks */
export const SoftWeights = z.object({
    energy: z.number().optional(),
    instrumentalness: z.number().optional(),
    speechiness: z.number().optional(),
    valence: z.number().optional(),
    acousticness: z.number().optional(),
    tempo: z.number().optional(),
    recencyPenalty: z.number().optional(),
});
/** Energy arc for session */
export const EnergyArc = z.object({
    shape: z.enum(['flat', 'ramp-up', 'ramp-down', 'wave']).optional(),
    warmupMs: z.number().optional(),
    cooldownMs: z.number().optional(),
});
/** Soft preferences for ranking */
export const SoftPreferences = z.object({
    weights: SoftWeights.optional(),
    arc: EnergyArc.optional(),
});
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
/** Repetition limits */
export const RepetitionLimits = z.object({
    repeatTrackWithinDays: z.number().optional(),
    repeatArtistWithinHours: z.number().optional(),
});
/** Dhyana/meditation settings */
export const BreathCadence = z.enum(['slow', 'medium', 'none']);
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
/** Device preferences */
export const DevicePreferences = z.object({
    preferActive: z.boolean().optional(),
    deviceId: z.string().nullable().optional(),
});
/** Queue preferences */
export const QueuePreferences = z.object({
    target: z.number().optional(),
    refillWhenBelow: z.number().optional(),
});
/** Session mode */
export const SessionMode = z.enum(['focus', 'relax', 'energize', 'meditate', 'workout', 'custom']);
/** Main SessionPolicy schema - v1 */
export const SessionPolicy = z.object({
    version: z.literal(1),
    mode: SessionMode.optional(),
    durationMs: z.number().optional(),
    device: DevicePreferences.optional(),
    queue: QueuePreferences.optional(),
    hard: HardConstraints.optional(),
    soft: SoftPreferences.optional(),
    sources: MusicSources.optional(),
    limits: RepetitionLimits.optional(),
    dhyana: DhyanaSettings.optional(),
});
// ============================================================================
// Command Schema
// ============================================================================
/** Session start command */
export const SessionStartCommand = z.object({
    policy: SessionPolicy,
});
/** Session nudge command */
export const SessionNudgeCommand = z.object({
    direction: z.enum(['calmer', 'sharper']),
    amount: z.number().min(0).max(1).optional(),
    reason: z.string().optional(),
});
/** Skip command */
export const SkipCommand = z.object({
    reason: z.string().optional(),
});
/** Device use command */
export const DeviceUseCommand = z.object({
    deviceId: z.string(),
});
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
    ]),
    payload: z.union([
        SessionStartCommand,
        SessionNudgeCommand,
        SkipCommand,
        DeviceUseCommand,
        z.object({}),
    ]),
});
// ============================================================================
// Event Schema
// ============================================================================
/** Track information */
export const TrackInfo = z.object({
    id: z.string(),
    name: z.string(),
    artist: z.string(),
    album: z.string(),
    durationMs: z.number(),
    uri: z.string().optional(),
});
/** Device information */
export const DeviceInfo = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['speaker', 'computer', 'phone', 'tablet', 'tv', 'cast', 'unknown']),
    isActive: z.boolean(),
    volumePercent: z.number().optional(),
});
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
/** Daemon status */
export const DaemonStatus = z.object({
    isRunning: z.boolean(),
    version: z.string(),
    spotifyConnected: z.boolean(),
    session: SessionStatus.optional(),
});
/** Event envelope */
export const Event = z.object({
    id: z.string().startsWith('e_'),
    ts: z.number(),
    type: z.enum([
        'session.started',
        'session.stopped',
        'session.nudged',
        'track.started',
        'track.ended',
        'queue.refilled',
        'user.nudged',
        'device.discovered',
        'spotify.connected',
        'spotify.disconnected',
        'error',
    ]),
    payload: z.record(z.unknown()).optional(),
});
// ============================================================================
// Validation Helpers
// ============================================================================
export function validateCommand(data) {
    return Command.parse(data);
}
export function validateEvent(data) {
    return Event.parse(data);
}
export function validatePolicy(data) {
    return SessionPolicy.parse(data);
}
export function parseCommandSafe(data) {
    const result = Command.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
export function parseEventSafe(data) {
    const result = Event.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
export function parsePolicySafe(data) {
    const result = SessionPolicy.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
//# sourceMappingURL=index.js.map