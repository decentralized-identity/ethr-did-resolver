import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      // Allow importing the shared pattern implementations from the repo root src/
      '@patterns': fileURLToPath(new URL('../src/patterns', import.meta.url)),
      '@utils': fileURLToPath(new URL('../src/utils', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
