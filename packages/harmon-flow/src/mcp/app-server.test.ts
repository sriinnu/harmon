import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DaemonStatus, SessionPolicy, TrackInfo } from '@athena/harmon-protocol';
import { HarmonAppMCPServer } from './app-server.js';
import type { HarmonDaemonAppClient, MusicSearchItem } from './daemon-client.js';

describe('HarmonAppMCPServer', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
    tempDirs.length = 0;
  });

  it('exposes app-ready tools and journal compatibility handlers', async () => {
    const flowDir = createFlowDir(tempDirs);
    writeEntry(
      flowDir,
      '2026-03-27T10-00-00-entry.md',
      `---
ts: 2026-03-27T10:00:00.000Z
source: cli
device: macos
moodTags:
  - focused
---
Focused ambient session before deep work.`,
    );

    const daemonClient = createFakeDaemonClient();
    const appServer = new HarmonAppMCPServer({ daemonClient, flowDir });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'harmon-test-client', version: '1.0.0' });

    await appServer.getMcpServer().connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'search',
      'fetch',
      'get_status',
      'search_music',
      'get_library_tracks',
      'list_playlists',
      'get_playlist_tracks',
      'get_now_playing',
      'play_music',
      'pause_music',
      'next_track',
      'previous_track',
      'start_session',
      'nudge_session',
      'stop_session',
    ]));

    const searchResult = await client.callTool({
      arguments: { query: 'ambient' },
      name: 'search',
    });
    expect(parseToolResult(searchResult)).toMatchObject({
      results: [
        {
          id: 'entry',
          title: '2026-03-27T10:00:00.000Z focused',
        },
      ],
    });

    const fetchResult = await client.callTool({
      arguments: { id: 'entry' },
      name: 'fetch',
    });
    expect(parseToolResult(fetchResult)).toMatchObject({
      id: 'entry',
      metadata: {
        moodTags: ['focused'],
      },
      text: 'Focused ambient session before deep work.',
    });

    await client.close();
    await appServer.close();
  });

  it('lets an agent browse playlists and play the first matching track', async () => {
    const flowDir = createFlowDir(tempDirs);
    const playCalls: Array<{ provider: string; target?: string }> = [];
    const appServer = new HarmonAppMCPServer({
      daemonClient: createFakeDaemonClient({
        async listPlaylists() {
          return [{
            id: 'playlist-1',
            kind: 'playlist',
            provider: 'youtube',
            title: 'Focus Playlist',
            uri: 'youtube:playlist:playlist-1',
          }];
        },
        async playMusic(provider, target) {
          playCalls.push({ provider, target });
          return { success: true };
        },
        async searchMusic() {
          return [{
            id: 'video-1',
            kind: 'song',
            provider: 'youtube',
            title: 'Focus Track',
          }];
        },
      }),
      flowDir,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'harmon-play-client', version: '1.0.0' });

    await appServer.getMcpServer().connect(serverTransport);
    await client.connect(clientTransport);

    const playlistResult = await client.callTool({
      arguments: { provider: 'youtube' },
      name: 'list_playlists',
    });
    expect(parseToolResult(playlistResult)).toMatchObject({
      playlists: [
        {
          id: 'playlist-1',
          provider: 'youtube',
          title: 'Focus Playlist',
        },
      ],
    });

    const playResult = await client.callTool({
      arguments: { provider: 'youtube', query: 'focus mix' },
      name: 'play_music',
    });
    expect(parseToolResult(playResult)).toMatchObject({
      provider: 'youtube',
      success: true,
      target: 'youtube:video:video-1',
    });
    expect(playCalls).toEqual([{ provider: 'youtube', target: 'youtube:video:video-1' }]);

    await client.close();
    await appServer.close();
  });

  it('passes the shared policy contract through start_session', async () => {
    const policyCalls: SessionPolicy[] = [];
    const flowDir = createFlowDir(tempDirs);
    const daemonClient = createFakeDaemonClient({
      startSession: async (policy) => {
        policyCalls.push(policy);
        return { sessionId: 'sess_1', success: true };
      },
    });
    const appServer = new HarmonAppMCPServer({ daemonClient, flowDir });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'harmon-test-client', version: '1.0.0' });

    await appServer.getMcpServer().connect(serverTransport);
    await client.connect(clientTransport);

    const response = await client.callTool({
      arguments: {
        policy: {
          mode: 'focus',
          provider: 'youtube',
          sources: { searchQueries: ['lofi coding mix'] },
          version: 1,
        },
      },
      name: 'start_session',
    });

    expect(parseToolResult(response)).toEqual({
      provider: 'youtube',
      success: true,
    });
    expect(policyCalls).toEqual([{
      mode: 'focus',
      provider: 'youtube',
      sources: { searchQueries: ['lofi coding mix'] },
      version: 1,
    }]);

    await client.close();
    await appServer.close();
  });

  it('serves the remote streamable HTTP surface expected by ChatGPT/OpenAI clients', async () => {
    const flowDir = createFlowDir(tempDirs);
    const appServer = new HarmonAppMCPServer({
      daemonClient: createFakeDaemonClient(),
      flowDir,
      host: '127.0.0.1',
      port: 0,
    });

    await appServer.start();

    const health = await fetch(new URL('/healthz', appServer.getMcpUrl().replace('/mcp', '/')).toString());
    expect(health.status).toBe(200);

    const client = new Client({ name: 'harmon-http-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(appServer.getMcpUrl()));
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.some((tool) => tool.name === 'get_status')).toBe(true);

    await client.close();
    await appServer.close();
  });

  it('advertises OAuth-style metadata and challenges unauthenticated MCP requests', async () => {
    const flowDir = createFlowDir(tempDirs);
    const appServer = new HarmonAppMCPServer({
      auth: {
        authorizationEndpoint: 'https://auth.example.com/authorize',
        bearerToken: 'demo-token',
        bearerTokenScopes: ['harmon.read'],
        issuerUrl: 'https://auth.example.com',
        resourceServerUrl: 'http://127.0.0.1:17402/mcp',
        tokenEndpoint: 'https://auth.example.com/token',
      },
      daemonClient: createFakeDaemonClient(),
      flowDir,
      host: '127.0.0.1',
      port: 17402,
    });

    await appServer.start();

    const metadataResponse = await fetch('http://127.0.0.1:17402/.well-known/oauth-protected-resource/mcp');
    expect(metadataResponse.status).toBe(200);
    expect(await metadataResponse.json()).toMatchObject({
      authorization_servers: ['https://auth.example.com/'],
      resource: 'http://127.0.0.1:17402/mcp',
    });

    const unauthorizedResponse = await fetch('http://127.0.0.1:17402/mcp');
    expect(unauthorizedResponse.status).toBe(401);
    expect(unauthorizedResponse.headers.get('www-authenticate')).toContain(
      'resource_metadata="http://127.0.0.1:17402/.well-known/oauth-protected-resource/mcp"',
    );

    await appServer.close();
  });

  it('keeps write tools behind write scopes when auth is enabled', async () => {
    const flowDir = createFlowDir(tempDirs);
    const appServer = new HarmonAppMCPServer({
      auth: {
        authorizationEndpoint: 'https://auth.example.com/authorize',
        bearerToken: 'read-only-token',
        bearerTokenScopes: ['harmon.read'],
        issuerUrl: 'https://auth.example.com',
        resourceServerUrl: 'http://127.0.0.1:17403/mcp',
        tokenEndpoint: 'https://auth.example.com/token',
      },
      daemonClient: createFakeDaemonClient(),
      flowDir,
      host: '127.0.0.1',
      port: 17403,
    });

    await appServer.start();

    const client = new Client({ name: 'harmon-auth-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:17403/mcp'), {
      requestInit: {
        headers: {
          Authorization: 'Bearer read-only-token',
        },
      },
    });

    await client.connect(transport);

    const readResult = await client.callTool({
      arguments: {},
      name: 'get_status',
    });
    expect((parseToolResult(readResult) as { isRunning: boolean }).isRunning).toBe(true);

    const writeResult = await client.callTool({
      arguments: {
        policy: {
          mode: 'focus',
          provider: 'spotify',
          sources: { searchQueries: ['deep focus'] },
          version: 1,
        },
      },
      name: 'start_session',
    });
    expect(writeResult.isError).toBe(true);
    expect(writeResult.content?.[0]?.text).toContain('Token is missing required scopes');

    await client.close();
    await appServer.close();
  });
});

function createFakeDaemonClient(
  overrides: Partial<HarmonDaemonAppClient> = {},
): HarmonDaemonAppClient {
  return {
    async getLibraryTracks(): Promise<MusicSearchItem[]> {
      return [];
    },
    async getNowPlaying(): Promise<TrackInfo | null> {
      return null;
    },
    async getStatus(): Promise<DaemonStatus> {
      return {
        features: { sse: true },
        isRunning: true,
        providers: {
          spotify: { connected: true, status: 'ready' },
        },
        spotifyConnected: true,
        version: '0.1.0',
      };
    },
    async nudgeSession() {
      return { success: true };
    },
    async listPlaylists(): Promise<MusicSearchItem[]> {
      return [];
    },
    async nextTrack() {
      return { success: true };
    },
    async pauseMusic() {
      return { success: true };
    },
    async playMusic() {
      return { success: true };
    },
    async previousTrack() {
      return { success: true };
    },
    async getPlaylistTracks(): Promise<MusicSearchItem[]> {
      return [];
    },
    async searchMusic(): Promise<MusicSearchItem[]> {
      return [{
        id: 'track-1',
        kind: 'song',
        provider: 'spotify',
        subtitle: 'Artist',
        title: 'Track',
      }];
    },
    async startSession() {
      return { sessionId: 'sess_1', success: true };
    },
    async stopSession() {
      return { success: true };
    },
    ...overrides,
  };
}

function createFlowDir(tempDirs: string[]): string {
  const flowDir = fs.mkdtempSync(path.join(tmpdir(), 'harmon-flow-app-'));
  tempDirs.push(flowDir);
  return flowDir;
}

function parseToolResult(result: { content?: Array<{ text?: string }> }): unknown {
  const text = result.content?.find((item) => typeof item.text === 'string')?.text;
  return JSON.parse(text ?? '{}');
}

function writeEntry(flowDir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(flowDir, filename), content, 'utf8');
}
