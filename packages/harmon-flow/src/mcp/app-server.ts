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
import { createFlowParser } from '../parser/index.js';
import { getFlowServerVersion } from '../version.js';
import type { JournalEntry } from '../types.js';
import { createAppAuthContext, type HarmonMcpAuthConfig } from './auth.js';
import { createDaemonAppClient, type DaemonClientConfig, type HarmonDaemonAppClient } from './daemon-client.js';
import { getHeaderValue } from './http-utils.js';
import { fetchJournalEntry, searchJournalEntries } from './journal-search.js';
import { getMusicToolSpecs } from './music-tools.js';
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

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

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
  private readonly writeToolsExposed: boolean;
  private httpServer: Server | null = null;
  private readonly sessions = new Map<string, McpSession>();

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
    this.writeToolsExposed = this.auth.canExposeWriteTools || (
      this.auth.mode === 'none' &&
      this.shouldAllowUnauthenticatedWrites()
    );
    this.warnIfWriteToolsHidden();
    this.server = this.buildMcpServer();
    this.app = createMcpExpressApp({
      allowedHosts: config.allowedHosts ?? splitList(process.env.HARMON_MCP_ALLOWED_HOSTS),
      host: this.host,
    });
    if (this.shouldAllowUnauthenticatedWrites() && !isLoopbackHost(this.host)) {
      throw new Error('Unauthenticated MCP write tools are only allowed on loopback hosts.');
    }
    this.app.disable('x-powered-by');
    this.setupHttpRoutes();
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
    for (const session of this.sessions.values()) {
      await session.transport.close();
    }
    this.sessions.clear();

    await this.server.close();

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer?.close((error) => error ? reject(error) : resolve());
      });
      this.httpServer = null;
    }
  }

  /**
   * I build a fresh MCP server with the full tool surface. Each HTTP session
   * gets its own instance: the SDK binds one transport per server, so sharing
   * a server across concurrent sessions cross-wires their responses.
   */
  private buildMcpServer(): McpServer {
    const server = new McpServer({
      name: this.config.name ?? 'harmon-app',
      version: this.config.version ?? getFlowServerVersion(),
    });
    this.registerTools(server);
    return server;
  }

  private registerTools(server: McpServer): void {
    const authEnabled = this.auth.mode !== 'none';

    server.registerTool('search', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Search Journal' },
      description: 'Search the Harmon listening journal (past session notes) for context. NOT for finding songs — use search_music or smart_search to find music.',
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

    server.registerTool('fetch', {
      annotations: { openWorldHint: false, readOnlyHint: true, title: 'Fetch Journal Entry' },
      description: 'Fetch a full Harmon journal entry by ID. Journal entries only — not tracks or playlists.',
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

    for (const spec of getMusicToolSpecs()) {
      if (spec.write && !this.writeToolsExposed) {
        continue;
      }
      const requiredScopes = spec.write ? this.auth.writeScopes : this.auth.readScopes;
      if (spec.schema) {
        server.registerTool(spec.name, {
          annotations: spec.annotations,
          description: spec.description,
          inputSchema: spec.schema.shape,
        }, async (args, extra) => {
          assertToolScopesFromExtra(extra, requiredScopes, authEnabled);
          return spec.handler(args, this.daemonClient);
        });
      } else {
        server.registerTool(spec.name, {
          annotations: spec.annotations,
          description: spec.description,
        }, async (extra) => {
          assertToolScopesFromExtra(extra, requiredScopes, authEnabled);
          return spec.handler({}, this.daemonClient);
        });
      }
    }
  }

  private warnIfWriteToolsHidden(): void {
    if (this.writeToolsExposed) {
      return;
    }
    const hidden = getMusicToolSpecs().filter((spec) => spec.write).map((spec) => spec.name).join(', ');
    const remedy = this.auth.mode === 'none'
      ? 'Set HARMON_MCP_ALLOW_UNAUTHENTICATED_WRITES=1 (loopback only) or configure a bearer token / OAuth to enable them.'
      : 'Grant the write scope, e.g. HARMON_MCP_BEARER_TOKEN_SCOPES="harmon.read harmon.write".';
    console.error(`[harmon-mcp] Write tools are HIDDEN (${hidden}). ${remedy}`);
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

    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (session) {
      await session.transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (sessionId || !parsedBody || !isInitializeRequest(parsedBody)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request: valid MCP session required.' }));
      return;
    }

    const server = this.buildMcpServer();
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      onsessioninitialized: (initializedSessionId) => {
        this.sessions.set(initializedSessionId, { server, transport });
      },
      sessionIdGenerator: () => randomUUID(),
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        this.sessions.delete(transport.sessionId);
      }
    };
    await server.connect(transport);

    await transport.handleRequest(req, res, parsedBody);
  }

  private readEntries(): JournalEntry[] {
    return this.flowParser.scanDirectory();
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
