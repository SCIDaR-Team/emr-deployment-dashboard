import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AssistantConfig } from './agent';
import { loadDashboardData, type DashboardData } from './data';
import {
  RateLimiter,
  configFromEnv,
  handleAssistantRequest,
  handleExplainRequest,
  handleScenarioRequest,
} from './http';

/**
 * The endpoint as a plain Node `(req, res)` handler, for the hosts that speak
 * it: `npm run dev` (`dev.ts`) and Vercel (`api/assistant.ts`). AWS Lambda has
 * its own event shape and uses `lambda.ts`.
 */
export interface NodeHandlerOptions {
  /** Where the dashboard's data JSON is. */
  dataDir: string;
  limiter: RateLimiter;
  /** Who is asking, for the rate limit. */
  visitor: (req: IncomingMessage) => string;
  /** What to tell the reader when `OPENAI_*` is missing. */
  notConfigured: (message: string) => string;
}

export function createNodeHandler(options: NodeHandlerOptions) {
  const { dataDir, limiter, visitor, notConfigured } = options;
  let dataPromise: Promise<DashboardData> | undefined;
  let config: AssistantConfig | undefined;

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const json = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
    try {
      config ??= configFromEnv();
    } catch (e) {
      console.error(e);
      return json(500, { error: notConfigured((e as Error).message) });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const controller = new AbortController();
    res.on('close', () => controller.abort());

    const deps = {
      config,
      data: () => (dataPromise ??= loadDashboardData(dataDir)),
      limiter,
    };
    const body = Buffer.concat(chunks).toString('utf8');
    const who = visitor(req);

    // `/api/assistant/scenario` turns words into scenario settings, and
    // `/api/assistant/explain` explains a chart; anything else is the chat.
    // Under Vite's mount the path arrives without the `/api/assistant` prefix.
    const path = (req.url ?? '').split('?')[0]!.replace(/\/+$/, '');
    if (path.endsWith('/scenario')) {
      const result = await handleScenarioRequest(body, who, deps, controller.signal);
      return json(result.status, result.json);
    }

    const result = path.endsWith('/explain')
      ? await handleExplainRequest(body, who, deps, controller.signal)
      : await handleAssistantRequest(body, who, deps, controller.signal);
    if ('json' in result) return json(result.status, result.json);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    for await (const chunk of result.events) res.write(chunk);
    res.end();
  };
}
