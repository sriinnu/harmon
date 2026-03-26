/**
 * Harmon Flow MCP Server - Local MCP server for journal-based pattern detection
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MarkdownParser, createFlowParser } from '../parser/index.js';
import { PatternGraphBuilder, PatternDetector, SuggestionEngine } from '../graph/index.js';
import type { ToolDefinition, ToolHandler, JournalEntry, PatternGraph } from '../types.js';

interface FlowServerConfig {
  flowDir?: string;
  name?: string;
  version?: string;
}

export class HarmonFlowMCPServer {
  private server: Server;
  private parser: MarkdownParser;
  private entries: JournalEntry[] = [];
  private graphBuilt = false;
  private graph: PatternGraph | null = null;
  private suggestionEngine: SuggestionEngine | null = null;

  constructor(config: FlowServerConfig = {}) {
    this.server = new Server({
      name: config.name || 'harmon-flow',
      version: config.version || '0.0.0',
    });

    this.parser = createFlowParser(config.flowDir);

    this.setupHandlers();
  }

  /**
   * Set up request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const handler = this.getToolHandler(name);
      if (!handler) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await handler(args || {});
        return result;
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });

    // List resources (journal entries)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      this.refreshEntries();
      return {
        resources: this.entries.map((entry) => ({
          uri: `harmon-flow://entry/${entry.id}`,
          name: entry.filename,
          description: `Journal entry from ${entry.timestamp.toISOString()}`,
          mimeType: 'text/markdown',
        })),
      };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const entryId = request.params.uri.split('/').pop();
      this.refreshEntries();
      const entry = this.entries.find((e) => e.id === entryId);

      if (!entry) {
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/plain',
              text: 'Entry not found',
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: 'text/markdown',
            text: this.formatEntryForDisplay(entry),
          },
        ],
      };
    });
  }

  /**
   * Refresh entries from disk
   */
  private refreshEntries(): void {
    this.entries = this.parser.scanDirectory();
    this.graphBuilt = false;
  }

  /**
   * Build the graph if not already built
   */
  private ensureGraphBuilt(): void {
    if (!this.graphBuilt) {
      this.refreshEntries();
      const builder = new PatternGraphBuilder(this.entries);
      const graph = builder.build();
      this.graph = graph;
      const detector = new PatternDetector(graph, this.entries);
      const patterns = detector.getAllPatterns();
      this.suggestionEngine = new SuggestionEngine(graph, this.entries);
      this.graphBuilt = true;
    }
  }

  /**
   * Get all tool definitions
   */
  private getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'get_suggestions',
        description: 'Get session suggestions based on current mood and energy',
        inputSchema: {
          type: 'object',
          properties: {
            mood: {
              type: 'array',
              items: { type: 'string' },
              description: 'Current mood tags (e.g., ["calm", "focused"])',
            },
            energy: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Current energy level',
            },
            time_of_day: {
              type: 'string',
              enum: ['morning', 'afternoon', 'evening', 'night'],
              description: 'Optional: time of day for more relevant suggestions',
            },
          },
          required: ['mood', 'energy'],
        },
      },
      {
        name: 'find_similar_sessions',
        description: 'Find similar historical sessions based on mood and energy',
        inputSchema: {
          type: 'object',
          properties: {
            mood: {
              type: 'array',
              items: { type: 'string' },
              description: 'Mood tags to match',
            },
            energy: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Energy level to match',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 5)',
            },
          },
          required: ['mood'],
        },
      },
      {
        name: 'get_patterns',
        description: 'Get all detected patterns from journal entries',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['time', 'mood_energy', 'policy', 'all'],
              description: 'Type of patterns to retrieve',
            },
          },
        },
      },
      {
        name: 'get_stats',
        description: 'Get statistics about the journal entries',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_entries',
        description: 'List all journal entries with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of entries (default: 10)',
            },
            mood: {
              type: 'string',
              description: 'Filter by mood tag',
            },
          },
        },
      },
      {
        name: 'write_entry',
        description: 'Write a new journal entry',
        inputSchema: {
          type: 'object',
          properties: {
            mood: {
              type: 'array',
              items: { type: 'string' },
              description: 'Mood tags',
            },
            energy: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Energy level',
            },
            content: {
              type: 'string',
              description: 'Journal entry content',
            },
            time_of_day: {
              type: 'string',
              enum: ['morning', 'afternoon', 'evening', 'night'],
              description: 'Time of day context',
            },
            activity: {
              type: 'string',
              description: 'Activity context',
            },
          },
          required: ['mood', 'content'],
        },
      },
      {
        name: 'analyze_mood_trends',
        description: 'Analyze mood trends over time',
        inputSchema: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Number of days to analyze (default: 7)',
            },
          },
        },
      },
      {
        name: 'get_graph',
        description: 'Get the current pattern graph structure',
        inputSchema: {
          type: 'object',
          properties: {
            node_type: {
              type: 'string',
              description: 'Filter by node type (mood, energy, time, activity)',
            },
          },
        },
      },
    ];
  }

  /**
   * Get tool handler by name
   */
  private getToolHandler(name: string): ToolHandler | null {
    const handlers: Record<string, ToolHandler> = {
      get_suggestions: this.handleGetSuggestions.bind(this),
      find_similar_sessions: this.handleFindSimilarSessions.bind(this),
      get_patterns: this.handleGetPatterns.bind(this),
      get_stats: this.handleGetStats.bind(this),
      get_entries: this.handleGetEntries.bind(this),
      write_entry: this.handleWriteEntry.bind(this),
      analyze_mood_trends: this.handleAnalyzeMoodTrends.bind(this),
      get_graph: this.handleGetGraph.bind(this),
    };

    return handlers[name] || null;
  }

  /**
   * Handle get_suggestions tool
   */
  private async handleGetSuggestions(args: Record<string, unknown>) {
    const mood = args.mood as string[];
    const energy = args.energy as 'low' | 'medium' | 'high';
    const timeOfDay = args.time_of_day as string | undefined;

    this.ensureGraphBuilt();

    if (!this.suggestionEngine) {
      return {
        content: [{ type: 'text', text: 'No suggestions available' }],
      };
    }

    const suggestions = this.suggestionEngine.suggest(mood, energy, timeOfDay);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              suggestions: suggestions.map((s) => ({
                id: s.id,
                type: s.type,
                confidence: Math.round(s.confidence * 100) + '%',
                reasoning: s.reasoning,
                suggestedPolicy: s.suggestedPolicy,
                moodTags: s.moodTags,
                energyLevel: s.energyLevel,
              })),
              count: suggestions.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle find_similar_sessions tool
   */
  private async handleFindSimilarSessions(args: Record<string, unknown>) {
    const mood = args.mood as string[];
    const energy = args.energy as 'low' | 'medium' | 'high' | undefined;
    const limit = (args.limit as number) || 5;

    this.ensureGraphBuilt();

    if (!this.suggestionEngine) {
      return {
        content: [{ type: 'text', text: 'No similar sessions found' }],
      };
    }

    const similar = this.suggestionEngine.findSimilarEntries(mood, energy, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              similarSessions: similar.map((s) => ({
                id: s.entry.id,
                timestamp: s.entry.timestamp.toISOString(),
                moodTags: s.entry.moodTags,
                energyLevel: s.entry.energyLevel,
                similarity: Math.round(s.similarity * 100) + '%',
                context: s.entry.context,
              })),
              count: similar.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle get_patterns tool
   */
  private async handleGetPatterns(args: Record<string, unknown>) {
    const type = args.type as string | undefined;

    this.ensureGraphBuilt();

    const detector = new PatternDetector(
      this.graph!,
      this.entries
    );
    const patterns = detector.getAllPatterns();

    let result: Record<string, unknown> = {};

    if (!type || type === 'all' || type === 'time') {
      result.timePatterns = patterns.timePatterns;
    }
    if (!type || type === 'all' || type === 'mood_energy') {
      result.moodEnergyPatterns = patterns.moodEnergyPatterns;
    }
    if (!type || type === 'all' || type === 'policy') {
      result.policyPatterns = patterns.policyPatterns;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  /**
   * Handle get_stats tool
   */
  private async handleGetStats(_args: Record<string, unknown>) {
    this.ensureGraphBuilt();

    const stats = this.suggestionEngine?.getStats() || {
      totalEntries: this.entries.length,
      timePatterns: 0,
      moodEnergyPatterns: 0,
      policyPatterns: 0,
      topMoodTags: [],
      topEnergyLevels: [],
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
    };
  }

  /**
   * Handle get_entries tool
   */
  private async handleGetEntries(args: Record<string, unknown>) {
    const limit = (args.limit as number) || 10;
    const moodFilter = args.mood as string | undefined;

    this.refreshEntries();

    let filtered = this.entries;
    if (moodFilter) {
      filtered = filtered.filter((e) => e.moodTags.includes(moodFilter));
    }

    const recent = filtered.slice(-limit).reverse();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              entries: recent.map((e) => ({
                id: e.id,
                timestamp: e.timestamp.toISOString(),
                moodTags: e.moodTags,
                energyLevel: e.energyLevel,
                context: e.context,
                content: e.content.slice(0, 200) + (e.content.length > 200 ? '...' : ''),
              })),
              count: recent.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle write_entry tool
   */
  private async handleWriteEntry(args: Record<string, unknown>) {
    const mood = args.mood as string[];
    const energy = args.energy as 'low' | 'medium' | 'high' | undefined;
    const content = args.content as string;
    const timeOfDay = args.time_of_day as string | undefined;
    const activity = args.activity as string | undefined;

    const filename = this.parser.writeEntry({
      timestamp: new Date(),
      source: (args.source as JournalEntry['source']) || 'mcp',
      device: (args.device as JournalEntry['device']) || (process.platform === 'darwin' ? 'macos' : 'linux'),
      moodTags: mood,
      energyLevel: energy,
      context: {
        timeOfDay: timeOfDay as never,
        activity,
      },
      content,
    });

    this.graphBuilt = false; // Force rebuild on next access

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, filename }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle analyze_mood_trends tool
   */
  private async handleAnalyzeMoodTrends(args: Record<string, unknown>) {
    const days = (args.days as number) || 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    this.refreshEntries();

    const recent = this.entries.filter((e) => e.timestamp >= cutoff);
    if (recent.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period: `${days} days`,
                totalEntries: 0,
                topMoods: [],
                energyDistribution: [],
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Calculate mood frequency
    const moodCounts = new Map<string, number>();
    const energyCounts = new Map<string, number>();

    for (const entry of recent) {
      for (const mood of entry.moodTags) {
        moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
      }
      if (entry.energyLevel) {
        energyCounts.set(entry.energyLevel, (energyCounts.get(entry.energyLevel) || 0) + 1);
      }
    }

    const topMoods = [...moodCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([mood, count]) => ({ mood, count, percentage: Math.round((count / recent.length) * 100) }));

    const energyDistribution = [...energyCounts.entries()].map(([level, count]) => ({
      level,
      count,
      percentage: Math.round((count / recent.length) * 100),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              period: `${days} days`,
              totalEntries: recent.length,
              topMoods,
              energyDistribution,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle get_graph tool
   */
  private async handleGetGraph(args: Record<string, unknown>) {
    const nodeType = args.node_type as string | undefined;

    this.ensureGraphBuilt();

    const graph = this.graph!;

    const nodes = [...graph.nodes.values()];
    const edges = [...graph.edges.values()];

    let filteredNodes = nodes;
    if (nodeType) {
      filteredNodes = nodes.filter((n) => n.type === nodeType);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              nodes: filteredNodes.map((n) => ({
                id: n.id,
                type: n.type,
                label: n.label,
                weight: n.weight,
              })),
              edges: edges.map((e) => ({
                source: e.source,
                target: e.target,
                relationship: e.relationship,
                weight: Math.round(e.weight * 100) / 100,
              })),
              nodeCount: filteredNodes.length,
              edgeCount: edges.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Format entry for display
   */
  private formatEntryForDisplay(entry: JournalEntry): string {
    return `---
Timestamp: ${entry.timestamp.toISOString()}
Source: ${entry.source}
Device: ${entry.device}
Mood: ${entry.moodTags.join(', ') || 'N/A'}
Energy: ${entry.energyLevel || 'N/A'}
Context: ${JSON.stringify(entry.context || {})}
---

${entry.content}`;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('Harmon Flow MCP Server started');
  }

  /**
   * Get server instance
   */
  getServer(): Server {
    return this.server;
  }
}

/**
 * Create and start the MCP server
 */
export async function createMCPServer(config?: FlowServerConfig): Promise<HarmonFlowMCPServer> {
  const server = new HarmonFlowMCPServer(config);
  await server.start();
  return server;
}

// Run as standalone server
if (import.meta.url === `file://${process.argv[1]}`) {
  createMCPServer().catch(console.error);
}
