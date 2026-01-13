/**
 * Harmon Protocol - Zod schemas for Command, Event, and Policy types
 */
import { z } from 'zod';
/** Device type enum */
export declare const DeviceKind: z.ZodEnum<["cli", "menubar", "voice"]>;
export type DeviceKind = z.infer<typeof DeviceKind>;
/** OS/platform enum */
export declare const DeviceOS: z.ZodEnum<["macos", "windows", "wsl", "linux"]>;
export type DeviceOS = z.infer<typeof DeviceOS>;
/** Source information for commands */
export declare const SourceInfo: z.ZodObject<{
    kind: z.ZodEnum<["cli", "menubar", "voice"]>;
    device: z.ZodEnum<["macos", "windows", "wsl", "linux"]>;
}, "strip", z.ZodTypeAny, {
    kind: "cli" | "menubar" | "voice";
    device: "macos" | "windows" | "wsl" | "linux";
}, {
    kind: "cli" | "menubar" | "voice";
    device: "macos" | "windows" | "wsl" | "linux";
}>;
export type SourceInfo = z.infer<typeof SourceInfo>;
/** Hard constraints that must be satisfied */
export declare const HardConstraints: z.ZodObject<{
    noVocals: z.ZodOptional<z.ZodBoolean>;
    explicit: z.ZodOptional<z.ZodEnum<["allow", "avoid", "require"]>>;
    tempo: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        min?: number | undefined;
        max?: number | undefined;
    }, {
        min?: number | undefined;
        max?: number | undefined;
    }>>;
    energy: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        min?: number | undefined;
        max?: number | undefined;
    }, {
        min?: number | undefined;
        max?: number | undefined;
    }>>;
    instrumentalnessMin: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    noVocals?: boolean | undefined;
    explicit?: "allow" | "avoid" | "require" | undefined;
    tempo?: {
        min?: number | undefined;
        max?: number | undefined;
    } | undefined;
    energy?: {
        min?: number | undefined;
        max?: number | undefined;
    } | undefined;
    instrumentalnessMin?: number | undefined;
}, {
    noVocals?: boolean | undefined;
    explicit?: "allow" | "avoid" | "require" | undefined;
    tempo?: {
        min?: number | undefined;
        max?: number | undefined;
    } | undefined;
    energy?: {
        min?: number | undefined;
        max?: number | undefined;
    } | undefined;
    instrumentalnessMin?: number | undefined;
}>;
export type HardConstraints = z.infer<typeof HardConstraints>;
/** Soft weights for ranking tracks */
export declare const SoftWeights: z.ZodObject<{
    energy: z.ZodOptional<z.ZodNumber>;
    instrumentalness: z.ZodOptional<z.ZodNumber>;
    speechiness: z.ZodOptional<z.ZodNumber>;
    valence: z.ZodOptional<z.ZodNumber>;
    acousticness: z.ZodOptional<z.ZodNumber>;
    tempo: z.ZodOptional<z.ZodNumber>;
    recencyPenalty: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    tempo?: number | undefined;
    energy?: number | undefined;
    instrumentalness?: number | undefined;
    speechiness?: number | undefined;
    valence?: number | undefined;
    acousticness?: number | undefined;
    recencyPenalty?: number | undefined;
}, {
    tempo?: number | undefined;
    energy?: number | undefined;
    instrumentalness?: number | undefined;
    speechiness?: number | undefined;
    valence?: number | undefined;
    acousticness?: number | undefined;
    recencyPenalty?: number | undefined;
}>;
export type SoftWeights = z.infer<typeof SoftWeights>;
/** Energy arc for session */
export declare const EnergyArc: z.ZodObject<{
    shape: z.ZodOptional<z.ZodEnum<["flat", "ramp-up", "ramp-down", "wave"]>>;
    warmupMs: z.ZodOptional<z.ZodNumber>;
    cooldownMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
    warmupMs?: number | undefined;
    cooldownMs?: number | undefined;
}, {
    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
    warmupMs?: number | undefined;
    cooldownMs?: number | undefined;
}>;
export type EnergyArc = z.infer<typeof EnergyArc>;
/** Soft preferences for ranking */
export declare const SoftPreferences: z.ZodObject<{
    weights: z.ZodOptional<z.ZodObject<{
        energy: z.ZodOptional<z.ZodNumber>;
        instrumentalness: z.ZodOptional<z.ZodNumber>;
        speechiness: z.ZodOptional<z.ZodNumber>;
        valence: z.ZodOptional<z.ZodNumber>;
        acousticness: z.ZodOptional<z.ZodNumber>;
        tempo: z.ZodOptional<z.ZodNumber>;
        recencyPenalty: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        tempo?: number | undefined;
        energy?: number | undefined;
        instrumentalness?: number | undefined;
        speechiness?: number | undefined;
        valence?: number | undefined;
        acousticness?: number | undefined;
        recencyPenalty?: number | undefined;
    }, {
        tempo?: number | undefined;
        energy?: number | undefined;
        instrumentalness?: number | undefined;
        speechiness?: number | undefined;
        valence?: number | undefined;
        acousticness?: number | undefined;
        recencyPenalty?: number | undefined;
    }>>;
    arc: z.ZodOptional<z.ZodObject<{
        shape: z.ZodOptional<z.ZodEnum<["flat", "ramp-up", "ramp-down", "wave"]>>;
        warmupMs: z.ZodOptional<z.ZodNumber>;
        cooldownMs: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
        warmupMs?: number | undefined;
        cooldownMs?: number | undefined;
    }, {
        shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
        warmupMs?: number | undefined;
        cooldownMs?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    weights?: {
        tempo?: number | undefined;
        energy?: number | undefined;
        instrumentalness?: number | undefined;
        speechiness?: number | undefined;
        valence?: number | undefined;
        acousticness?: number | undefined;
        recencyPenalty?: number | undefined;
    } | undefined;
    arc?: {
        shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
        warmupMs?: number | undefined;
        cooldownMs?: number | undefined;
    } | undefined;
}, {
    weights?: {
        tempo?: number | undefined;
        energy?: number | undefined;
        instrumentalness?: number | undefined;
        speechiness?: number | undefined;
        valence?: number | undefined;
        acousticness?: number | undefined;
        recencyPenalty?: number | undefined;
    } | undefined;
    arc?: {
        shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
        warmupMs?: number | undefined;
        cooldownMs?: number | undefined;
    } | undefined;
}>;
export type SoftPreferences = z.infer<typeof SoftPreferences>;
/** Music sources for queue */
export declare const MusicSources: z.ZodObject<{
    likedTracks: z.ZodOptional<z.ZodBoolean>;
    topTracks: z.ZodOptional<z.ZodBoolean>;
    recentPlays: z.ZodOptional<z.ZodBoolean>;
    seedPlaylists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    seedArtists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    discovery: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        ratio: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean | undefined;
        ratio?: number | undefined;
    }, {
        enabled?: boolean | undefined;
        ratio?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    likedTracks?: boolean | undefined;
    topTracks?: boolean | undefined;
    recentPlays?: boolean | undefined;
    seedPlaylists?: string[] | undefined;
    seedArtists?: string[] | undefined;
    discovery?: {
        enabled?: boolean | undefined;
        ratio?: number | undefined;
    } | undefined;
}, {
    likedTracks?: boolean | undefined;
    topTracks?: boolean | undefined;
    recentPlays?: boolean | undefined;
    seedPlaylists?: string[] | undefined;
    seedArtists?: string[] | undefined;
    discovery?: {
        enabled?: boolean | undefined;
        ratio?: number | undefined;
    } | undefined;
}>;
export type MusicSources = z.infer<typeof MusicSources>;
/** Repetition limits */
export declare const RepetitionLimits: z.ZodObject<{
    repeatTrackWithinDays: z.ZodOptional<z.ZodNumber>;
    repeatArtistWithinHours: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    repeatTrackWithinDays?: number | undefined;
    repeatArtistWithinHours?: number | undefined;
}, {
    repeatTrackWithinDays?: number | undefined;
    repeatArtistWithinHours?: number | undefined;
}>;
export type RepetitionLimits = z.infer<typeof RepetitionLimits>;
/** Dhyana/meditation settings */
export declare const BreathCadence: z.ZodEnum<["slow", "medium", "none"]>;
export type BreathCadence = z.infer<typeof BreathCadence>;
export declare const DhyanaSettings: z.ZodObject<{
    breath: z.ZodOptional<z.ZodObject<{
        cadence: z.ZodOptional<z.ZodEnum<["slow", "medium", "none"]>>;
    }, "strip", z.ZodTypeAny, {
        cadence?: "slow" | "medium" | "none" | undefined;
    }, {
        cadence?: "slow" | "medium" | "none" | undefined;
    }>>;
    fadeInMs: z.ZodOptional<z.ZodNumber>;
    fadeOutMs: z.ZodOptional<z.ZodNumber>;
    volumeCeiling: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    breath?: {
        cadence?: "slow" | "medium" | "none" | undefined;
    } | undefined;
    fadeInMs?: number | undefined;
    fadeOutMs?: number | undefined;
    volumeCeiling?: number | undefined;
}, {
    breath?: {
        cadence?: "slow" | "medium" | "none" | undefined;
    } | undefined;
    fadeInMs?: number | undefined;
    fadeOutMs?: number | undefined;
    volumeCeiling?: number | undefined;
}>;
export type DhyanaSettings = z.infer<typeof DhyanaSettings>;
/** Device preferences */
export declare const DevicePreferences: z.ZodObject<{
    preferActive: z.ZodOptional<z.ZodBoolean>;
    deviceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    preferActive?: boolean | undefined;
    deviceId?: string | null | undefined;
}, {
    preferActive?: boolean | undefined;
    deviceId?: string | null | undefined;
}>;
export type DevicePreferences = z.infer<typeof DevicePreferences>;
/** Queue preferences */
export declare const QueuePreferences: z.ZodObject<{
    target: z.ZodOptional<z.ZodNumber>;
    refillWhenBelow: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    target?: number | undefined;
    refillWhenBelow?: number | undefined;
}, {
    target?: number | undefined;
    refillWhenBelow?: number | undefined;
}>;
export type QueuePreferences = z.infer<typeof QueuePreferences>;
/** Session mode */
export declare const SessionMode: z.ZodEnum<["focus", "relax", "energize", "meditate", "workout", "custom"]>;
export type SessionMode = z.infer<typeof SessionMode>;
/** Main SessionPolicy schema - v1 */
export declare const SessionPolicy: z.ZodObject<{
    version: z.ZodLiteral<1>;
    mode: z.ZodOptional<z.ZodEnum<["focus", "relax", "energize", "meditate", "workout", "custom"]>>;
    durationMs: z.ZodOptional<z.ZodNumber>;
    device: z.ZodOptional<z.ZodObject<{
        preferActive: z.ZodOptional<z.ZodBoolean>;
        deviceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        preferActive?: boolean | undefined;
        deviceId?: string | null | undefined;
    }, {
        preferActive?: boolean | undefined;
        deviceId?: string | null | undefined;
    }>>;
    queue: z.ZodOptional<z.ZodObject<{
        target: z.ZodOptional<z.ZodNumber>;
        refillWhenBelow: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        target?: number | undefined;
        refillWhenBelow?: number | undefined;
    }, {
        target?: number | undefined;
        refillWhenBelow?: number | undefined;
    }>>;
    hard: z.ZodOptional<z.ZodObject<{
        noVocals: z.ZodOptional<z.ZodBoolean>;
        explicit: z.ZodOptional<z.ZodEnum<["allow", "avoid", "require"]>>;
        tempo: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodNumber>;
            max: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            min?: number | undefined;
            max?: number | undefined;
        }, {
            min?: number | undefined;
            max?: number | undefined;
        }>>;
        energy: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodNumber>;
            max: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            min?: number | undefined;
            max?: number | undefined;
        }, {
            min?: number | undefined;
            max?: number | undefined;
        }>>;
        instrumentalnessMin: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        noVocals?: boolean | undefined;
        explicit?: "allow" | "avoid" | "require" | undefined;
        tempo?: {
            min?: number | undefined;
            max?: number | undefined;
        } | undefined;
        energy?: {
            min?: number | undefined;
            max?: number | undefined;
        } | undefined;
        instrumentalnessMin?: number | undefined;
    }, {
        noVocals?: boolean | undefined;
        explicit?: "allow" | "avoid" | "require" | undefined;
        tempo?: {
            min?: number | undefined;
            max?: number | undefined;
        } | undefined;
        energy?: {
            min?: number | undefined;
            max?: number | undefined;
        } | undefined;
        instrumentalnessMin?: number | undefined;
    }>>;
    soft: z.ZodOptional<z.ZodObject<{
        weights: z.ZodOptional<z.ZodObject<{
            energy: z.ZodOptional<z.ZodNumber>;
            instrumentalness: z.ZodOptional<z.ZodNumber>;
            speechiness: z.ZodOptional<z.ZodNumber>;
            valence: z.ZodOptional<z.ZodNumber>;
            acousticness: z.ZodOptional<z.ZodNumber>;
            tempo: z.ZodOptional<z.ZodNumber>;
            recencyPenalty: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            tempo?: number | undefined;
            energy?: number | undefined;
            instrumentalness?: number | undefined;
            speechiness?: number | undefined;
            valence?: number | undefined;
            acousticness?: number | undefined;
            recencyPenalty?: number | undefined;
        }, {
            tempo?: number | undefined;
            energy?: number | undefined;
            instrumentalness?: number | undefined;
            speechiness?: number | undefined;
            valence?: number | undefined;
            acousticness?: number | undefined;
            recencyPenalty?: number | undefined;
        }>>;
        arc: z.ZodOptional<z.ZodObject<{
            shape: z.ZodOptional<z.ZodEnum<["flat", "ramp-up", "ramp-down", "wave"]>>;
            warmupMs: z.ZodOptional<z.ZodNumber>;
            cooldownMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
            warmupMs?: number | undefined;
            cooldownMs?: number | undefined;
        }, {
            shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
            warmupMs?: number | undefined;
            cooldownMs?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        weights?: {
            tempo?: number | undefined;
            energy?: number | undefined;
            instrumentalness?: number | undefined;
            speechiness?: number | undefined;
            valence?: number | undefined;
            acousticness?: number | undefined;
            recencyPenalty?: number | undefined;
        } | undefined;
        arc?: {
            shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
            warmupMs?: number | undefined;
            cooldownMs?: number | undefined;
        } | undefined;
    }, {
        weights?: {
            tempo?: number | undefined;
            energy?: number | undefined;
            instrumentalness?: number | undefined;
            speechiness?: number | undefined;
            valence?: number | undefined;
            acousticness?: number | undefined;
            recencyPenalty?: number | undefined;
        } | undefined;
        arc?: {
            shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
            warmupMs?: number | undefined;
            cooldownMs?: number | undefined;
        } | undefined;
    }>>;
    sources: z.ZodOptional<z.ZodObject<{
        likedTracks: z.ZodOptional<z.ZodBoolean>;
        topTracks: z.ZodOptional<z.ZodBoolean>;
        recentPlays: z.ZodOptional<z.ZodBoolean>;
        seedPlaylists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        seedArtists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        discovery: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            ratio: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            ratio?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            ratio?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        likedTracks?: boolean | undefined;
        topTracks?: boolean | undefined;
        recentPlays?: boolean | undefined;
        seedPlaylists?: string[] | undefined;
        seedArtists?: string[] | undefined;
        discovery?: {
            enabled?: boolean | undefined;
            ratio?: number | undefined;
        } | undefined;
    }, {
        likedTracks?: boolean | undefined;
        topTracks?: boolean | undefined;
        recentPlays?: boolean | undefined;
        seedPlaylists?: string[] | undefined;
        seedArtists?: string[] | undefined;
        discovery?: {
            enabled?: boolean | undefined;
            ratio?: number | undefined;
        } | undefined;
    }>>;
    limits: z.ZodOptional<z.ZodObject<{
        repeatTrackWithinDays: z.ZodOptional<z.ZodNumber>;
        repeatArtistWithinHours: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        repeatTrackWithinDays?: number | undefined;
        repeatArtistWithinHours?: number | undefined;
    }, {
        repeatTrackWithinDays?: number | undefined;
        repeatArtistWithinHours?: number | undefined;
    }>>;
    dhyana: z.ZodOptional<z.ZodObject<{
        breath: z.ZodOptional<z.ZodObject<{
            cadence: z.ZodOptional<z.ZodEnum<["slow", "medium", "none"]>>;
        }, "strip", z.ZodTypeAny, {
            cadence?: "slow" | "medium" | "none" | undefined;
        }, {
            cadence?: "slow" | "medium" | "none" | undefined;
        }>>;
        fadeInMs: z.ZodOptional<z.ZodNumber>;
        fadeOutMs: z.ZodOptional<z.ZodNumber>;
        volumeCeiling: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        breath?: {
            cadence?: "slow" | "medium" | "none" | undefined;
        } | undefined;
        fadeInMs?: number | undefined;
        fadeOutMs?: number | undefined;
        volumeCeiling?: number | undefined;
    }, {
        breath?: {
            cadence?: "slow" | "medium" | "none" | undefined;
        } | undefined;
        fadeInMs?: number | undefined;
        fadeOutMs?: number | undefined;
        volumeCeiling?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    version: 1;
    device?: {
        preferActive?: boolean | undefined;
        deviceId?: string | null | undefined;
    } | undefined;
    mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
    durationMs?: number | undefined;
    queue?: {
        target?: number | undefined;
        refillWhenBelow?: number | undefined;
    } | undefined;
    hard?: {
        noVocals?: boolean | undefined;
        explicit?: "allow" | "avoid" | "require" | undefined;
        tempo?: {
            min?: number | undefined;
            max?: number | undefined;
        } | undefined;
        energy?: {
            min?: number | undefined;
            max?: number | undefined;
        } | undefined;
        instrumentalnessMin?: number | undefined;
    } | undefined;
    soft?: {
        weights?: {
            tempo?: number | undefined;
            energy?: number | undefined;
            instrumentalness?: number | undefined;
            speechiness?: number | undefined;
            valence?: number | undefined;
            acousticness?: number | undefined;
            recencyPenalty?: number | undefined;
        } | undefined;
        arc?: {
            shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
            warmupMs?: number | undefined;
            cooldownMs?: number | undefined;
        } | undefined;
    } | undefined;
    sources?: {
        likedTracks?: boolean | undefined;
        topTracks?: boolean | undefined;
        recentPlays?: boolean | undefined;
        seedPlaylists?: string[] | undefined;
        seedArtists?: string[] | undefined;
        discovery?: {
            enabled?: boolean | undefined;
            ratio?: number | undefined;
        } | undefined;
    } | undefined;
    limits?: {
        repeatTrackWithinDays?: number | undefined;
        repeatArtistWithinHours?: number | undefined;
    } | undefined;
    dhyana?: {
        breath?: {
            cadence?: "slow" | "medium" | "none" | undefined;
        } | undefined;
        fadeInMs?: number | undefined;
        fadeOutMs?: number | undefined;
        volumeCeiling?: number | undefined;
    } | undefined;
}, {
    version: 1;
    device?: {
        preferActive?: boolean | undefined;
        deviceId?: string | null | undefined;
    } | undefined;
    mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
    durationMs?: number | undefined;
    queue?: {
        target?: number | undefined;
        refillWhenBelow?: number | undefined;
    } | undefined;
    hard?: {
        noVocals?: boolean | undefined;
        explicit?: "allow" | "avoid" | "require" | undefined;
        tempo?: {
            min?: number | undefined;
            max?: number | undefined;
        } | undefined;
        energy?: {
            min?: number | undefined;
            max?: number | undefined;
        } | undefined;
        instrumentalnessMin?: number | undefined;
    } | undefined;
    soft?: {
        weights?: {
            tempo?: number | undefined;
            energy?: number | undefined;
            instrumentalness?: number | undefined;
            speechiness?: number | undefined;
            valence?: number | undefined;
            acousticness?: number | undefined;
            recencyPenalty?: number | undefined;
        } | undefined;
        arc?: {
            shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
            warmupMs?: number | undefined;
            cooldownMs?: number | undefined;
        } | undefined;
    } | undefined;
    sources?: {
        likedTracks?: boolean | undefined;
        topTracks?: boolean | undefined;
        recentPlays?: boolean | undefined;
        seedPlaylists?: string[] | undefined;
        seedArtists?: string[] | undefined;
        discovery?: {
            enabled?: boolean | undefined;
            ratio?: number | undefined;
        } | undefined;
    } | undefined;
    limits?: {
        repeatTrackWithinDays?: number | undefined;
        repeatArtistWithinHours?: number | undefined;
    } | undefined;
    dhyana?: {
        breath?: {
            cadence?: "slow" | "medium" | "none" | undefined;
        } | undefined;
        fadeInMs?: number | undefined;
        fadeOutMs?: number | undefined;
        volumeCeiling?: number | undefined;
    } | undefined;
}>;
export type SessionPolicy = z.infer<typeof SessionPolicy>;
/** Session start command */
export declare const SessionStartCommand: z.ZodObject<{
    policy: z.ZodObject<{
        version: z.ZodLiteral<1>;
        mode: z.ZodOptional<z.ZodEnum<["focus", "relax", "energize", "meditate", "workout", "custom"]>>;
        durationMs: z.ZodOptional<z.ZodNumber>;
        device: z.ZodOptional<z.ZodObject<{
            preferActive: z.ZodOptional<z.ZodBoolean>;
            deviceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        }, {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        }>>;
        queue: z.ZodOptional<z.ZodObject<{
            target: z.ZodOptional<z.ZodNumber>;
            refillWhenBelow: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        }, {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        }>>;
        hard: z.ZodOptional<z.ZodObject<{
            noVocals: z.ZodOptional<z.ZodBoolean>;
            explicit: z.ZodOptional<z.ZodEnum<["allow", "avoid", "require"]>>;
            tempo: z.ZodOptional<z.ZodObject<{
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                min?: number | undefined;
                max?: number | undefined;
            }, {
                min?: number | undefined;
                max?: number | undefined;
            }>>;
            energy: z.ZodOptional<z.ZodObject<{
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                min?: number | undefined;
                max?: number | undefined;
            }, {
                min?: number | undefined;
                max?: number | undefined;
            }>>;
            instrumentalnessMin: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        }, {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        }>>;
        soft: z.ZodOptional<z.ZodObject<{
            weights: z.ZodOptional<z.ZodObject<{
                energy: z.ZodOptional<z.ZodNumber>;
                instrumentalness: z.ZodOptional<z.ZodNumber>;
                speechiness: z.ZodOptional<z.ZodNumber>;
                valence: z.ZodOptional<z.ZodNumber>;
                acousticness: z.ZodOptional<z.ZodNumber>;
                tempo: z.ZodOptional<z.ZodNumber>;
                recencyPenalty: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            }, {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            }>>;
            arc: z.ZodOptional<z.ZodObject<{
                shape: z.ZodOptional<z.ZodEnum<["flat", "ramp-up", "ramp-down", "wave"]>>;
                warmupMs: z.ZodOptional<z.ZodNumber>;
                cooldownMs: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            }, {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        }, {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        }>>;
        sources: z.ZodOptional<z.ZodObject<{
            likedTracks: z.ZodOptional<z.ZodBoolean>;
            topTracks: z.ZodOptional<z.ZodBoolean>;
            recentPlays: z.ZodOptional<z.ZodBoolean>;
            seedPlaylists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            seedArtists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            discovery: z.ZodOptional<z.ZodObject<{
                enabled: z.ZodOptional<z.ZodBoolean>;
                ratio: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            }, {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        }, {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        }>>;
        limits: z.ZodOptional<z.ZodObject<{
            repeatTrackWithinDays: z.ZodOptional<z.ZodNumber>;
            repeatArtistWithinHours: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        }, {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        }>>;
        dhyana: z.ZodOptional<z.ZodObject<{
            breath: z.ZodOptional<z.ZodObject<{
                cadence: z.ZodOptional<z.ZodEnum<["slow", "medium", "none"]>>;
            }, "strip", z.ZodTypeAny, {
                cadence?: "slow" | "medium" | "none" | undefined;
            }, {
                cadence?: "slow" | "medium" | "none" | undefined;
            }>>;
            fadeInMs: z.ZodOptional<z.ZodNumber>;
            fadeOutMs: z.ZodOptional<z.ZodNumber>;
            volumeCeiling: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        }, {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        version: 1;
        device?: {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        } | undefined;
        mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
        durationMs?: number | undefined;
        queue?: {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        } | undefined;
        hard?: {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        } | undefined;
        soft?: {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        } | undefined;
        sources?: {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        } | undefined;
        limits?: {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        } | undefined;
        dhyana?: {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        } | undefined;
    }, {
        version: 1;
        device?: {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        } | undefined;
        mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
        durationMs?: number | undefined;
        queue?: {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        } | undefined;
        hard?: {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        } | undefined;
        soft?: {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        } | undefined;
        sources?: {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        } | undefined;
        limits?: {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        } | undefined;
        dhyana?: {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    policy: {
        version: 1;
        device?: {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        } | undefined;
        mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
        durationMs?: number | undefined;
        queue?: {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        } | undefined;
        hard?: {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        } | undefined;
        soft?: {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        } | undefined;
        sources?: {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        } | undefined;
        limits?: {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        } | undefined;
        dhyana?: {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        } | undefined;
    };
}, {
    policy: {
        version: 1;
        device?: {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        } | undefined;
        mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
        durationMs?: number | undefined;
        queue?: {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        } | undefined;
        hard?: {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        } | undefined;
        soft?: {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        } | undefined;
        sources?: {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        } | undefined;
        limits?: {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        } | undefined;
        dhyana?: {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        } | undefined;
    };
}>;
export type SessionStartCommand = z.infer<typeof SessionStartCommand>;
/** Session nudge command */
export declare const SessionNudgeCommand: z.ZodObject<{
    direction: z.ZodEnum<["calmer", "sharper"]>;
    amount: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    direction: "calmer" | "sharper";
    amount?: number | undefined;
    reason?: string | undefined;
}, {
    direction: "calmer" | "sharper";
    amount?: number | undefined;
    reason?: string | undefined;
}>;
export type SessionNudgeCommand = z.infer<typeof SessionNudgeCommand>;
/** Skip command */
export declare const SkipCommand: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
export type SkipCommand = z.infer<typeof SkipCommand>;
/** Device use command */
export declare const DeviceUseCommand: z.ZodObject<{
    deviceId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    deviceId: string;
}, {
    deviceId: string;
}>;
export type DeviceUseCommand = z.infer<typeof DeviceUseCommand>;
/** Command envelope */
export declare const Command: z.ZodObject<{
    id: z.ZodString;
    ts: z.ZodNumber;
    source: z.ZodObject<{
        kind: z.ZodEnum<["cli", "menubar", "voice"]>;
        device: z.ZodEnum<["macos", "windows", "wsl", "linux"]>;
    }, "strip", z.ZodTypeAny, {
        kind: "cli" | "menubar" | "voice";
        device: "macos" | "windows" | "wsl" | "linux";
    }, {
        kind: "cli" | "menubar" | "voice";
        device: "macos" | "windows" | "wsl" | "linux";
    }>;
    type: z.ZodEnum<["session.start", "session.stop", "session.nudge", "skip", "device.use", "device.discover", "auth.spotify.login", "auth.spotify.logout"]>;
    payload: z.ZodUnion<[z.ZodObject<{
        policy: z.ZodObject<{
            version: z.ZodLiteral<1>;
            mode: z.ZodOptional<z.ZodEnum<["focus", "relax", "energize", "meditate", "workout", "custom"]>>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            device: z.ZodOptional<z.ZodObject<{
                preferActive: z.ZodOptional<z.ZodBoolean>;
                deviceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            }, {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            }>>;
            queue: z.ZodOptional<z.ZodObject<{
                target: z.ZodOptional<z.ZodNumber>;
                refillWhenBelow: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            }, {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            }>>;
            hard: z.ZodOptional<z.ZodObject<{
                noVocals: z.ZodOptional<z.ZodBoolean>;
                explicit: z.ZodOptional<z.ZodEnum<["allow", "avoid", "require"]>>;
                tempo: z.ZodOptional<z.ZodObject<{
                    min: z.ZodOptional<z.ZodNumber>;
                    max: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    min?: number | undefined;
                    max?: number | undefined;
                }, {
                    min?: number | undefined;
                    max?: number | undefined;
                }>>;
                energy: z.ZodOptional<z.ZodObject<{
                    min: z.ZodOptional<z.ZodNumber>;
                    max: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    min?: number | undefined;
                    max?: number | undefined;
                }, {
                    min?: number | undefined;
                    max?: number | undefined;
                }>>;
                instrumentalnessMin: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            }, {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            }>>;
            soft: z.ZodOptional<z.ZodObject<{
                weights: z.ZodOptional<z.ZodObject<{
                    energy: z.ZodOptional<z.ZodNumber>;
                    instrumentalness: z.ZodOptional<z.ZodNumber>;
                    speechiness: z.ZodOptional<z.ZodNumber>;
                    valence: z.ZodOptional<z.ZodNumber>;
                    acousticness: z.ZodOptional<z.ZodNumber>;
                    tempo: z.ZodOptional<z.ZodNumber>;
                    recencyPenalty: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                }, {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                }>>;
                arc: z.ZodOptional<z.ZodObject<{
                    shape: z.ZodOptional<z.ZodEnum<["flat", "ramp-up", "ramp-down", "wave"]>>;
                    warmupMs: z.ZodOptional<z.ZodNumber>;
                    cooldownMs: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                }, {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                }>>;
            }, "strip", z.ZodTypeAny, {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            }, {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            }>>;
            sources: z.ZodOptional<z.ZodObject<{
                likedTracks: z.ZodOptional<z.ZodBoolean>;
                topTracks: z.ZodOptional<z.ZodBoolean>;
                recentPlays: z.ZodOptional<z.ZodBoolean>;
                seedPlaylists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                seedArtists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                discovery: z.ZodOptional<z.ZodObject<{
                    enabled: z.ZodOptional<z.ZodBoolean>;
                    ratio: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                }, {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                }>>;
            }, "strip", z.ZodTypeAny, {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            }, {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            }>>;
            limits: z.ZodOptional<z.ZodObject<{
                repeatTrackWithinDays: z.ZodOptional<z.ZodNumber>;
                repeatArtistWithinHours: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            }, {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            }>>;
            dhyana: z.ZodOptional<z.ZodObject<{
                breath: z.ZodOptional<z.ZodObject<{
                    cadence: z.ZodOptional<z.ZodEnum<["slow", "medium", "none"]>>;
                }, "strip", z.ZodTypeAny, {
                    cadence?: "slow" | "medium" | "none" | undefined;
                }, {
                    cadence?: "slow" | "medium" | "none" | undefined;
                }>>;
                fadeInMs: z.ZodOptional<z.ZodNumber>;
                fadeOutMs: z.ZodOptional<z.ZodNumber>;
                volumeCeiling: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            }, {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        }, {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        policy: {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        };
    }, {
        policy: {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        };
    }>, z.ZodObject<{
        direction: z.ZodEnum<["calmer", "sharper"]>;
        amount: z.ZodOptional<z.ZodNumber>;
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        direction: "calmer" | "sharper";
        amount?: number | undefined;
        reason?: string | undefined;
    }, {
        direction: "calmer" | "sharper";
        amount?: number | undefined;
        reason?: string | undefined;
    }>, z.ZodObject<{
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        reason?: string | undefined;
    }, {
        reason?: string | undefined;
    }>, z.ZodObject<{
        deviceId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        deviceId: string;
    }, {
        deviceId: string;
    }>, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>]>;
}, "strip", z.ZodTypeAny, {
    type: "session.start" | "session.stop" | "session.nudge" | "skip" | "device.use" | "device.discover" | "auth.spotify.login" | "auth.spotify.logout";
    id: string;
    ts: number;
    source: {
        kind: "cli" | "menubar" | "voice";
        device: "macos" | "windows" | "wsl" | "linux";
    };
    payload: {
        policy: {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        };
    } | {
        direction: "calmer" | "sharper";
        amount?: number | undefined;
        reason?: string | undefined;
    } | {
        reason?: string | undefined;
    } | {
        deviceId: string;
    } | {};
}, {
    type: "session.start" | "session.stop" | "session.nudge" | "skip" | "device.use" | "device.discover" | "auth.spotify.login" | "auth.spotify.logout";
    id: string;
    ts: number;
    source: {
        kind: "cli" | "menubar" | "voice";
        device: "macos" | "windows" | "wsl" | "linux";
    };
    payload: {
        policy: {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        };
    } | {
        direction: "calmer" | "sharper";
        amount?: number | undefined;
        reason?: string | undefined;
    } | {
        reason?: string | undefined;
    } | {
        deviceId: string;
    } | {};
}>;
export type Command = z.infer<typeof Command>;
/** Track information */
export declare const TrackInfo: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    artist: z.ZodString;
    album: z.ZodString;
    durationMs: z.ZodNumber;
    uri: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    durationMs: number;
    id: string;
    name: string;
    artist: string;
    album: string;
    uri?: string | undefined;
}, {
    durationMs: number;
    id: string;
    name: string;
    artist: string;
    album: string;
    uri?: string | undefined;
}>;
export type TrackInfo = z.infer<typeof TrackInfo>;
/** Device information */
export declare const DeviceInfo: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<["speaker", "computer", "phone", "tablet", "tv", "cast", "unknown"]>;
    isActive: z.ZodBoolean;
    volumePercent: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "unknown" | "speaker" | "computer" | "phone" | "tablet" | "tv" | "cast";
    id: string;
    name: string;
    isActive: boolean;
    volumePercent?: number | undefined;
}, {
    type: "unknown" | "speaker" | "computer" | "phone" | "tablet" | "tv" | "cast";
    id: string;
    name: string;
    isActive: boolean;
    volumePercent?: number | undefined;
}>;
export type DeviceInfo = z.infer<typeof DeviceInfo>;
/** Session status */
export declare const SessionStatus: z.ZodObject<{
    id: z.ZodString;
    isActive: z.ZodBoolean;
    policy: z.ZodOptional<z.ZodObject<{
        version: z.ZodLiteral<1>;
        mode: z.ZodOptional<z.ZodEnum<["focus", "relax", "energize", "meditate", "workout", "custom"]>>;
        durationMs: z.ZodOptional<z.ZodNumber>;
        device: z.ZodOptional<z.ZodObject<{
            preferActive: z.ZodOptional<z.ZodBoolean>;
            deviceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        }, {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        }>>;
        queue: z.ZodOptional<z.ZodObject<{
            target: z.ZodOptional<z.ZodNumber>;
            refillWhenBelow: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        }, {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        }>>;
        hard: z.ZodOptional<z.ZodObject<{
            noVocals: z.ZodOptional<z.ZodBoolean>;
            explicit: z.ZodOptional<z.ZodEnum<["allow", "avoid", "require"]>>;
            tempo: z.ZodOptional<z.ZodObject<{
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                min?: number | undefined;
                max?: number | undefined;
            }, {
                min?: number | undefined;
                max?: number | undefined;
            }>>;
            energy: z.ZodOptional<z.ZodObject<{
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                min?: number | undefined;
                max?: number | undefined;
            }, {
                min?: number | undefined;
                max?: number | undefined;
            }>>;
            instrumentalnessMin: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        }, {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        }>>;
        soft: z.ZodOptional<z.ZodObject<{
            weights: z.ZodOptional<z.ZodObject<{
                energy: z.ZodOptional<z.ZodNumber>;
                instrumentalness: z.ZodOptional<z.ZodNumber>;
                speechiness: z.ZodOptional<z.ZodNumber>;
                valence: z.ZodOptional<z.ZodNumber>;
                acousticness: z.ZodOptional<z.ZodNumber>;
                tempo: z.ZodOptional<z.ZodNumber>;
                recencyPenalty: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            }, {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            }>>;
            arc: z.ZodOptional<z.ZodObject<{
                shape: z.ZodOptional<z.ZodEnum<["flat", "ramp-up", "ramp-down", "wave"]>>;
                warmupMs: z.ZodOptional<z.ZodNumber>;
                cooldownMs: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            }, {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        }, {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        }>>;
        sources: z.ZodOptional<z.ZodObject<{
            likedTracks: z.ZodOptional<z.ZodBoolean>;
            topTracks: z.ZodOptional<z.ZodBoolean>;
            recentPlays: z.ZodOptional<z.ZodBoolean>;
            seedPlaylists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            seedArtists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            discovery: z.ZodOptional<z.ZodObject<{
                enabled: z.ZodOptional<z.ZodBoolean>;
                ratio: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            }, {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        }, {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        }>>;
        limits: z.ZodOptional<z.ZodObject<{
            repeatTrackWithinDays: z.ZodOptional<z.ZodNumber>;
            repeatArtistWithinHours: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        }, {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        }>>;
        dhyana: z.ZodOptional<z.ZodObject<{
            breath: z.ZodOptional<z.ZodObject<{
                cadence: z.ZodOptional<z.ZodEnum<["slow", "medium", "none"]>>;
            }, "strip", z.ZodTypeAny, {
                cadence?: "slow" | "medium" | "none" | undefined;
            }, {
                cadence?: "slow" | "medium" | "none" | undefined;
            }>>;
            fadeInMs: z.ZodOptional<z.ZodNumber>;
            fadeOutMs: z.ZodOptional<z.ZodNumber>;
            volumeCeiling: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        }, {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        version: 1;
        device?: {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        } | undefined;
        mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
        durationMs?: number | undefined;
        queue?: {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        } | undefined;
        hard?: {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        } | undefined;
        soft?: {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        } | undefined;
        sources?: {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        } | undefined;
        limits?: {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        } | undefined;
        dhyana?: {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        } | undefined;
    }, {
        version: 1;
        device?: {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        } | undefined;
        mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
        durationMs?: number | undefined;
        queue?: {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        } | undefined;
        hard?: {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        } | undefined;
        soft?: {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        } | undefined;
        sources?: {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        } | undefined;
        limits?: {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        } | undefined;
        dhyana?: {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        } | undefined;
    }>>;
    currentTrack: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        artist: z.ZodString;
        album: z.ZodString;
        durationMs: z.ZodNumber;
        uri: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        durationMs: number;
        id: string;
        name: string;
        artist: string;
        album: string;
        uri?: string | undefined;
    }, {
        durationMs: number;
        id: string;
        name: string;
        artist: string;
        album: string;
        uri?: string | undefined;
    }>>;
    queueDepth: z.ZodNumber;
    elapsedMs: z.ZodOptional<z.ZodNumber>;
    startedAt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    isActive: boolean;
    currentTrack: {
        durationMs: number;
        id: string;
        name: string;
        artist: string;
        album: string;
        uri?: string | undefined;
    } | null;
    queueDepth: number;
    policy?: {
        version: 1;
        device?: {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        } | undefined;
        mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
        durationMs?: number | undefined;
        queue?: {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        } | undefined;
        hard?: {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        } | undefined;
        soft?: {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        } | undefined;
        sources?: {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        } | undefined;
        limits?: {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        } | undefined;
        dhyana?: {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        } | undefined;
    } | undefined;
    elapsedMs?: number | undefined;
    startedAt?: number | undefined;
}, {
    id: string;
    isActive: boolean;
    currentTrack: {
        durationMs: number;
        id: string;
        name: string;
        artist: string;
        album: string;
        uri?: string | undefined;
    } | null;
    queueDepth: number;
    policy?: {
        version: 1;
        device?: {
            preferActive?: boolean | undefined;
            deviceId?: string | null | undefined;
        } | undefined;
        mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
        durationMs?: number | undefined;
        queue?: {
            target?: number | undefined;
            refillWhenBelow?: number | undefined;
        } | undefined;
        hard?: {
            noVocals?: boolean | undefined;
            explicit?: "allow" | "avoid" | "require" | undefined;
            tempo?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            energy?: {
                min?: number | undefined;
                max?: number | undefined;
            } | undefined;
            instrumentalnessMin?: number | undefined;
        } | undefined;
        soft?: {
            weights?: {
                tempo?: number | undefined;
                energy?: number | undefined;
                instrumentalness?: number | undefined;
                speechiness?: number | undefined;
                valence?: number | undefined;
                acousticness?: number | undefined;
                recencyPenalty?: number | undefined;
            } | undefined;
            arc?: {
                shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                warmupMs?: number | undefined;
                cooldownMs?: number | undefined;
            } | undefined;
        } | undefined;
        sources?: {
            likedTracks?: boolean | undefined;
            topTracks?: boolean | undefined;
            recentPlays?: boolean | undefined;
            seedPlaylists?: string[] | undefined;
            seedArtists?: string[] | undefined;
            discovery?: {
                enabled?: boolean | undefined;
                ratio?: number | undefined;
            } | undefined;
        } | undefined;
        limits?: {
            repeatTrackWithinDays?: number | undefined;
            repeatArtistWithinHours?: number | undefined;
        } | undefined;
        dhyana?: {
            breath?: {
                cadence?: "slow" | "medium" | "none" | undefined;
            } | undefined;
            fadeInMs?: number | undefined;
            fadeOutMs?: number | undefined;
            volumeCeiling?: number | undefined;
        } | undefined;
    } | undefined;
    elapsedMs?: number | undefined;
    startedAt?: number | undefined;
}>;
export type SessionStatus = z.infer<typeof SessionStatus>;
/** Daemon status */
export declare const DaemonStatus: z.ZodObject<{
    isRunning: z.ZodBoolean;
    version: z.ZodString;
    spotifyConnected: z.ZodBoolean;
    session: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        isActive: z.ZodBoolean;
        policy: z.ZodOptional<z.ZodObject<{
            version: z.ZodLiteral<1>;
            mode: z.ZodOptional<z.ZodEnum<["focus", "relax", "energize", "meditate", "workout", "custom"]>>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            device: z.ZodOptional<z.ZodObject<{
                preferActive: z.ZodOptional<z.ZodBoolean>;
                deviceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            }, {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            }>>;
            queue: z.ZodOptional<z.ZodObject<{
                target: z.ZodOptional<z.ZodNumber>;
                refillWhenBelow: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            }, {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            }>>;
            hard: z.ZodOptional<z.ZodObject<{
                noVocals: z.ZodOptional<z.ZodBoolean>;
                explicit: z.ZodOptional<z.ZodEnum<["allow", "avoid", "require"]>>;
                tempo: z.ZodOptional<z.ZodObject<{
                    min: z.ZodOptional<z.ZodNumber>;
                    max: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    min?: number | undefined;
                    max?: number | undefined;
                }, {
                    min?: number | undefined;
                    max?: number | undefined;
                }>>;
                energy: z.ZodOptional<z.ZodObject<{
                    min: z.ZodOptional<z.ZodNumber>;
                    max: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    min?: number | undefined;
                    max?: number | undefined;
                }, {
                    min?: number | undefined;
                    max?: number | undefined;
                }>>;
                instrumentalnessMin: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            }, {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            }>>;
            soft: z.ZodOptional<z.ZodObject<{
                weights: z.ZodOptional<z.ZodObject<{
                    energy: z.ZodOptional<z.ZodNumber>;
                    instrumentalness: z.ZodOptional<z.ZodNumber>;
                    speechiness: z.ZodOptional<z.ZodNumber>;
                    valence: z.ZodOptional<z.ZodNumber>;
                    acousticness: z.ZodOptional<z.ZodNumber>;
                    tempo: z.ZodOptional<z.ZodNumber>;
                    recencyPenalty: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                }, {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                }>>;
                arc: z.ZodOptional<z.ZodObject<{
                    shape: z.ZodOptional<z.ZodEnum<["flat", "ramp-up", "ramp-down", "wave"]>>;
                    warmupMs: z.ZodOptional<z.ZodNumber>;
                    cooldownMs: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                }, {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                }>>;
            }, "strip", z.ZodTypeAny, {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            }, {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            }>>;
            sources: z.ZodOptional<z.ZodObject<{
                likedTracks: z.ZodOptional<z.ZodBoolean>;
                topTracks: z.ZodOptional<z.ZodBoolean>;
                recentPlays: z.ZodOptional<z.ZodBoolean>;
                seedPlaylists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                seedArtists: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                discovery: z.ZodOptional<z.ZodObject<{
                    enabled: z.ZodOptional<z.ZodBoolean>;
                    ratio: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                }, {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                }>>;
            }, "strip", z.ZodTypeAny, {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            }, {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            }>>;
            limits: z.ZodOptional<z.ZodObject<{
                repeatTrackWithinDays: z.ZodOptional<z.ZodNumber>;
                repeatArtistWithinHours: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            }, {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            }>>;
            dhyana: z.ZodOptional<z.ZodObject<{
                breath: z.ZodOptional<z.ZodObject<{
                    cadence: z.ZodOptional<z.ZodEnum<["slow", "medium", "none"]>>;
                }, "strip", z.ZodTypeAny, {
                    cadence?: "slow" | "medium" | "none" | undefined;
                }, {
                    cadence?: "slow" | "medium" | "none" | undefined;
                }>>;
                fadeInMs: z.ZodOptional<z.ZodNumber>;
                fadeOutMs: z.ZodOptional<z.ZodNumber>;
                volumeCeiling: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            }, {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        }, {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        }>>;
        currentTrack: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            artist: z.ZodString;
            album: z.ZodString;
            durationMs: z.ZodNumber;
            uri: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            durationMs: number;
            id: string;
            name: string;
            artist: string;
            album: string;
            uri?: string | undefined;
        }, {
            durationMs: number;
            id: string;
            name: string;
            artist: string;
            album: string;
            uri?: string | undefined;
        }>>;
        queueDepth: z.ZodNumber;
        elapsedMs: z.ZodOptional<z.ZodNumber>;
        startedAt: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        isActive: boolean;
        currentTrack: {
            durationMs: number;
            id: string;
            name: string;
            artist: string;
            album: string;
            uri?: string | undefined;
        } | null;
        queueDepth: number;
        policy?: {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        } | undefined;
        elapsedMs?: number | undefined;
        startedAt?: number | undefined;
    }, {
        id: string;
        isActive: boolean;
        currentTrack: {
            durationMs: number;
            id: string;
            name: string;
            artist: string;
            album: string;
            uri?: string | undefined;
        } | null;
        queueDepth: number;
        policy?: {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        } | undefined;
        elapsedMs?: number | undefined;
        startedAt?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    version: string;
    isRunning: boolean;
    spotifyConnected: boolean;
    session?: {
        id: string;
        isActive: boolean;
        currentTrack: {
            durationMs: number;
            id: string;
            name: string;
            artist: string;
            album: string;
            uri?: string | undefined;
        } | null;
        queueDepth: number;
        policy?: {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        } | undefined;
        elapsedMs?: number | undefined;
        startedAt?: number | undefined;
    } | undefined;
}, {
    version: string;
    isRunning: boolean;
    spotifyConnected: boolean;
    session?: {
        id: string;
        isActive: boolean;
        currentTrack: {
            durationMs: number;
            id: string;
            name: string;
            artist: string;
            album: string;
            uri?: string | undefined;
        } | null;
        queueDepth: number;
        policy?: {
            version: 1;
            device?: {
                preferActive?: boolean | undefined;
                deviceId?: string | null | undefined;
            } | undefined;
            mode?: "focus" | "relax" | "energize" | "meditate" | "workout" | "custom" | undefined;
            durationMs?: number | undefined;
            queue?: {
                target?: number | undefined;
                refillWhenBelow?: number | undefined;
            } | undefined;
            hard?: {
                noVocals?: boolean | undefined;
                explicit?: "allow" | "avoid" | "require" | undefined;
                tempo?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                energy?: {
                    min?: number | undefined;
                    max?: number | undefined;
                } | undefined;
                instrumentalnessMin?: number | undefined;
            } | undefined;
            soft?: {
                weights?: {
                    tempo?: number | undefined;
                    energy?: number | undefined;
                    instrumentalness?: number | undefined;
                    speechiness?: number | undefined;
                    valence?: number | undefined;
                    acousticness?: number | undefined;
                    recencyPenalty?: number | undefined;
                } | undefined;
                arc?: {
                    shape?: "flat" | "ramp-up" | "ramp-down" | "wave" | undefined;
                    warmupMs?: number | undefined;
                    cooldownMs?: number | undefined;
                } | undefined;
            } | undefined;
            sources?: {
                likedTracks?: boolean | undefined;
                topTracks?: boolean | undefined;
                recentPlays?: boolean | undefined;
                seedPlaylists?: string[] | undefined;
                seedArtists?: string[] | undefined;
                discovery?: {
                    enabled?: boolean | undefined;
                    ratio?: number | undefined;
                } | undefined;
            } | undefined;
            limits?: {
                repeatTrackWithinDays?: number | undefined;
                repeatArtistWithinHours?: number | undefined;
            } | undefined;
            dhyana?: {
                breath?: {
                    cadence?: "slow" | "medium" | "none" | undefined;
                } | undefined;
                fadeInMs?: number | undefined;
                fadeOutMs?: number | undefined;
                volumeCeiling?: number | undefined;
            } | undefined;
        } | undefined;
        elapsedMs?: number | undefined;
        startedAt?: number | undefined;
    } | undefined;
}>;
export type DaemonStatus = z.infer<typeof DaemonStatus>;
/** Event envelope */
export declare const Event: z.ZodObject<{
    id: z.ZodString;
    ts: z.ZodNumber;
    type: z.ZodEnum<["session.started", "session.stopped", "session.nudged", "track.started", "track.ended", "queue.refilled", "user.nudged", "device.discovered", "spotify.connected", "spotify.disconnected", "error"]>;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "session.started" | "session.stopped" | "session.nudged" | "track.started" | "track.ended" | "queue.refilled" | "user.nudged" | "device.discovered" | "spotify.connected" | "spotify.disconnected" | "error";
    id: string;
    ts: number;
    payload?: Record<string, unknown> | undefined;
}, {
    type: "session.started" | "session.stopped" | "session.nudged" | "track.started" | "track.ended" | "queue.refilled" | "user.nudged" | "device.discovered" | "spotify.connected" | "spotify.disconnected" | "error";
    id: string;
    ts: number;
    payload?: Record<string, unknown> | undefined;
}>;
export type Event = z.infer<typeof Event>;
export declare function validateCommand(data: unknown): Command;
export declare function validateEvent(data: unknown): Event;
export declare function validatePolicy(data: unknown): SessionPolicy;
export declare function parseCommandSafe(data: unknown): {
    success: true;
    data: Command;
} | {
    success: false;
    error: z.ZodError;
};
export declare function parseEventSafe(data: unknown): {
    success: true;
    data: Event;
} | {
    success: false;
    error: z.ZodError;
};
export declare function parsePolicySafe(data: unknown): {
    success: true;
    data: SessionPolicy;
} | {
    success: false;
    error: z.ZodError;
};
//# sourceMappingURL=index.d.ts.map