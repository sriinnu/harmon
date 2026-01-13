/**
 * Harmon Flow MCP Server - Local MCP server for journal-based pattern detection
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
interface FlowServerConfig {
    flowDir?: string;
    name?: string;
    version?: string;
}
export declare class HarmonFlowMCPServer {
    private server;
    private parser;
    private entries;
    private graphBuilt;
    private suggestionEngine;
    constructor(config?: FlowServerConfig);
    /**
     * Set up request handlers
     */
    private setupHandlers;
    /**
     * Refresh entries from disk
     */
    private refreshEntries;
    /**
     * Build the graph if not already built
     */
    private ensureGraphBuilt;
    /**
     * Get all tool definitions
     */
    private getToolDefinitions;
    /**
     * Get tool handler by name
     */
    private getToolHandler;
    /**
     * Handle get_suggestions tool
     */
    private handleGetSuggestions;
    /**
     * Handle find_similar_sessions tool
     */
    private handleFindSimilarSessions;
    /**
     * Handle get_patterns tool
     */
    private handleGetPatterns;
    /**
     * Handle get_stats tool
     */
    private handleGetStats;
    /**
     * Handle get_entries tool
     */
    private handleGetEntries;
    /**
     * Handle write_entry tool
     */
    private handleWriteEntry;
    /**
     * Handle analyze_mood_trends tool
     */
    private handleAnalyzeMoodTrends;
    /**
     * Handle get_graph tool
     */
    private handleGetGraph;
    /**
     * Format entry for display
     */
    private formatEntryForDisplay;
    /**
     * Start the MCP server
     */
    start(): Promise<void>;
    /**
     * Get server instance
     */
    getServer(): Server;
}
/**
 * Create and start the MCP server
 */
export declare function createMCPServer(config?: FlowServerConfig): Promise<HarmonFlowMCPServer>;
export {};
//# sourceMappingURL=index.d.ts.map