/**
 * Resolve the daemon version from package metadata for both source and built layouts.
 */

import { readFileSync } from 'node:fs';

const FALLBACK_VERSION = '0.0.0';
const PACKAGE_VERSION_PATHS = ['../package.json', '../../package.json'] as const;

/**
 * Read the daemon version from the nearest package.json that matches the current runtime layout.
 */
export function getDaemonVersion(): string {
  for (const relativePath of PACKAGE_VERSION_PATHS) {
    try {
      const packageJson = JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as {
        version?: unknown;
      };

      if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
        return packageJson.version;
      }
    } catch {
      // I fall through to the next candidate because source and build layouts differ.
    }
  }

  return FALLBACK_VERSION;
}
