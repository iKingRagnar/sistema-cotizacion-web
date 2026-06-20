import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Lazy chunks por módulo
        manualChunks: (id) => {
          if (id.includes('node_modules/lit')) return 'vendor-lit';
          if (id.includes('node_modules/chart.js')) return 'vendor-chart';
          if (id.includes('node_modules/leaflet')) return 'vendor-map';
          if (id.includes('src/modules/')) {
            const match = id.match(/src\/modules\/([^/]+)/);
            return match ? `module-${match[1]}` : undefined;
          }
        },
      },
    },
  },
});
