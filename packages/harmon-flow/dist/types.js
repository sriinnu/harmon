/**
 * Harmon Flow Types - Journal entries, patterns, and graph structures
 */
import { z } from 'zod';
// ============================================================================
// Journal Entry Schema
// ============================================================================
export const MoodTagSchema = z.enum([
    'calm', 'energetic', 'focused', 'relaxed', 'stressed',
    'tired', 'happy', 'sad', 'creative', 'productive',
    'anxious', 'peaceful', 'excited', 'melancholic', 'neutral'
]);
export const EnergyLevelSchema = z.enum(['low', 'medium', 'high']);
export const SessionContextSchema = z.object({
    timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']).optional(),
    dayOfWeek: z.number().min(0).max(6).optional(),
    weather: z.string().optional(),
    activity: z.string().optional(),
});
export const JournalEntryFrontmatterSchema = z.object({
    ts: z.string().datetime(),
    source: z.enum(['cli', 'menubar', 'voice']),
    device: z.enum(['macos', 'windows', 'wsl', 'linux']),
    sessionId: z.string().optional(),
    policy: z.record(z.unknown()).optional(),
    moodTags: z.array(MoodTagSchema).optional(),
    energyLevel: EnergyLevelSchema.optional(),
    context: SessionContextSchema.optional(),
});
// ============================================================================
// Graph Node Types
// ============================================================================
export const NodeTypeSchema = z.enum([
    'mood', 'energy', 'time', 'activity', 'session_type',
    'policy_pattern', 'track', 'artist', 'device', 'source'
]);
//# sourceMappingURL=types.js.map