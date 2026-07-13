import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getDaemonVersion } from './version.js';

describe('getDaemonVersion', () => {
  it('reads the daemon version from package metadata', () => {
    // Compare against the real package.json so version bumps don't need a
    // hand-edited test.
    const packageJsonPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json',
    );
    const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version: string };
    expect(getDaemonVersion()).toBe(version);
  });
});
