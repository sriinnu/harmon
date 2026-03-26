import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * I keep workspace package imports pointed at source during tests so the
 * runner exercises the real contract instead of stale build artifacts.
 */
const workspaceAlias = {
  '@athena/harmon': path.resolve(rootDir, 'apps/harmon-cli/src/index.ts'),
  '@athena/harmond': path.resolve(rootDir, 'apps/harmond/src/index.ts'),
  '@athena/harmon-apple': path.resolve(rootDir, 'packages/harmon-apple/src/index.ts'),
  '@athena/harmon-core': path.resolve(rootDir, 'packages/harmon-core/src/index.ts'),
  '@athena/harmon-crypto': path.resolve(rootDir, 'packages/harmon-crypto/src/index.ts'),
  '@athena/harmon-flow': path.resolve(rootDir, 'packages/harmon-flow/src/index.ts'),
  '@athena/harmon-logger': path.resolve(rootDir, 'packages/harmon-logger/src/index.ts'),
  '@athena/harmon-protocol': path.resolve(rootDir, 'packages/harmon-protocol/src/index.ts'),
  '@athena/harmon-spotify': path.resolve(rootDir, 'packages/harmon-spotify/src/index.ts'),
  '@athena/harmon-store': path.resolve(rootDir, 'packages/harmon-store/src/index.ts'),
  '@athena/harmon-youtube': path.resolve(rootDir, 'packages/harmon-youtube/src/index.ts'),
};

export default defineConfig({
  resolve: {
    alias: workspaceAlias,
  },
  test: {
    environment: 'node',
    include: ['apps/**/*.{test,spec}.{ts,js}', 'packages/**/*.{test,spec}.{ts,js}'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
