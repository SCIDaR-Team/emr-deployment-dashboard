import { dirname, join } from 'node:path';
import type { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { AssistantConfig } from './agent';
import { loadDashboardData, type DashboardData } from './data';
import { RateLimiter, configFromEnv, handleAssistantRequest, handleScenarioRequest } from './http';

/**
 * The assistant on AWS Lambda, behind a Function URL with response streaming
 * (`InvokeMode: RESPONSE_STREAM`), so the answer reaches the reader as it is
 * written. Put CloudFront in front with a `/api/assistant` behaviour pointing
 * at the Function URL and the dashboard calls it on its own origin — no CORS.
 * Built by `npm run build:assistant`; deployment notes in `server/README.md`.
 */

interface FunctionUrlEvent {
  rawPath?: string;
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  requestContext: { http: { method: string; sourceIp: string } };
}

declare const awslambda: {
  streamifyResponse(
    handler: (event: FunctionUrlEvent, responseStream: Writable) => Promise<void>,
  ): unknown;
  HttpResponseStream: {
    from(
      stream: Writable,
      meta: { statusCode: number; headers?: Record<string, string> },
    ): Writable;
  };
};

const limiter = new RateLimiter();
let dataPromise: Promise<DashboardData> | undefined;
const data = () =>
  (dataPromise ??= loadDashboardData(
    process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'data'),
  ));
let config: AssistantConfig | undefined;

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const cors: Record<string, string> = process.env.ASSISTANT_ALLOWED_ORIGIN
    ? {
        'Access-Control-Allow-Origin': process.env.ASSISTANT_ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    : {};
  const reply = (statusCode: number, body?: unknown) => {
    const out = awslambda.HttpResponseStream.from(responseStream, {
      statusCode,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
    out.end(body === undefined ? '' : JSON.stringify(body));
  };

  const method = event.requestContext.http.method;
  if (method === 'OPTIONS') return reply(204);
  if (method !== 'POST') return reply(405, { error: 'Use POST.' });

  try {
    config ??= configFromEnv();
  } catch (e) {
    console.error(e);
    return reply(500, {
      error: 'The assistant is not configured. Please tell the dashboard team.',
    });
  }

  const body = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '');
  // Behind CloudFront the Function URL sees CloudFront's address; the viewer's
  // is the first entry of X-Forwarded-For.
  const visitor =
    event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || event.requestContext.http.sourceIp;

  // `/api/assistant/scenario` turns words into scenario settings; anything
  // else under `/api/assistant` is the chat.
  if (event.rawPath?.endsWith('/scenario')) {
    const res = await handleScenarioRequest(body, visitor, { config, data, limiter });
    return reply(res.status, res.json);
  }

  const res = await handleAssistantRequest(body, visitor, { config, data, limiter });
  if ('json' in res) return reply(res.status, res.json);

  const out = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
  for await (const chunk of res.events) out.write(chunk);
  out.end();
});
