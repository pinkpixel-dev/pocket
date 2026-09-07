import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.POCKET_API_TARGET ?? 'http://127.0.0.1:8420';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5273,
    // In development Vite serves the UI and forwards data calls to the API.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
