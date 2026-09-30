/**
 * The cost split by readiness, on a fixed sample of facilities.
 *
 * That the published figures match the workbook's own Cost summary sheet is
 * checked where the data is built — `npm run data:check` — so a new revision
 * of the workbook needs no change here.
 */

import { describe, expect, it } from 'vitest';
import { ACTION, SAMPLE, price } from '@/test/fixtures';
import { BREAKDOWNS, COST_CATEGORIES, readinessCostBy, readinessTotals } from './costByReadiness';
import type { Band } from './types';

const total = SAMPLE.reduce((s, f) => s + f.costNGN, 0);
const costOf = (band: Band) =>
  SAMPLE.filter((f) => f.deploymentBand === band).reduce((s, f) => s + f.costNGN, 0);

describe('readinessTotals', () => {
  it('splits the whole plan by the readiness of the facility each naira is spent on', () => {
    const t = readinessTotals(SAMPLE);
    expect(t.facilities).toEqual({ ready: 2, moderately_ready: 6, not_ready: 3 });
    // The Ready facilities' only cost is k1's wiring.
    expect(t.cost.ready).toBeCloseTo(price(ACTION.wiring), 0);
    expect(t.cost.moderately_ready).toBeCloseTo(costOf('moderately_ready'), 0);
    expect(t.cost.not_ready).toBeCloseTo(costOf('not_ready'), 0);
    expect(t.total).toBeCloseTo(total, 0);
  });
});

describe('readinessCostBy', () => {
  it.each(BREAKDOWNS.map((b) => [b.id]))('%s adds up to the whole plan', (breakdown) => {
    const rows = readinessCostBy(SAMPLE, breakdown);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBeCloseTo(total, 0);
    for (const r of rows) {
      expect(r.cost.ready + r.cost.moderately_ready + r.cost.not_ready).toBeCloseTo(r.total, 0);
    }
  });

  it('puts each facility’s whole cost in its own row', () => {
    const rows = readinessCostBy(SAMPLE, 'group');
    const nonBhcpf = rows.find((r) => r.label === 'Non-BHCPF')!;
    // l1 and l2: a network extension and a grid connection, at a Not ready facility.
    expect(nonBhcpf.cost).toEqual({
      ready: 0,
      moderately_ready: 0,
      not_ready: price(ACTION.networkExtension) + price(ACTION.grid),
    });
    expect(readinessCostBy(SAMPLE, 'zone').map((r) => r.label).sort()).toEqual([
      'North West',
      'South West',
    ]);
    // Largest first.
    const totals = readinessCostBy(SAMPLE, 'state').map((r) => r.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  it('splits one facility’s money across the categories of its actions', () => {
    const rows = readinessCostBy(SAMPLE, 'category');
    expect(rows.map((r) => r.label)).toEqual(COST_CATEGORIES.map((c) => c.label));
    // The tablets are k3's, which is Moderately ready.
    expect(rows.find((r) => r.id === 'devices')!.cost).toEqual({
      ready: 0,
      moderately_ready: 3 * price(ACTION.tablets),
      not_ready: 0,
    });
    expect(rows.find((r) => r.id === 'data_backup')!.total).toBe(0);
  });
});
