/**
 * Pattern Graph - Build and query graph-based patterns from journal entries
 */
import type { JournalEntry, PatternGraph, TimePattern, MoodEnergyPattern, PolicyPattern, Suggestion } from '../types.js';
export declare class PatternGraphBuilder {
    private graph;
    private entries;
    constructor(entries: JournalEntry[]);
    /**
     * Build the complete pattern graph from entries
     */
    build(): PatternGraph;
    /**
     * Add nodes for an entry
     */
    private addEntryNodes;
    /**
     * Add edges for an entry (temporal relationships)
     */
    private addEntryEdges;
    /**
     * Add a node to the graph
     */
    private addNode;
    /**
     * Add an edge to the graph
     */
    private addEdge;
    /**
     * Normalize edge weights by count
     */
    private normalizeEdgeWeights;
    /**
     * Find the previous entry in chronological order
     */
    private findPreviousEntry;
    private getNodeKey;
    /**
     * Get the built graph
     */
    getGraph(): PatternGraph;
}
/**
 * Pattern Detector - Extract high-level patterns from the graph
 */
export declare class PatternDetector {
    private graph;
    private entries;
    constructor(graph: PatternGraph, entries: JournalEntry[]);
    /**
     * Detect time-based patterns
     */
    detectTimePatterns(): TimePattern[];
    /**
     * Detect mood-energy transition patterns
     */
    detectMoodEnergyPatterns(): MoodEnergyPattern[];
    /**
     * Cluster similar policies to find patterns
     */
    detectPolicyPatterns(): PolicyPattern[];
    /**
     * Simple hash function for policy objects
     */
    private hashPolicy;
    /**
     * Get all detected patterns
     */
    getAllPatterns(): {
        timePatterns: TimePattern[];
        moodEnergyPatterns: MoodEnergyPattern[];
        policyPatterns: PolicyPattern[];
    };
}
/**
 * Suggestion Engine - Generate suggestions based on patterns
 */
export declare class SuggestionEngine {
    private graph;
    private entries;
    private timePatterns;
    private moodEnergyPatterns;
    private policyPatterns;
    constructor(graph: PatternGraph, entries: JournalEntry[]);
    /**
     * Generate suggestions based on current context
     */
    suggest(currentMood: string[], energy: 'low' | 'medium' | 'high', timeOfDay?: string): Suggestion[];
    /**
     * Get similar historical entries
     */
    findSimilarEntries(mood: string[], energy?: 'low' | 'medium' | 'high', limit?: number): Array<{
        entry: JournalEntry;
        similarity: number;
    }>;
    /**
     * Get pattern statistics
     */
    getStats(): {
        totalEntries: number;
        timePatterns: number;
        moodEnergyPatterns: number;
        policyPatterns: number;
        topMoodTags: {
            mood: string;
            count: number;
        }[];
        topEnergyLevels: {
            level: string;
            count: number;
        }[];
    };
    private getTopMoodTags;
    private getTopEnergyLevels;
}
//# sourceMappingURL=index.d.ts.map