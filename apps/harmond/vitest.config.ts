import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    name: 'harmond',
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
        'dist/**',
      ],
    },
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    // Daemon tests may need longer timeouts for integration tests
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@sriinnu/harmon-protocol': path.resolve(__dirname, '../../packages/harmon-protocol/src'),
      '@sriinnu/harmon-store': path.resolve(__dirname, '../../packages/harmon-store/src'),
      '@sriinnu/harmon-core': path.resolve(__dirname, '../../packages/harmon-core/src'),
      '@sriinnu/harmon-spotify': path.resolve(__dirname, '../../packages/harmon-spotify/src'),
      '@sriinnu/harmon-apple': path.resolve(__dirname, '../../packages/harmon-apple/src'),
      '@sriinnu/harmon-logger': path.resolve(__dirname, '../../packages/harmon-logger/src'),
      '@sriinnu/harmon-crypto': path.resolve(__dirname, '../../packages/harmon-crypto/src'),
    },
  },
})
