import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'harmon-store',
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
    // Store tests may need longer timeouts for DB operations
    testTimeout: 10000,
  },
})
