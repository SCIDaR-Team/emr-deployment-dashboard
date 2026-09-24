/* eslint-disable @typescript-eslint/no-explicit-any -- tests read deep into loosely shaped tool results and recorded requests. */
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runAssistant, type AssistantEvent, type ResponsesClient } from './agent';
import { loadDashboardData, type DashboardData } from './data';
import { RateLimiter, handleAssistantRequest, parseRequest } from './http';

/**
 * The loop and the endpoint with a stand-in model: no network, no spend. The
 * stand-in replays scripted stream events — a tool call, then an answer — and
 * records what it was sent, so the tests check both halves: what the reader
 * receives and what the model is given back.
 */

let data: DashboardData;
beforeAll(async () => {
  data = await loadDashboardData(resolve(__dirname, '../../public/data'));
});

type Event = Record<string, unknown>;

function scriptedClient(rounds: Event[][]) {
  const sent: Record<string, any>[] = [];
  const client = {
    responses: {
      create: async (body: Record<string, any>) => {
        sent.push(structuredClone(body));
        const events = rounds.shift() ?? [];
        return (async function* () {
          yield* events;
        })();
      },
    },
  } as unknown as ResponsesClient;
  return { client, sent };
}

const toolCall = (name: string, args: object, call_id = 'call_1') => ({
  type: 'response.output_item.done',
  item: { type: 'function_call', name, arguments: JSON.stringify(args), call_id },
});
const text = (delta: string) => ({ type: 'response.output_text.delta', delta });
const message = (t: string) => ({
  type: 'response.output_item.done',
  item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: t }] },
});

async function collect(gen: AsyncGenerator<AssistantEvent>) {
  const out: AssistantEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('runAssistant', () => {
  it('runs the tool the model asks for and feeds the result back', async () => {
    const { client, sent } = scriptedClient([
      [toolCall('get_overview', { state: 'Kano' })],
      [text('Kano has 72 Ready facilities.'), message('Kano has 72 Ready facilities.')],
    ]);
    const events = await collect(
      runAssistant({ client, model: 'test-model' }, data, [
        { role: 'user', content: 'How is Kano doing?' },
      ]),
    );

    expect(events).toContainEqual({ type: 'activity', label: 'Reading the figures for Kano' });
    expect(events).toContainEqual({ type: 'text', delta: 'Kano has 72 Ready facilities.' });
    const links = events.find((e) => e.type === 'links');
    expect(links && 'links' in links && links.links[0]?.href).toBe('/assessment?state=Kano');
    expect(events.at(-1)).toEqual({ type: 'done' });

    // Second request carries the call and its result.
    expect(sent).toHaveLength(2);
    const output = sent[1]!.input.find((i: any) => i.type === 'function_call_output');
    expect(JSON.parse(output.output).facilities).toBe(438);
    expect(sent[0]!.store).toBe(false);
    expect(sent[0]!.tools).toHaveLength(8);
  });

  it('tells the model when its arguments are not JSON', async () => {
    const { client, sent } = scriptedClient([
      [
        {
          type: 'response.output_item.done',
          item: { type: 'function_call', name: 'get_overview', arguments: '{bad', call_id: 'c' },
        },
      ],
      [message('Sorry.')],
    ]);
    await collect(runAssistant({ client, model: 'm' }, data, [{ role: 'user', content: 'Hi' }]));
    const output = sent[1]!.input.find((i: any) => i.type === 'function_call_output');
    expect(JSON.parse(output.output).error).toMatch(/JSON/);
  });

  it('stops after too many rounds of lookups', async () => {
    const endless = Array.from({ length: 3 }, (_, i) => [
      toolCall('compare_states', { metric: 'facilities', zone: null }, `c${i}`),
    ]);
    const { client } = scriptedClient(endless);
    const events = await collect(
      runAssistant({ client, model: 'm', maxRounds: 3 }, data, [{ role: 'user', content: 'Loop' }]),
    );
    expect(events.at(-1)?.type).toBe('error');
  });

  it('asks for encrypted reasoning only for a reasoning model', async () => {
    const plain = scriptedClient([[message('ok')]]);
    await collect(
      runAssistant({ client: plain.client, model: 'm' }, data, [{ role: 'user', content: 'q' }]),
    );
    expect(plain.sent[0]!.include).toBeUndefined();
    const reasoning = scriptedClient([[message('ok')]]);
    await collect(
      runAssistant({ client: reasoning.client, model: 'm', reasoningEffort: 'low' }, data, [
        { role: 'user', content: 'q' },
      ]),
    );
    expect(reasoning.sent[0]!.include).toEqual(['reasoning.encrypted_content']);
  });
});

describe('the endpoint', () => {
  it('validates the conversation', () => {
    expect(parseRequest({})).toHaveProperty('error');
    expect(parseRequest({ messages: [{ role: 'system', content: 'x' }] })).toHaveProperty('error');
    expect(
      parseRequest({ messages: [{ role: 'user', content: 'x'.repeat(2001) }] }),
    ).toHaveProperty('error');
    expect(
      parseRequest({
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
        ],
      }),
    ).toHaveProperty('error');
    expect(parseRequest({ messages: [{ role: 'user', content: 'Hi' }] })).toEqual({
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('rate-limits one visitor without touching another', () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 1)).toBe(true);
    expect(limiter.take('a', 2)).toBe(false);
    expect(limiter.take('b', 2)).toBe(true);
    expect(limiter.take('a', 60_001)).toBe(true);
  });

  it('streams server-sent events', async () => {
    const { client } = scriptedClient([[text('Hello'), message('Hello')]]);
    const res = await handleAssistantRequest(
      JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      'visitor',
      { config: { client, model: 'm' }, data: async () => data, limiter: new RateLimiter() },
    );
    expect(res.status).toBe(200);
    const chunks: string[] = [];
    if ('events' in res) for await (const c of res.events) chunks.push(c);
    expect(chunks[0]).toBe('data: {"type":"text","delta":"Hello"}\n\n');
    expect(chunks.at(-1)).toBe('data: {"type":"done"}\n\n');
  });
});
