import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { AssistantConfig } from './agent';
import { loadDashboardData, type DashboardData } from './data';
import { RateLimiter, configFromEnv, handleAssistantRequest, handleScenarioRequest } from './http';

/**
 * The assistant inside `npm run dev`, mounted at `/api/assistant` by the Vite
 * plugin in `vite.config.ts`. Reads `OPENAI_*` from `.env.local` and the data
 * straight from `public/data`, so it answers from whatever the last ingest
 * produced.
 */

const limiter = new RateLimiter(200);
let dataPromise: Promise<DashboardData> | undefined;
let config: AssistantConfig | undefined;

export async function handleNodeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const json = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  try {
    config ??= configFromEnv();
  } catch (e) {
    return json(500, {
      error: `Assistant not configured: ${(e as Error).message} Add it to .env.local.`,
    });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const deps = {
    config,
    data: () => (dataPromise ??= loadDashboardData(resolve(process.cwd(), 'public/data'))),
    limiter,
  };
  const body = Buffer.concat(chunks).toString('utf8');
  const visitor = req.socket.remoteAddress ?? 'local';

  // Mounted at `/api/assistant`, so the path here is what follows it.
  if (req.url?.startsWith('/scenario')) {
    const res = await handleScenarioRequest(body, visitor, deps, controller.signal);
    return json(res.status, res.json);
  }

  const result = await handleAssistantRequest(body, visitor, deps, controller.signal);
  if ('json' in result) return json(result.status, result.json);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  for await (const chunk of result.events) res.write(chunk);
  res.end();
}
