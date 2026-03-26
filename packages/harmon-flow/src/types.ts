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

export type MoodTag = z.infer<typeof MoodTagSchema>;

export const EnergyLevelSchema = z.enum(['low', 'medium', 'high']);
export type EnergyLevel = z.infer<typeof EnergyLevelSchema>;
export const EntrySourceSchema = z.enum(['cli', 'menubar', 'voice', 'mcp']);
export type EntrySource = z.infer<typeof EntrySourceSchema>;

export const SessionContextSchema = z.object({
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  weather: z.string().optional(),
  activity: z.string().optional(),
});

export type SessionContext = z.infer<typeof SessionContextSchema>;

export const JournalEntryFrontmatterSchema = z.object({
  ts: z.string().datetime(),
  source: EntrySourceSchema,
  device: z.enum(['macos', 'windows', 'wsl', 'linux']),
  sessionId: z.string().optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  moodTags: z.array(MoodTagSchema).optional(),
  energyLevel: EnergyLevelSchema.optional(),
  context: SessionContextSchema.optional(),
});

export type JournalEntryFrontmatter = z.infer<typeof JournalEntryFrontmatterSchema>;

export interface JournalEntry {
  id: string;
  filename: string;
  timestamp: Date;
  source: EntrySource;
  device: 'macos' | 'windows' | 'wsl' | 'linux';
  sessionId?: string;
  policy?: Record<string, unknown>;
  moodTags: string[];
  energyLevel?: 'low' | 'medium' | 'high';
  context?: SessionContext;
  content: string;
  embedding?: number[];
}

// ============================================================================
// Graph Node Types
// ============================================================================

export const NodeTypeSchema = z.enum([
  'mood', 'energy', 'time', 'activity', 'session_type',
  'policy_pattern', 'track', 'artist', 'device', 'source'
]);

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

// ============================================================================
// Pattern Detection Types
// ============================================================================

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

// ============================================================================
// MCP Tool Types
// ============================================================================

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
  (args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }>;
}
