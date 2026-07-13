import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { getContentType, resolveStaticPath } from './serve.js';

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

describe('getContentType', () => {
  it('maps static asset extensions to browser content types', () => {
    expect(getContentType('/dist/logo.svg')).toBe('image/svg+xml');
    expect(getContentType('/dist/icon.png')).toBe('image/png');
    expect(getContentType('/dist/favicon.ico')).toBe('image/x-icon');
    expect(getContentType('/dist/font.woff2')).toBe('font/woff2');
    expect(getContentType('/dist/app.js')).toBe('text/javascript; charset=utf-8');
  });

  it('falls back to text/plain for unknown extensions', () => {
    expect(getContentType('/dist/archive.tar')).toBe('text/plain; charset=utf-8');
  });
});

function createStaticRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'harmon-web-'));
  tempRoots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><p>index</p>');
  return root;
}
