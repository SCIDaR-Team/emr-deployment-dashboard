import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RateLimiter } from './http';
import { createNodeHandler } from './node';

/**
 * The assistant as a Vercel function, while the dashboard is hosted there
 * (AWS, with `lambda.ts`, is the final home). `scripts/build-vercel.mjs`
 * bundles this with the data beside it and serves it at `/api/assistant`,
 * `/api/assistant/scenario` and `/api/assistant/explain`. `OPENAI_*` come from
 * the Vercel project's environment variables.
 */
export default createNodeHandler({
  dataDir: join(dirname(fileURLToPath(import.meta.url)), 'data'),
  limiter: new RateLimiter(),
  // Vercel sets X-Forwarded-For to the viewer's address, overwriting any value
  // the client sent.
  visitor: (req) =>
    String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown',
  notConfigured: () => 'The assistant is not configured. Please tell the dashboard team.',
});
