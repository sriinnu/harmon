#!/usr/bin/env node
/**
 * I remove stale build outputs before a package rebuild so publish surfaces
 * cannot keep compiled files that TypeScript no longer owns.
 */

import { rmSync } from 'node:fs';
import path from 'node:path';

const [, , ...targets] = process.argv;

for (const target of targets) {
  if (!target) {
    continue;
  }

  rmSync(path.resolve(process.cwd(), target), { force: true, recursive: true });
}
