/* eslint-disable @typescript-eslint/no-explicit-any -- tests read deep into loosely shaped tool results and recorded requests. */
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadDashboardData, type DashboardData } from './data';
import { TOOLS, runTool } from './tools';

/**
 * The tools against the published data, checked on figures the pages
 * already show — so an assistant answer and the page it links to agree.
 */

let data: DashboardData;
beforeAll(async () => {
  data = await loadDashboardData(resolve(__dirname, '../../public/data'));
});

const ALL = ['router', 'fibrex', 'solar_topup', 'full_solar', 'network_extension', 'satellite'];
const call = (name: string, args: Record<string, unknown>) =>
  runTool(data, name, args) as Record<string, any>;

describe('tool schemas', () => {
  it('are strict: every property required, no extras', () => {
    for (const t of TOOLS) {
      const p = t.parameters as {
        properties: object;
        required: string[];
        additionalProperties: boolean;
      };
      expect(p.additionalProperties, t.name).toBe(false);
      expect([...p.required].sort(), t.name).toEqual(Object.keys(p.properties).sort());
    }
  });
});

describe('get_overview', () => {
  it('gives the national readiness split and plan total', () => {
    const r = call('get_overview', { state: null });
    expect(r.facilities).toBe(2806);
    expect(r.readiness.ready.facilities).toBe(170);
    expect(r.readiness.moderately_ready.facilities).toBe(1892);
    expect(r.readiness.not_ready.facilities).toBe(744);
    expect(r.plan.total).toBe('₦7.3bn');
  });

  it('forgives case and "State" for a state name', () => {
    const r = call('get_overview', { state: 'kano state' });
    expect(r.scope).toBe('Kano');
    expect(r.facilities).toBe(438);
    expect(r.links[0].href).toBe('/assessment?state=Kano');
  });

  it('says a state outside the assessment only has maturity', () => {
    const r = call('get_overview', { state: 'Edo' });
    expect(r.assessed).toBe(false);
    expect(r.maturity).toBeDefined();
  });

  it('returns an error the model can read for an unknown state', () => {
    expect(call('get_overview', { state: 'Atlantis' }).error).toMatch(/No state/);
  });
});

describe('find_facilities', () => {
  it('counts Not ready facilities in a state', () => {
    const r = call('find_facilities', {
      state: 'Kano',
      lga: null,
      band: 'not_ready',
      gap_area: null,
      waiting_on_fix: null,
      functionality_level: null,
      bhcpf: null,
      sort: 'cost_desc',
      limit: 5,
    });
    expect(r.matching).toBe(115);
    expect(r.facilities).toHaveLength(5);
    expect(r.facilities[0]).not.toHaveProperty('lat');
  });
});

describe('scenarios', () => {
  it('matches the builder: routers alone unlock 1,125 for ₦45m', () => {
    const r = call('run_scenario', {
      fixes: ['router'],
      target_kind: 'budget',
      target_value: null,
      states: null,
    });
    expect(r.unlocked).toBe(1125);
    expect(r.spend).toBe('₦45.0m');
    expect(r.links[0].href).toContain('#scenarios');
  });

  it('ranks states for ₦20m: Jigawa unlocks the most', () => {
    const r = call('rank_states_for_scenario', {
      fixes: ALL,
      target_kind: 'budget',
      target_value: 20_000_000,
    });
    expect(r.states[0].state).toBe('Jigawa');
    expect(r.states[0].unlocked).toBe(203);
    expect(r.spreadAcrossAllStates.unlocked).toBe(500);
  });

  it('says how the money is spent: per fix, and in the order it is spent', () => {
    const r = call('rank_states_for_scenario', {
      fixes: ALL,
      target_kind: 'budget',
      target_value: 20_000_000,
    });
    const jigawa = r.states[0];
    expect(jigawa.spend).toBe('₦19.8m');
    // The fixes bought add up to the spend: 7.76 + 8.4 + 2.88 + 0.75.
    expect(jigawa.spentOnEachFix).toEqual([
      { fix: 'Router', facilities: 194, cost: '₦7.8m' },
      { fix: 'FibreX', facilities: 8, cost: '₦2.9m' },
      { fix: 'Solar top-up', facilities: 4, cost: '₦8.4m' },
      { fix: 'Network extension', facilities: 1, cost: '₦750.0k' },
    ]);
    // Cheapest first; the 4 needing a top-up and a router count under both.
    const order = jigawa.spendingOrder.map(
      (g: { fixesNeeded: string; facilities: number }) => [g.fixesNeeded, g.facilities],
    );
    expect(order).toEqual([
      ['Router', 190],
      ['FibreX', 8],
      ['Network extension', 1],
      ['Solar top-up + Router', 4],
    ]);
    expect(jigawa.budgetLeftOver).toBe('₦210.0k');
    // The order is only spelled out for the top three.
    expect(r.states[3].spendingOrder).toBeUndefined();
    expect(r.states[3].spentOnEachFix).toBeDefined();
  });
});

describe('cost_breakdown', () => {
  it('splits by phase and by category', () => {
    const phase = call('cost_breakdown', { by: 'phase', state: null });
    expect(phase.rows.map((r: { label: string }) => r.label)).toContain('Before deployment');
    const cat = call('cost_breakdown', { by: 'category', state: null });
    expect(cat.rows[0].label).toBe('Power and wiring');
  });
});
