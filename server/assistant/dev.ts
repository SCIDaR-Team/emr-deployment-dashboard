import { resolve } from 'node:path';
import { RateLimiter } from './http';
import { createNodeHandler } from './node';

/**
 * The assistant inside `npm run dev`, mounted at `/api/assistant` by the Vite
 * plugin in `vite.config.ts`. Reads `OPENAI_*` from `.env.local` and the data
 * straight from `public/data`, so it answers from whatever the last ingest
 * produced.
 */
export const handleNodeRequest = createNodeHandler({
  dataDir: resolve(process.cwd(), 'public/data'),
  limiter: new RateLimiter(200),
  visitor: (req) => req.socket.remoteAddress ?? 'local',
  notConfigured: (message) => `Assistant not configured: ${message} Add it to .env.local.`,
});
