/**
 * Small HTTP helpers for the remote MCP server.
 */

import type { IncomingMessage } from 'node:http';

/**
 * I read a JSON request body when the MCP transport needs a parsed POST payload.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * I normalize headers that can arrive as a string array in Node HTTP servers.
 */
export function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
