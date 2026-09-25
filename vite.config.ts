import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * The AI assistant's endpoint during `npm run dev`, at `/api/assistant`. The
 * handler is loaded through Vite on each request, so edits to `server/` apply
 * without a restart. Deployed, the same endpoint runs on Vercel or AWS Lambda.
 */
function assistantDevServer(): Plugin {
  return {
    name: 'assistant-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/assistant', (req, res, next) => {
        server
          .ssrLoadModule('/server/assistant/dev.ts')
          .then((mod) => mod.handleNodeRequest(req, res))
          .catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // OPENAI_* from .env.local reach the dev endpoint; nothing prefixed that way
  // is ever exposed to the browser bundle, which only sees VITE_*.
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'OPENAI_'));
  return {
    plugins: [react(), assistantDevServer()],
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
  };
});
