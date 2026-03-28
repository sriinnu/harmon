/**
 * Remote MCP server for ChatGPT/OpenAI app integration.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl, mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SessionPolicy } from '@sriinnu/harmon-protocol';
import { createFlowParser } from '../parser/index.js';
import { getFlowServerVersion } from '../version.js';
import type { JournalEntry } from '../types.js';
import { createAppAuthContext, type HarmonMcpAuthConfig } from './auth.js';
import { createDaemonAppClient, type DaemonClientConfig, type HarmonDaemonAppClient } from './daemon-client.js';
import { getHeaderValue } from './http-utils.js';
import { fetchJournalEntry, searchJournalEntries } from './journal-search.js';
import { assertToolScopesFromExtra } from './tool-auth.js';

export interface HarmonAppMCPServerConfig extends DaemonClientConfig {
  allowedHosts?: string[];
  allowUnauthenticatedWrites?: boolean;
  auth?: HarmonMcpAuthConfig;
  bearerToken?: string;
  daemonClient?: HarmonDaemonAppClient;
  flowDir?: string;
  host?: string;
  name?: string;
  path?: string;
  port?: number;
  version?: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PATH = '/mcp';
const DEFAULT_PORT = 17400;

/**
 * I expose a narrow tool surface that is honest enough for ChatGPT app import.
 */
export class HarmonAppMCPServer {
  private readonly app;
  private readonly auth;
  private readonly bearerToken?: string;
  private readonly daemonClient: HarmonDaemonAppClient;
  private readonly flowParser;
  private readonly host: string;
  private readonly mcpPath: string;
  private readonly port: number;
  private readonly server: McpServer;
  private httpServer: Server | null = null;
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(private readonly config: HarmonAppMCPServerConfig = {}) {
    this.bearerToken = config.bearerToken ?? process.env.HARMON_MCP_BEARER_TOKEN;
    this.daemonClient = config.daemonClient ?? createDaemonAppClient(config);
    this.flowParser = createFlowParser(config.flowDir);
    this.host = config.host ?? DEFAULT_HOST;
    this.mcpPath = config.path ?? DEFAULT_PATH;
    this.port = config.port ?? DEFAULT_PORT;
    this.auth = createAppAuthContext({
      auth: {
        bearerToken: this.bearerToken,
        ...config.auth,
      },
      defaultResourceServerUrl: `http://${this.host}:${this.port}${this.mcpPath}`,
    });
    this.server = new McpServer({
      name: config.name ?? 'harmon-app',
      version: config.version ?? getFlowServerVersion(),
    });
    this.app = createMcpExpressApp({
      allowedHosts: config.allowedHosts ?? splitList(process.env.HARMON_MCP_ALLOWED_HOSTS),
      host: this.host,
    });
    if (this.shouldAllowUnauthenticatedWrites() && !isLoopbackHost(this.host)) {
      throw new Error('Unauthenticated MCP write tools are only allowed on loopback hosts.');
    }
    this.app.disable('x-powered-by');
    this.setupHttpRoutes();
    this.registerTools();
  }

  /**
   * I expose the underlying MCP server for tests and advanced callers.
   */
  getMcpServer(): McpServer {
    return this.server;
  }

  /**
   * I return the remote MCP URL after the HTTP server is listening.
   */
  getMcpUrl(): string {
    const address = this.httpServer?.address();
    const port = typeof address === 'object' && address ? address.port : this.port;
    return `http://${this.host}:${port}${this.mcpPath}`;
  }

  /**
   * I start a remote streamable HTTP MCP endpoint and a small health route.
   */
  async start(): Promise<void> {
    if (this.httpServer) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.httpServer = this.app.listen(this.port, this.host, () => resolve());
      this.httpServer.once('error', reject);
    });
  }

  /**
   * I close the HTTP listener and every in-flight MCP session.
   */
  async close(): Promise<void> {
    for (const transport of this.transports.values()) {
      await transport.close();
    }
    this.transports.clear();

    await this.server.close();

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer?.close((error) => error ? reject(error) : resolve());
      });
      this.httpServer = null;
    }
  }

  private registerTools(): void {
    const authEnabled = this.auth.mode !== 'none';
    const canExposeWriteTools = this.auth.canExposeWriteTools || (
      this.auth.mode === 'none' &&
      this.shouldAllowUnauthenticatedWrites()
    );

    this.server.registerTool('search', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Search Journal' },
      description: 'Search Harmon journal entries for relevant context.',
      inputSchema: {
        limit: z.number().int().min(1).max(10).optional(),
        query: z.string().min(1),
      },
    }, async ({ limit, query }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.readScopes, authEnabled);
      return this.jsonResult({
        results: searchJournalEntries(this.readEntries(), query, limit),
      });
    });

    this.server.registerTool('fetch', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Fetch Journal Entry' },
      description: 'Fetch a full Harmon journal entry by ID.',
      inputSchema: {
        id: z.string().min(1),
      },
    }, async ({ id }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.readScopes, authEnabled);
      const entry = fetchJournalEntry(this.readEntries(), id);
      if (!entry) {
        throw new Error(`Journal entry ${id} was not found.`);
      }
      return this.jsonResult(entry);
    });

    this.server.registerTool('get_status', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Get Harmon Status' },
      description: 'Get provider readiness and current session state from the Harmon daemon.',
    }, async (extra) => {
      assertToolScopesFromExtra(extra, this.auth.readScopes, authEnabled);
      return this.jsonResult(await this.getPublicStatus());
    });

    this.server.registerTool('search_music', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Search Music' },
      description: 'Search Spotify, Apple Music, or YouTube Music catalogs.',
      inputSchema: {
        kind: z.enum(['track', 'song', 'album', 'artist', 'playlist']).default('song'),
        limit: z.number().int().min(1).max(10).optional(),
        provider: z.enum(['spotify', 'apple', 'youtube']),
        query: z.string().min(1),
      },
    }, async ({ kind, limit, provider, query }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.readScopes, authEnabled);
      return this.jsonResult({
        provider,
        results: await this.daemonClient.searchMusic(provider, query, kind, limit),
      });
    });

    this.server.registerTool('get_library_tracks', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Get Library Tracks' },
      description: 'List saved or liked tracks for a provider.',
      inputSchema: {
        limit: z.number().int().min(1).max(25).optional(),
        provider: z.enum(['spotify', 'apple', 'youtube']),
      },
    }, async ({ limit, provider }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.readScopes, authEnabled);
      return this.jsonResult({
        provider,
        tracks: await this.daemonClient.getLibraryTracks(provider, limit),
      });
    });

    this.server.registerTool('list_playlists', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'List Playlists' },
      description: 'List playlists for a provider.',
      inputSchema: {
        limit: z.number().int().min(1).max(25).optional(),
        provider: z.enum(['spotify', 'apple', 'youtube']),
      },
    }, async ({ limit, provider }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.readScopes, authEnabled);
      return this.jsonResult({
        playlists: await this.daemonClient.listPlaylists(provider, limit),
        provider,
      });
    });

    this.server.registerTool('get_playlist_tracks', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Get Playlist Tracks' },
      description: 'Fetch tracks from a playlist for a provider.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        playlistId: z.string().min(1),
        provider: z.enum(['spotify', 'apple', 'youtube']),
      },
    }, async ({ limit, playlistId, provider }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.readScopes, authEnabled);
      return this.jsonResult({
        playlistId,
        provider,
        tracks: await this.daemonClient.getPlaylistTracks(provider, playlistId, limit),
      });
    });

    this.server.registerTool('get_now_playing', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Get Now Playing' },
      description: 'Get the current track for a specific provider runtime.',
      inputSchema: {
        provider: z.enum(['spotify', 'apple', 'youtube']),
      },
    }, async ({ provider }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.readScopes, authEnabled);
      return this.jsonResult({
        provider,
        track: await this.daemonClient.getNowPlaying(provider),
      });
    });

    if (!canExposeWriteTools) {
      return;
    }

    this.server.registerTool('play_music', {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Play Music',
      },
      description: 'Play a track immediately by URI/URL, or search and play the first matching result.',
      inputSchema: {
        kind: z.enum(['track', 'song']).default('song'),
        provider: z.enum(['spotify', 'apple', 'youtube']),
        query: z.string().min(1).optional(),
        target: z.string().min(1).optional(),
      },
    }, async ({ kind, provider, query, target }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.writeScopes, authEnabled);
      const resolvedTarget = target ?? await this.resolvePlayTarget(provider, kind, query);
      if (!resolvedTarget) {
        throw new Error('play_music requires a target or a query that resolves to a playable track.');
      }
      await this.daemonClient.playMusic(provider, resolvedTarget);
      return this.jsonResult({
        provider,
        success: true,
        target: resolvedTarget,
      });
    });

    this.server.registerTool('pause_music', {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Pause Music',
      },
      description: 'Pause playback for a provider runtime. YouTube browser-handoff does not support pause.',
      inputSchema: {
        provider: z.enum(['spotify', 'apple', 'youtube']),
      },
    }, async ({ provider }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.writeScopes, authEnabled);
      if (provider === 'youtube') {
        throw new Error('YouTube Music pause is not supported in browser-handoff mode.');
      }
      return this.jsonResult(await this.daemonClient.pauseMusic(provider));
    });

    this.server.registerTool('next_track', {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Next Track',
      },
      description: 'Skip to the next track for a provider runtime.',
      inputSchema: {
        provider: z.enum(['spotify', 'apple', 'youtube']),
      },
    }, async ({ provider }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.writeScopes, authEnabled);
      return this.jsonResult(await this.daemonClient.nextTrack(provider));
    });

    this.server.registerTool('previous_track', {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Previous Track',
      },
      description: 'Return to the previous track for a provider runtime.',
      inputSchema: {
        provider: z.enum(['spotify', 'apple', 'youtube']),
      },
    }, async ({ provider }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.writeScopes, authEnabled);
      return this.jsonResult(await this.daemonClient.previousTrack(provider));
    });

    this.server.registerTool('start_session', {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Start Session',
      },
      description: 'Start a Harmon session using the shared policy contract.',
      inputSchema: {
        policy: SessionPolicy,
      },
    }, async ({ policy }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.writeScopes, authEnabled);
      const result = await this.daemonClient.startSession(policy);
      return this.jsonResult({
        provider: policy.provider ?? 'spotify',
        success: result.success,
      });
    });

    this.server.registerTool('nudge_session', {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Nudge Session',
      },
      description: 'Nudge the active session calmer or sharper.',
      inputSchema: {
        amount: z.number().min(0).max(1).optional(),
        direction: z.enum(['calmer', 'sharper']),
        reason: z.string().max(280).optional(),
      },
    }, async ({ amount, direction, reason }, extra) => {
      assertToolScopesFromExtra(extra, this.auth.writeScopes, authEnabled);
      return this.jsonResult(await this.daemonClient.nudgeSession(direction, amount, reason));
    });

    this.server.registerTool('stop_session', {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
        title: 'Stop Session',
      },
      description: 'Stop the active Harmon session.',
    }, async (extra) => {
      assertToolScopesFromExtra(extra, this.auth.writeScopes, authEnabled);
      return this.jsonResult(await this.daemonClient.stopSession());
    });
  }

  private shouldAllowUnauthenticatedWrites(): boolean {
    return (
      this.config.allowUnauthenticatedWrites
      ?? process.env.HARMON_MCP_ALLOW_UNAUTHENTICATED_WRITES === '1'
    ) === true;
  }

  private async handleMcpRequest(
    req: IncomingMessage & { body?: unknown },
    res: ServerResponse,
    parsedBody?: unknown,
  ): Promise<void> {
    const sessionId = getHeaderValue(req.headers['mcp-session-id']);

    let transport = sessionId ? this.transports.get(sessionId) : undefined;
    if (!transport) {
      if (sessionId || !parsedBody || !isInitializeRequest(parsedBody)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request: valid MCP session required.' }));
        return;
      }

      transport = new StreamableHTTPServerTransport({
        onsessioninitialized: (initializedSessionId) => {
          this.transports.set(initializedSessionId, transport!);
        },
        sessionIdGenerator: () => randomUUID(),
      });
      transport.onclose = () => {
        if (transport?.sessionId) {
          this.transports.delete(transport.sessionId);
        }
      };
      await this.server.connect(transport);
    }

    await transport.handleRequest(req, res, parsedBody);
  }

  private async getPublicStatus(): Promise<Record<string, unknown>> {
    const status = await this.daemonClient.getStatus();
    return {
      features: status.features ?? {},
      isRunning: status.isRunning,
      providers: status.providers ?? {},
      session: status.session
        ? {
            currentTrack: status.session.currentTrack ?? null,
            isActive: status.session.isActive,
            policy: summarizePolicy(status.session.policy),
            provider: status.session.provider ?? null,
            queueDepth: status.session.queueDepth,
          }
        : null,
    };
  }

  private readEntries(): JournalEntry[] {
    return this.flowParser.scanDirectory();
  }

  private async resolvePlayTarget(
    provider: 'spotify' | 'apple' | 'youtube',
    kind: 'track' | 'song',
    query: string | undefined,
  ): Promise<string | null> {
    if (!query) {
      return null;
    }

    const results = await this.daemonClient.searchMusic(provider, query, kind, 1);
    const first = results[0];
    if (!first) {
      return null;
    }

    if (first.uri) {
      return first.uri;
    }
    if (first.url) {
      return first.url;
    }
    if (provider === 'spotify') {
      return `spotify:track:${first.id}`;
    }
    if (provider === 'apple') {
      return null;
    }
    return `youtube:video:${first.id}`;
  }

  private jsonResult(value: unknown) {
    return {
      content: [{ text: JSON.stringify(value, null, 2), type: 'text' as const }],
    };
  }

  private setupHttpRoutes(): void {
    this.app.get('/healthz', (_req, res) => {
      res.status(200).json({
        authMode: this.auth.mode,
        ok: true,
        transport: 'streamable-http',
      });
    });

    if (this.auth.metadata) {
      this.app.use(mcpAuthMetadataRouter(this.auth.metadata));
    }

    if (this.auth.verifier) {
      this.app.use(this.mcpPath, requireBearerAuth({
        resourceMetadataUrl: this.auth.metadata
          ? getOAuthProtectedResourceMetadataUrl(this.auth.metadata.resourceServerUrl)
          : undefined,
        verifier: this.auth.verifier,
      }));
    }

    this.app.get(this.mcpPath, (req, res) => {
      void this.handleMcpRequest(req, res);
    });
    this.app.post(this.mcpPath, (req, res) => {
      void this.handleMcpRequest(req, res, req.body);
    });
    this.app.delete(this.mcpPath, (req, res) => {
      void this.handleMcpRequest(req, res);
    });
  }
}

/**
 * I create and start the remote MCP app server.
 */
export async function createAppMCPServer(config?: HarmonAppMCPServerConfig): Promise<HarmonAppMCPServer> {
  const server = new HarmonAppMCPServer(config);
  await server.start();
  return server;
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const entries = value.split(/[,\s]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

function summarizePolicy(policy: SessionPolicy | undefined): Record<string, unknown> | null {
  if (!policy) {
    return null;
  }

  return {
    durationMs: policy.durationMs ?? null,
    mode: policy.mode ?? null,
    provider: policy.provider ?? 'spotify',
    queue: policy.queue
      ? {
          refillWhenBelow: policy.queue.refillWhenBelow ?? null,
          target: policy.queue.target ?? null,
        }
      : null,
    sources: policy.sources ?? null,
  };
}
