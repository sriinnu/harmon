import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveStaticPath } from './serve.js';

const tempRoots: string[] = [];

describe('resolveStaticPath', () => {
  afterEach(() => {
    tempRoots.length = 0;
  });

  it('rejects path traversal outside the dist root', () => {
    const root = createStaticRoot();

    expect(resolveStaticPath(root, '/../../../../etc/passwd')).toBeNull();
  });

  it('falls back to index.html for extensionless client routes', () => {
    const root = createStaticRoot();

    expect(resolveStaticPath(root, '/playlists/focus')).toBe(join(root, 'index.html'));
  });
});

function createStaticRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'harmon-web-'));
  tempRoots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><p>index</p>');
  return root;
}
