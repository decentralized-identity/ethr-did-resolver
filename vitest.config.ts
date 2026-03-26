import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    testTimeout: 30000,
    environment: 'node',
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['json'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
    },
  },
})
