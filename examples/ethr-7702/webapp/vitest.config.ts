// Vitest config for the webapp headless smoke test.
// Same aliases as vite.config.ts so the pattern registry's @patterns/@utils
// imports resolve to the shared repo-root implementations.

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@patterns': fileURLToPath(new URL('../src/patterns', import.meta.url)),
      '@utils': fileURLToPath(new URL('../src/utils', import.meta.url)),
    },
  },
  test: {
    include: [fileURLToPath(new URL('./src/**/*.test.ts', import.meta.url))],
    testTimeout: 120000,
    hookTimeout: 120000,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
})
