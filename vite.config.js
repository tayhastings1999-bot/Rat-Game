import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Only the real entry; the design prototypes in project/ are reference material.
  optimizeDeps: { entries: ['index.html'] },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
