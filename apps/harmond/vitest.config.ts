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
      '@athena/harmon-protocol': path.resolve(__dirname, '../../packages/harmon-protocol/src'),
      '@athena/harmon-store': path.resolve(__dirname, '../../packages/harmon-store/src'),
      '@athena/harmon-core': path.resolve(__dirname, '../../packages/harmon-core/src'),
      '@athena/harmon-spotify': path.resolve(__dirname, '../../packages/harmon-spotify/src'),
      '@athena/harmon-apple': path.resolve(__dirname, '../../packages/harmon-apple/src'),
      '@athena/harmon-logger': path.resolve(__dirname, '../../packages/harmon-logger/src'),
      '@athena/harmon-crypto': path.resolve(__dirname, '../../packages/harmon-crypto/src'),
    },
  },
})
