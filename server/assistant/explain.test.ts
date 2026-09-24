/* eslint-disable @typescript-eslint/no-explicit-any -- tests read recorded requests loosely. */
import { describe, expect, it } from 'vitest';
import type { ChartSnapshot } from '../../src/lib/explain/charts';
import type { AssistantEvent, ResponsesClient } from './agent';
import { EXPLAIN_INSTRUCTIONS, explainChart } from './explain';
import { RateLimiter, handleExplainRequest } from './http';

/**
 * "Explain this chart" with a stand-in model: no network, no spend. It replays
 * scripted stream events and records what it was sent.
 */

function scriptedClient(events: Record<string, unknown>[]) {
  const sent: Record<string, any>[] = [];
  const client = {
    responses: {
      create: async (body: Record<string, any>) => {
        sent.push(structuredClone(body));
        return (async function* () {
          yield* events;
        })();
      },
    },
  } as unknown as ResponsesClient;
  return { client, sent };
}

const text = (delta: string) => ({ type: 'response.output_text.delta', delta });

const snapshot: ChartSnapshot = {
  chart: 'assessment-facilities',
  title: 'Assessed facilities',
  scope: ['Area: Kano State'],
  tables: [
    {
      columns: ['Readiness', 'Facilities', 'Share'],
      rows: [
        ['Ready', '72', '16.4%'],
        ['Moderately ready', '251', '57.3%'],
        ['Not ready', '115', '26.3%'],
      ],
    },
  ],
};

async function collect(gen: AsyncGenerator<AssistantEvent>) {
  const out: AssistantEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('explainChart', () => {
  it('sends the figures with our own description of the chart, and streams the words', async () => {
    const { client, sent } = scriptedClient([
      text('## What this shows\n'),
      text('Kano: 72 Ready.'),
    ]);
    const events = await collect(explainChart({ client, model: 'test-model' }, snapshot));

    expect(events).toEqual([
      { type: 'text', delta: '## What this shows\n' },
      { type: 'text', delta: 'Kano: 72 Ready.' },
      { type: 'done' },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.instructions).toBe(EXPLAIN_INSTRUCTIONS);
    expect(sent[0]!.store).toBe(false);
    expect(sent[0]!.tools).toBeUndefined();
    const input = JSON.parse(sent[0]!.input);
    expect(input.how_to_read).toMatch(/Technical Infrastructure gaps alone/);
    expect(input.scope).toEqual(['Area: Kano State']);
    expect(input.tables[0].rows[0]).toEqual(['Ready', '72', '16.4%']);
  });

  it('passes a failed response on as an error', async () => {
    const { client } = scriptedClient([
      { type: 'response.failed', response: { error: { message: 'overloaded' } } },
    ]);
    const events = await collect(explainChart({ client, model: 'm' }, snapshot));
    expect(events).toEqual([{ type: 'error', message: 'overloaded' }]);
  });
});

describe('handleExplainRequest', () => {
  const deps = () => ({
    config: { client: scriptedClient([text('ok')]).client, model: 'm' },
    limiter: new RateLimiter(),
  });

  it('streams an explanation for a well-formed snapshot', async () => {
    const res = await handleExplainRequest(JSON.stringify(snapshot), 'v', deps());
    expect(res.status).toBe(200);
    const chunks: string[] = [];
    if ('events' in res) for await (const c of res.events) chunks.push(c);
    expect(chunks.join('')).toContain('"delta":"ok"');
  });

  it('turns away an unknown chart, a malformed table and an oversized body', async () => {
    const bad = (body: unknown) => handleExplainRequest(JSON.stringify(body), 'v', deps());
    expect((await bad({ ...snapshot, chart: 'anything' })).status).toBe(400);
    expect(
      (await bad({ ...snapshot, tables: [{ columns: ['a', 'b'], rows: [['only one']] }] })).status,
    ).toBe(400);
    expect((await bad({ ...snapshot, scope: ['x'.repeat(500)] })).status).toBe(400);
    const huge = { ...snapshot, tables: [{ columns: ['a'], rows: [['x'.repeat(45_000)]] }] };
    expect((await bad(huge)).status).toBe(413);
  });

  it('shares the rate limit', async () => {
    const limiter = new RateLimiter(1);
    const d = { ...deps(), limiter };
    expect((await handleExplainRequest(JSON.stringify(snapshot), 'v', d)).status).toBe(200);
    expect((await handleExplainRequest(JSON.stringify(snapshot), 'v', d)).status).toBe(429);
  });
});
