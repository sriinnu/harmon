/**
 * web-app.ts — Locate the built harmon-web player so the daemon can serve it
 *
 * The daemon serves the web player itself at /app, so users never need a
 * separate static server. The dist is searched in order:
 *
 *   1. HARMON_WEB_DIST env override
 *   2. dist/web next to the running module (published npm bundle layout,
 *      where bundle.ts copies harmon-web/dist into the package)
 *   3. apps/harmon-web/dist relative to the module (monorepo layout)
 *   4. apps/harmon-web/dist relative to cwd (running from the repo root)
 *
 * @module web-app
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolve the web player's build output, or null when not built/present. */
export function resolveWebAppDist(): string | null {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.HARMON_WEB_DIST,
    path.resolve(moduleDir, 'web'),
    path.resolve(moduleDir, '../web'),
    path.resolve(moduleDir, '../../harmon-web/dist'),
    path.resolve(process.cwd(), 'apps/harmon-web/dist'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}
