/**
 * Markdown Parser - Parse harmon-flow journal entries
 */
import type { JournalEntry } from '../types.js';
export interface FlowDirectoryConfig {
    path: string;
    recursive?: boolean;
}
export declare class MarkdownParser {
    private flowDir;
    constructor(config: FlowDirectoryConfig);
    /**
     * Parse a single markdown file into a JournalEntry
     */
    parseFile(filename: string): JournalEntry | null;
    /**
     * Parse frontmatter with defaults
     */
    private parseFrontmatter;
    /**
     * Scan directory for all markdown entries
     */
    scanDirectory(): JournalEntry[];
    /**
     * Scan files recursively
     */
    private scanFiles;
    /**
     * Extract mood tags from content (looking for **Mood:** or similar patterns)
     */
    private extractMoodTags;
    /**
     * Extract energy level from content
     */
    private extractEnergyLevel;
    /**
     * Extract ID from filename (format: YYYY-MM-DDTHH-MM-SS-uuid.md)
     */
    private extractIdFromFilename;
    /**
     * Write a new journal entry
     */
    writeEntry(entry: Omit<JournalEntry, 'id' | 'filename'>): string;
    /**
     * Get flow directory path
     */
    getFlowDir(): string;
}
/**
 * Create a parser for the default .harmonic-flow directory
 */
export declare function createFlowParser(flowDir?: string): MarkdownParser;
//# sourceMappingURL=index.d.ts.map