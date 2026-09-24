/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely shaped results and recorded requests. */
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ResponsesClient } from './agent';
import { loadDashboardData, type DashboardData } from './data';
import { RateLimiter, handleScenarioRequest } from './http';
import { interpretScenario, toSpecs } from './scenario';

/**
 * Words to scenario settings. `toSpecs` is where every value the model gives
 * is checked against the data, so most tests drive it directly with the kind
 * of JSON the model returns; one drives the whole call with a stand-in model.
 */

let data: DashboardData;
beforeAll(async () => {
  data = await loadDashboardData(resolve(__dirname, '../../public/data'));
});

const scenario = (over: Record<string, unknown> = {}) => ({
  name: 'Routers, ₦20m',
  fixes: ['router'],
  target_kind: 'budget',
  target_value: 20_000_000,
  states: [],
  zones: [],
  ...over,
});
const reply = (over: Record<string, unknown> = {}) => ({
  understood: true,
  view: 'single',
  scenarios: [scenario()],
  note: '',
  ...over,
});

describe('toSpecs', () => {
  it('turns a budget scenario into the builder settings and says what it read', () => {
    const r = toSpecs(data, reply()) as any;
    expect(r.view).toBe('single');
    expect(r.specs[0]).toEqual({
      name: 'Routers, ₦20m',
      fixes: ['router'],
      target: { kind: 'budget', ngn: 20_000_000 },
      states: [],
    });
    expect(r.summary[0]).toBe('Router · ₦20.0m budget · all 12 states');
  });

  it('expands a zone into the assessed states in it', () => {
    const r = toSpecs(data, reply({ scenarios: [scenario({ zones: ['North West'] })] })) as any;
    expect(r.specs[0].states).toEqual(['jigawa', 'kano']);
    expect(r.summary[0]).toContain('Jigawa, Kano');
  });

  it('drops a place that is not an assessed state, and says so', () => {
    const r = toSpecs(
      data,
      reply({ scenarios: [scenario({ states: ['Kano', 'Edo', 'Atlantis'] })] }),
    ) as any;
    expect(r.specs[0].states).toEqual(['kano']);
    expect(r.ignored).toEqual(['Edo', 'Atlantis']);
  });

  it('uses all six fixes when none are named, and no limit when no amount is', () => {
    const r = toSpecs(
      data,
      reply({ scenarios: [scenario({ fixes: [], target_value: null })] }),
    ) as any;
    expect(r.specs[0].fixes).toHaveLength(6);
    expect(r.specs[0].target).toEqual({ kind: 'budget', ngn: null });
    expect(r.summary[0]).toBe('All six fixes · no budget limit · all 12 states');
  });

  it('reads facilities and share targets', () => {
    const f = toSpecs(
      data,
      reply({ scenarios: [scenario({ target_kind: 'facilities', target_value: 1000 })] }),
    ) as any;
    expect(f.specs[0].target).toEqual({ kind: 'facilities', n: 1000 });
    const s = toSpecs(
      data,
      reply({ scenarios: [scenario({ target_kind: 'share', target_value: 150 })] }),
    ) as any;
    expect(s.specs[0].target).toEqual({ kind: 'share', pct: 100 });
  });

  it('clears the scope for a by-state view, which ranks every state', () => {
    const r = toSpecs(
      data,
      reply({ view: 'states', scenarios: [scenario({ states: ['Kano'] })] }),
    ) as any;
    expect(r.view).toBe('states');
    expect(r.specs[0].states).toEqual([]);
    expect(r.summary[0]).toContain('in each state');
  });

  it('keeps at most four scenarios to compare, and one otherwise', () => {
    const five = Array.from({ length: 5 }, (_, i) => scenario({ name: `S${i}` }));
    expect((toSpecs(data, reply({ view: 'compare', scenarios: five })) as any).specs).toHaveLength(
      4,
    );
    expect((toSpecs(data, reply({ view: 'single', scenarios: five })) as any).specs).toHaveLength(
      1,
    );
  });

  it('passes on what to add when the text is not a scenario', () => {
    expect(
      toSpecs(data, reply({ understood: false, scenarios: [], note: 'Name a budget.' })),
    ).toEqual({
      error: 'Name a budget.',
    });
    expect(toSpecs(data, {})).toHaveProperty('error');
  });
});

describe('interpretScenario', () => {
  it('asks for strict JSON and checks what comes back', async () => {
    const sent: any[] = [];
    const client = {
      responses: {
        create: async (body: any) => {
          sent.push(body);
          return {
            output_text: JSON.stringify(
              reply({ scenarios: [scenario({ zones: ['North West'] })] }),
            ),
          };
        },
      },
    } as unknown as ResponsesClient;
    const r = (await interpretScenario(
      { client, model: 'm' },
      data,
      '₦20m on routers in the North West',
    )) as any;
    expect(r.specs[0].states).toEqual(['jigawa', 'kano']);
    expect(sent[0].text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(sent[0].store).toBe(false);
    expect(sent[0].instructions).toContain('Kano');
  });

  it('turns unreadable output into a message', async () => {
    const client = {
      responses: { create: async () => ({ output_text: 'not json' }) },
    } as unknown as ResponsesClient;
    expect(await interpretScenario({ client, model: 'm' }, data, 'x')).toHaveProperty('error');
  });
});

describe('handleScenarioRequest', () => {
  const stub = {
    responses: {
      create: async () => ({ output_text: JSON.stringify(reply()) }),
    },
  } as unknown as ResponsesClient;

  it('answers with the settings, and turns away empty or overlong text', async () => {
    const deps = {
      config: { client: stub, model: 'm' },
      data: async () => data,
      limiter: new RateLimiter(),
    };
    const ok = await handleScenarioRequest(JSON.stringify({ text: '₦20m on routers' }), 'v', deps);
    expect(ok.status).toBe(200);
    expect((ok.json as any).specs[0].fixes).toEqual(['router']);
    expect((await handleScenarioRequest(JSON.stringify({ text: ' ' }), 'v', deps)).status).toBe(
      400,
    );
    expect(
      (await handleScenarioRequest(JSON.stringify({ text: 'x'.repeat(501) }), 'v', deps)).status,
    ).toBe(400);
    expect((await handleScenarioRequest('{bad', 'v', deps)).status).toBe(400);
  });

  it('shares the rate limit', async () => {
    const deps = {
      config: { client: stub, model: 'm' },
      data: async () => data,
      limiter: new RateLimiter(1, 60_000),
    };
    expect((await handleScenarioRequest(JSON.stringify({ text: 'a' }), 'v', deps)).status).toBe(
      200,
    );
    expect((await handleScenarioRequest(JSON.stringify({ text: 'a' }), 'v', deps)).status).toBe(
      429,
    );
  });
});
