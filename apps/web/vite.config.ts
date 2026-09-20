import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Consume the shared package's TS source directly so Vite treats it as ESM
      // (avoids CommonJS named-export interop issues in dev).
      '@wcu/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    allowedHosts: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});

