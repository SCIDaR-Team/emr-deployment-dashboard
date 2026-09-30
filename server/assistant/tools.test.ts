/* eslint-disable @typescript-eslint/no-explicit-any -- tests read deep into loosely shaped tool results and recorded requests. */
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatNaira } from '../../src/lib/format';
import { facilityPaths, planForTarget } from '../../src/lib/scenarios';
import type { ScenarioComponentId } from '../../src/lib/types';
import { loadDashboardData, type DashboardData } from './data';
import { TOOLS, runTool } from './tools';

/**
 * The tools against the published data, each checked against the same figure
 * worked out the way its page works it out — so an assistant answer and the
 * page it links to agree. No figure is written down here, so a new revision of
 * the data needs no change.
 */

let data: DashboardData;
beforeAll(async () => {
  data = await loadDashboardData(resolve(__dirname, '../../public/data'));
});

const ALL = ['router', 'fibrex', 'solar_topup', 'full_solar', 'network_extension', 'satellite'];
const naira = (n: number) => formatNaira(n, true);
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
    expect(r.facilities).toBe(data.facilities.length);
    for (const band of ['ready', 'moderately_ready', 'not_ready'] as const) {
      expect(r.readiness[band].facilities, band).toBe(
        data.facilities.filter((f) => f.deploymentBand === band).length,
      );
    }
    expect(r.plan.total).toBe(naira(data.facilities.reduce((s, f) => s + f.costNGN, 0)));
  });

  it('forgives case and "State" for a state name', () => {
    const r = call('get_overview', { state: 'kano state' });
    expect(r.scope).toBe('Kano');
    expect(r.facilities).toBe(data.facilitiesByState.get('Kano')!.length);
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
    const kano = data.facilitiesByState.get('Kano')!;
    expect(r.matching).toBe(kano.filter((f) => f.deploymentBand === 'not_ready').length);
    expect(r.facilities).toHaveLength(Math.min(5, r.matching));
    expect(r.facilities[0]).not.toHaveProperty('lat');
  });
});

/**
 * The scenario tools against the Scenarios section's own engine, run here on
 * the same data — so an answer and the page it links to agree, whatever the
 * figures are.
 */
describe('scenarios', () => {
  const BUDGET = 20_000_000;
  const planFor = (facilities: typeof data.facilities, fixes: string[], ngn: number | null) =>
    planForTarget(facilityPaths(facilities), new Set(fixes as ScenarioComponentId[]), {
      kind: 'budget',
      ngn,
    });

  it('matches the builder: routers alone, no budget limit', () => {
    const r = call('run_scenario', {
      fixes: ['router'],
      target_kind: 'budget',
      target_value: null,
      states: null,
    });
    const plan = planFor(data.facilities, ['router'], null);
    expect(r.unlocked).toBe(plan.newlyReady);
    expect(r.readyBefore).toBe(plan.readyBefore);
    expect(r.spend).toBe(naira(plan.spendNGN));
    expect(r.links[0].href).toContain('#scenarios');
  });

  it('ranks states by what the same budget unlocks in each', () => {
    const r = call('rank_states_for_scenario', {
      fixes: ALL,
      target_kind: 'budget',
      target_value: BUDGET,
    });
    const unlocked = r.states.map((s: { unlocked: number }) => s.unlocked);
    expect(unlocked).toEqual([...unlocked].sort((a, b) => b - a));
    expect(r.states).toHaveLength(data.facilitiesByState.size);
    for (const s of r.states) {
      expect(s.unlocked, s.state).toBe(
        planFor(data.facilitiesByState.get(s.state)!, ALL, BUDGET).newlyReady,
      );
    }
    expect(r.spreadAcrossAllStates.unlocked).toBe(planFor(data.facilities, ALL, BUDGET).newlyReady);
  });

  it('says how the money is spent: per fix, and in the order it is spent', () => {
    const r = call('rank_states_for_scenario', {
      fixes: ALL,
      target_kind: 'budget',
      target_value: BUDGET,
    });
    const top = r.states[0];
    const plan = planFor(data.facilitiesByState.get(top.state)!, ALL, BUDGET);
    expect(top.spend).toBe(naira(plan.spendNGN));
    expect(top.budgetLeftOver).toBe(naira(BUDGET - plan.spendNGN));
    // Per fix, what the plan buys; a facility needing two counts under both.
    expect(top.spentOnEachFix).toEqual(
      ALL.filter((f) => plan.bought[f as ScenarioComponentId].facilities).map((f) => ({
        fix: expect.any(String),
        facilities: plan.bought[f as ScenarioComponentId].facilities,
        cost: naira(plan.bought[f as ScenarioComponentId].costNGN),
      })),
    );
    // The order: need groups, cheapest first, covering every facility unlocked.
    const order = top.spendingOrder as { facilities: number; costEach: string }[];
    expect(order.reduce((s, g) => s + g.facilities, 0)).toBe(top.unlocked);
    const each = [...new Map(plan.funded.map((p) => [p.groupKey, p.costNGN])).values()];
    expect(order.map((g) => g.costEach)).toEqual(each.map(naira));
    expect(each).toEqual([...each].sort((a, b) => a - b));
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
