import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { HarmonFlowMCPServer } from './index.js';
import type { HarmonDaemonAppClient } from './daemon-client.js';

describe('HarmonFlowMCPServer music tools (stdio surface)', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
    tempDirs.length = 0;
  });

  it('exposes the full music tool surface next to the journal tools', async () => {
    const { client, close } = await connect(createFakeDaemonClient(), tempDirs);

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      'get_suggestions',
      'write_entry',
      'get_status',
      'search_music',
      'smart_search',
      'smart_play',
      'play_music',
      'pause_music',
      'next_track',
      'previous_track',
      'start_session',
      'stop_session',
      'auth_status',
      'auth_spotify_login',
    ]));

    await close();
  });

  it('answers "what is playing?" without a provider by scanning session then providers', async () => {
    const probed: string[] = [];
    const daemonClient = createFakeDaemonClient({
      async getStatus() {
        return { isRunning: true, providers: {}, session: null, spotifyConnected: false, version: '0.0.0-test' } as never;
      },
      async getNowPlaying(provider) {
        probed.push(provider);
        return provider === 'youtube'
          ? { artist: 'Artist', durationMs: 1000, id: 'yt-1', name: 'Track', provider: 'youtube' } as never
          : null;
      },
    });
    const { client, close } = await connect(daemonClient, tempDirs);

    const result = await client.callTool({ arguments: {}, name: 'get_now_playing' });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      provider: string; track: { id: string };
    };
    expect(parsed.provider).toBe('youtube');
    expect(parsed.track.id).toBe('yt-1');
    expect(probed).toEqual(['spotify', 'apple', 'youtube']);

    await close();
  });

  it('plays music through the daemon client with validated arguments', async () => {
    const smartPlayCalls: Array<Record<string, unknown>> = [];
    const daemonClient = createFakeDaemonClient({
      async smartPlay(options) {
        smartPlayCalls.push(options);
        return {
          provider: 'spotify',
          success: true,
          track: { artist: 'Artist', name: 'Track' },
        };
      },
    });
    const { client, close } = await connect(daemonClient, tempDirs);

    const result = await client.callTool({
      arguments: { query: 'lofi focus' },
      name: 'smart_play',
    });
    expect(result.isError).toBeFalsy();
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('Now playing on spotify');
    expect(smartPlayCalls).toEqual([{ provider: undefined, query: 'lofi focus', uri: undefined }]);

    const invalid = await client.callTool({
      arguments: { provider: 'winamp', query: 'x' },
      name: 'search_music',
    });
    expect(invalid.isError).toBe(true);
    expect((invalid.content as Array<{ text: string }>)[0]?.text).toContain('Invalid arguments for search_music');

    await close();
  });
});

async function connect(daemonClient: HarmonDaemonAppClient, tempDirs: string[]) {
  const flowDir = fs.mkdtempSync(path.join(tmpdir(), 'harmon-flow-stdio-'));
  tempDirs.push(flowDir);

  const server = new HarmonFlowMCPServer({ daemonClient, flowDir });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'harmon-stdio-test-client', version: '1.0.0' });

  await server.getServer().connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    close: async () => {
      await client.close();
      await server.getServer().close();
    },
  };
}

function createFakeDaemonClient(overrides: Partial<HarmonDaemonAppClient> = {}): HarmonDaemonAppClient {
  const fake: Partial<HarmonDaemonAppClient> = {
    async getStatus() {
      return {
        isRunning: true,
        providers: {},
        spotifyConnected: false,
        version: '0.0.0-test',
      };
    },
    async searchMusic() {
      return [];
    },
    async smartPlay() {
      return { provider: 'spotify', success: true, track: null };
    },
    ...overrides,
  };
  return fake as HarmonDaemonAppClient;
}
