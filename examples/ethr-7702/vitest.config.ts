import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.ts',
    setupFiles: './test/setup.ts',
    testTimeout: 60000,
    hookTimeout: 120000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
})
