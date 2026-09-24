import OpenAI from 'openai';
import { runAssistant, type AssistantConfig, type AssistantEvent, type ChatMessage } from './agent';
import type { DashboardData } from './data';
import { interpretScenario, type InterpretResult } from './scenario';

/**
 * The assistant endpoint, independent of where it runs.
 *
 * `POST { messages: [{ role, content }, ...] }` answers with a stream of
 * server-sent events, one `AssistantEvent` each. The AWS Lambda handler and
 * the local development server are thin wrappers round this.
 *
 * The dashboard has no sign-in, so the endpoint is open to anyone who can
 * reach the page. What keeps that affordable is here — a cap on what one
 * request can carry, and a per-visitor rate limit — plus, in deployment, a
 * WAF rate rule and a monthly budget on the OpenAI project (see
 * `server/README.md`). The limiter is per server instance, so it is a speed
 * bump for one visitor, not a guarantee across a fleet.
 */

export const LIMITS = {
  messages: 20,
  userChars: 2000,
  assistantChars: 8000,
  requestsPerWindow: 20,
  windowMs: 10 * 60 * 1000,
};

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit = LIMITS.requestsPerWindow,
    private windowMs = LIMITS.windowMs,
  ) {}

  /** Record a request; false when this key is over its limit. */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number) {
    for (const [k, ts] of this.hits)
      if (!ts.some((t) => now - t < this.windowMs)) this.hits.delete(k);
  }
}

export function parseRequest(body: unknown): { messages: ChatMessage[] } | { error: string } {
  const raw = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(raw) || !raw.length) return { error: 'Send at least one message.' };
  if (raw.length > LIMITS.messages)
    return { error: 'This conversation is too long. Start a new one.' };
  const messages: ChatMessage[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (
      (role !== 'user' && role !== 'assistant') ||
      typeof content !== 'string' ||
      !content.trim()
    ) {
      return { error: 'Each message needs a role of user or assistant, and some text.' };
    }
    const cap = role === 'user' ? LIMITS.userChars : LIMITS.assistantChars;
    if (content.length > cap)
      return { error: `Keep a message under ${cap.toLocaleString()} characters.` };
    messages.push({ role, content });
  }
  if (messages[messages.length - 1]!.role !== 'user')
    return { error: 'The last message must be the question.' };
  return { messages };
}

/** Words a reader can act on, for the failures they might meet. */
export function friendlyError(e: unknown): string {
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) {
    return 'The assistant is not configured correctly. Please tell the dashboard team.';
  }
  if (e instanceof OpenAI.RateLimitError) {
    return 'The assistant is busy right now. Try again in a minute.';
  }
  if (e instanceof OpenAI.APIConnectionError) {
    return 'The assistant could not be reached. Check your connection and try again.';
  }
  if (e instanceof OpenAI.APIError) {
    return 'The assistant ran into a problem. Try again, or rephrase the question.';
  }
  return 'Something went wrong. Try again.';
}

export const sse = (event: AssistantEvent) => `data: ${JSON.stringify(event)}\n\n`;

export type AssistantResponse =
  { status: number; json: { error: string } } | { status: 200; events: AsyncGenerator<string> };

export async function handleAssistantRequest(
  bodyText: string,
  visitor: string,
  deps: { config: AssistantConfig; data: () => Promise<DashboardData>; limiter: RateLimiter },
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  if (!deps.limiter.take(visitor)) {
    return {
      status: 429,
      json: { error: 'You have asked a lot in a short time. Try again in a few minutes.' },
    };
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return { status: 400, json: { error: 'The request was not valid JSON.' } };
  }
  const parsed = parseRequest(body);
  if ('error' in parsed) return { status: 400, json: parsed };
  const { messages } = parsed;

  const data = await deps.data();
  async function* events(): AsyncGenerator<string> {
    try {
      for await (const event of runAssistant(deps.config, data, messages, signal)) {
        yield sse(event);
      }
    } catch (e) {
      if (signal?.aborted) return;
      console.error('assistant error', e);
      yield sse({ type: 'error', message: friendlyError(e) });
    }
  }
  return { status: 200, events: events() };
}

/**
 * `POST /api/assistant/scenario { text }` — a scenario described in words,
 * back as the Scenarios section's settings (see `scenario.ts`). JSON, not a
 * stream: the answer is one small object. Shares the rate limit with the chat.
 */
export async function handleScenarioRequest(
  bodyText: string,
  visitor: string,
  deps: { config: AssistantConfig; data: () => Promise<DashboardData>; limiter: RateLimiter },
  signal?: AbortSignal,
): Promise<{ status: number; json: InterpretResult }> {
  if (!deps.limiter.take(visitor)) {
    return {
      status: 429,
      json: { error: 'You have asked a lot in a short time. Try again in a few minutes.' },
    };
  }
  let text: unknown;
  try {
    text = (JSON.parse(bodyText) as { text?: unknown }).text;
  } catch {
    return { status: 400, json: { error: 'The request was not valid JSON.' } };
  }
  if (typeof text !== 'string' || !text.trim()) {
    return { status: 400, json: { error: 'Describe a scenario.' } };
  }
  if (text.length > 500) return { status: 400, json: { error: 'Keep it under 500 characters.' } };
  try {
    return {
      status: 200,
      json: await interpretScenario(deps.config, await deps.data(), text.trim(), signal),
    };
  } catch (e) {
    console.error('scenario error', e);
    return { status: 502, json: { error: friendlyError(e) } };
  }
}

/** The assistant's settings from the environment; throws naming what is
 *  missing, so a misconfigured deployment fails loudly on first use. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AssistantConfig {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set.');
  if (!env.OPENAI_MODEL) throw new Error('OPENAI_MODEL is not set — name the OpenAI model to use.');
  const effort = env.OPENAI_REASONING_EFFORT;
  if (effort && !['low', 'medium', 'high'].includes(effort)) {
    throw new Error('OPENAI_REASONING_EFFORT must be low, medium or high.');
  }
  return {
    client: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    model: env.OPENAI_MODEL,
    reasoningEffort: effort as AssistantConfig['reasoningEffort'],
    maxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS
      ? Number(env.OPENAI_MAX_OUTPUT_TOKENS)
      : undefined,
  };
}
