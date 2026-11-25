import { defineConfig } from 'vite';

// Relative base so the same build can be served from any path and later wrapped by Capacitor for mobile.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
