import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // Honour an assigned PORT so this can run alongside the other dashboards,
    // several of which also default to 5173.
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    // Keep the vendor chunk separate from the app so a page edit does not
    // invalidate React in the reader's cache.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
