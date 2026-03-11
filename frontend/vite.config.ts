import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5508',
      '/ws': { target: 'ws://127.0.0.1:5508', ws: true },
      '/frp-plugin': 'http://127.0.0.1:5508',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
