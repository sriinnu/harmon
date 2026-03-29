import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 4173,
    proxy: {
      '/v1': 'http://127.0.0.1:17373',
      '/health': 'http://127.0.0.1:17373',
      '/player': 'http://127.0.0.1:17373',
    },
  },
});
