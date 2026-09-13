import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:9101';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: GATEWAY_URL, changeOrigin: true },
      '/health': { target: GATEWAY_URL, changeOrigin: true },
      '/metrics': { target: GATEWAY_URL, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
