/**
 * Resolve the harmon-flow package version from package metadata.
 */

import { readFileSync } from 'node:fs';

const FALLBACK_VERSION = '0.0.0';

/**
 * Read the harmon-flow version from package.json for both source and built layouts.
 */
export function getFlowServerVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: unknown;
    };

    if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
      return packageJson.version;
    }
  } catch {
    // I keep the fallback because packaging errors should not crash the MCP server.
  }

  return FALLBACK_VERSION;
}
