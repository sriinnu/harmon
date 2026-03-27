/**
 * Tool-level auth helpers for the remote MCP app server.
 */

import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

/**
 * I enforce tool scopes only when the MCP server is running in authenticated mode.
 */
export function assertToolScopes(
  authInfo: AuthInfo | undefined,
  requiredScopes: string[],
  authEnabled: boolean,
): void {
  if (!authEnabled || requiredScopes.length === 0) {
    return;
  }

  if (!authInfo) {
    throw new Error('Authentication is required for this tool.');
  }

  const missingScopes = requiredScopes.filter((scope) => !authInfo.scopes.includes(scope));
  if (missingScopes.length > 0) {
    throw new Error(`Token is missing required scopes: ${missingScopes.join(', ')}`);
  }
}

/**
 * I help the app server keep write-tool auth checks readable.
 */
export function assertToolScopesFromExtra(
  extra: RequestHandlerExtra<any, any>,
  requiredScopes: string[],
  authEnabled: boolean,
): void {
  assertToolScopes(extra.authInfo, requiredScopes, authEnabled);
}
