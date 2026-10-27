import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.ZYNC_SERVER || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': target,
      '/uploads': target,
      '/socket.io': { target, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
