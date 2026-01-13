/**
 * Harmon Flow Types - Journal entries, patterns, and graph structures
 */
import { z } from 'zod';
export declare const MoodTagSchema: z.ZodEnum<["calm", "energetic", "focused", "relaxed", "stressed", "tired", "happy", "sad", "creative", "productive", "anxious", "peaceful", "excited", "melancholic", "neutral"]>;
export type MoodTag = z.infer<typeof MoodTagSchema>;
export declare const EnergyLevelSchema: z.ZodEnum<["low", "medium", "high"]>;
export type EnergyLevel = z.infer<typeof EnergyLevelSchema>;
export declare const SessionContextSchema: z.ZodObject<{
    timeOfDay: z.ZodOptional<z.ZodEnum<["morning", "afternoon", "evening", "night"]>>;
    dayOfWeek: z.ZodOptional<z.ZodNumber>;
    weather: z.ZodOptional<z.ZodString>;
    activity: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    timeOfDay?: "morning" | "afternoon" | "evening" | "night" | undefined;
    dayOfWeek?: number | undefined;
    weather?: string | undefined;
    activity?: string | undefined;
}, {
    timeOfDay?: "morning" | "afternoon" | "evening" | "night" | undefined;
    dayOfWeek?: number | undefined;
    weather?: string | undefined;
    activity?: string | undefined;
}>;
export type SessionContext = z.infer<typeof SessionContextSchema>;
export declare const JournalEntryFrontmatterSchema: z.ZodObject<{
    ts: z.ZodString;
    source: z.ZodEnum<["cli", "menubar", "voice"]>;
    device: z.ZodEnum<["macos", "windows", "wsl", "linux"]>;
    sessionId: z.ZodOptional<z.ZodString>;
    policy: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    moodTags: z.ZodOptional<z.ZodArray<z.ZodEnum<["calm", "energetic", "focused", "relaxed", "stressed", "tired", "happy", "sad", "creative", "productive", "anxious", "peaceful", "excited", "melancholic", "neutral"]>, "many">>;
    energyLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    context: z.ZodOptional<z.ZodObject<{
        timeOfDay: z.ZodOptional<z.ZodEnum<["morning", "afternoon", "evening", "night"]>>;
        dayOfWeek: z.ZodOptional<z.ZodNumber>;
        weather: z.ZodOptional<z.ZodString>;
        activity: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        timeOfDay?: "morning" | "afternoon" | "evening" | "night" | undefined;
        dayOfWeek?: number | undefined;
        weather?: string | undefined;
        activity?: string | undefined;
    }, {
        timeOfDay?: "morning" | "afternoon" | "evening" | "night" | undefined;
        dayOfWeek?: number | undefined;
        weather?: string | undefined;
        activity?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    ts: string;
    source: "cli" | "menubar" | "voice";
    device: "macos" | "windows" | "wsl" | "linux";
    sessionId?: string | undefined;
    policy?: Record<string, unknown> | undefined;
    moodTags?: ("calm" | "energetic" | "focused" | "relaxed" | "stressed" | "tired" | "happy" | "sad" | "creative" | "productive" | "anxious" | "peaceful" | "excited" | "melancholic" | "neutral")[] | undefined;
    energyLevel?: "low" | "medium" | "high" | undefined;
    context?: {
        timeOfDay?: "morning" | "afternoon" | "evening" | "night" | undefined;
        dayOfWeek?: number | undefined;
        weather?: string | undefined;
        activity?: string | undefined;
    } | undefined;
}, {
    ts: string;
    source: "cli" | "menubar" | "voice";
    device: "macos" | "windows" | "wsl" | "linux";
    sessionId?: string | undefined;
    policy?: Record<string, unknown> | undefined;
    moodTags?: ("calm" | "energetic" | "focused" | "relaxed" | "stressed" | "tired" | "happy" | "sad" | "creative" | "productive" | "anxious" | "peaceful" | "excited" | "melancholic" | "neutral")[] | undefined;
    energyLevel?: "low" | "medium" | "high" | undefined;
    context?: {
        timeOfDay?: "morning" | "afternoon" | "evening" | "night" | undefined;
        dayOfWeek?: number | undefined;
        weather?: string | undefined;
        activity?: string | undefined;
    } | undefined;
}>;
export type JournalEntryFrontmatter = z.infer<typeof JournalEntryFrontmatterSchema>;
export interface JournalEntry {
    id: string;
    filename: string;
    timestamp: Date;
    source: 'cli' | 'menubar' | 'voice';
    device: 'macos' | 'windows' | 'wsl' | 'linux';
    sessionId?: string;
    policy?: Record<string, unknown>;
    moodTags: string[];
    energyLevel?: 'low' | 'medium' | 'high';
    context?: SessionContext;
    content: string;
    embedding?: number[];
}
export declare const NodeTypeSchema: z.ZodEnum<["mood", "energy", "time", "activity", "session_type", "policy_pattern", "track", "artist", "device", "source"]>;
export type NodeType = z.infer<typeof NodeTypeSchema>;
export interface GraphNode {
    id: string;
    type: NodeType;
    label: string;
    properties: Record<string, unknown>;
    weight: number;
    embedding?: number[];
}
export interface GraphEdge {
    source: string;
    target: string;
    relationship: string;
    weight: number;
    count: number;
}
export interface PatternGraph {
    nodes: Map<string, GraphNode>;
    edges: Map<string, GraphEdge>;
    embeddings: Map<string, number[]>;
}
export interface TimePattern {
    timeOfDay: string;
    commonMoods: string[];
    commonEnergy: 'low' | 'medium' | 'high';
    avgSessionDuration: number;
    frequency: number;
}
export interface MoodEnergyPattern {
    mood: string;
    energy: 'low' | 'medium' | 'high';
    nextMood?: string;
    transitionProbability: number;
    commonActivities: string[];
}
export interface PolicyPattern {
    patternId: string;
    moodTags: string[];
    energyLevel?: 'low' | 'medium' | 'high';
    typicalDuration: number;
    hardConstraints: Record<string, unknown>;
    softWeights: Record<string, number>;
    usageCount: number;
    avgSatisfaction?: number;
}
export interface Suggestion {
    id: string;
    type: 'session' | 'policy' | 'mood_shift';
    confidence: number;
    reasoning: string;
    suggestedPolicy?: Record<string, unknown>;
    moodTags?: string[];
    energyLevel?: 'low' | 'medium' | 'high';
    basedOnEntries: string[];
}
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export interface ToolHandler {
    (args: Record<string, unknown>): Promise<{
        content: Array<{
            type: string;
            text: string;
        }>;
    }>;
}
//# sourceMappingURL=types.d.ts.map