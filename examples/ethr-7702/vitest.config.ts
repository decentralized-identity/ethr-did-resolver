import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.ts',
    setupFiles: './test/setup.ts',
    exclude: ['**/node_modules/**', 'webapp/**'],
    testTimeout: 60000,
    hookTimeout: 120000,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reportsDirectory: './coverage',
    },
  }
})
