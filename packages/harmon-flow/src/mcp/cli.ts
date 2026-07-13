#!/usr/bin/env node
/**
 * CLI entrypoint for stdio and remote MCP server modes.
 */

import { createMCPServer } from './index.js';
import { createAppMCPServer } from './app-server.js';

type TransportMode = 'http' | 'stdio';

/**
 * I parse the small argument surface we need for package-local server startup.
 */
function parseArgs(argv: string[]): {
  flowDir?: string;
  host?: string;
  path?: string;
  port?: number;
  transport: TransportMode;
} {
  const args = {
    flowDir: process.env.HARMON_FLOW_DIR,
    host: process.env.HARMON_MCP_HOST,
    path: process.env.HARMON_MCP_PATH,
    port: parseInteger(process.env.HARMON_MCP_PORT),
    transport: (process.env.HARMON_MCP_TRANSPORT as TransportMode | undefined) ?? 'stdio',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--flow-dir') {
      args.flowDir = argv[index + 1];
      index += 1;
    } else if (value === '--host') {
      args.host = argv[index + 1];
      index += 1;
    } else if (value === '--path') {
      args.path = argv[index + 1];
      index += 1;
    } else if (value === '--port') {
      args.port = parseInteger(argv[index + 1]);
      index += 1;
    } else if (value === '--transport') {
      const transport = argv[index + 1];
      if (transport === 'http' || transport === 'stdio') {
        args.transport = transport;
      }
      index += 1;
    }
  }

  return args;
}

/**
 * I start the requested MCP mode and keep the package start contract honest.
 */
export async function runMCPServerCLI(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.transport === 'http') {
    const server = await createAppMCPServer({
      flowDir: args.flowDir,
      host: args.host,
      path: args.path,
      port: args.port,
    });
    const urlHost = args.host ?? '127.0.0.1';
    const urlPort = args.port ?? 17400;
    const urlPath = args.path ?? '/mcp';
    console.error(`Harmon MCP app server listening on http://${urlHost}:${urlPort}${urlPath}`);

    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
    return;
  }

  await createMCPServer({ flowDir: args.flowDir });
}

function parseInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMCPServerCLI().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
