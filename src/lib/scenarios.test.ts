/**
 * The scenarios, against the published data and the workbook's own figures.
 *
 * Ten of the workbook's fourteen packages agree with the readiness rule in
 * every row, and their national figures are pinned here from its Cost summary
 * sheet. The other four are pinned at the dashboard's figure, with the
 * workbook's beside it in a comment — see docs/data-queries, query F.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENARIO_PACKAGES } from './gapCatalogue';
import { facilityPaths, planScenario, scenarioBand, scenarioFor } from './scenarios';
import type { FacilitySummary } from './types';

const facilities: FacilitySummary[] = JSON.parse(
  readFileSync(join(__dirname, '../../public/data/facilities-summary.json'), 'utf8'),
);

const byId = (id: string) => SCENARIO_PACKAGES.find((p) => p.id === id)!;

describe('scenarioBand', () => {
  it('is the facility’s own readiness when nothing is funded', () => {
    for (const f of facilities) expect(scenarioBand(f, []), f.uuid).toBe(f.deploymentBand);
  });

  it('makes every facility Ready when all six fixes are funded', () => {
    const all = ['router', 'fibrex', 'solar_topup', 'full_solar', 'network_extension', 'satellite'] as const;
    for (const f of facilities) expect(scenarioBand(f, all), f.uuid).toBe('ready');
  });
});

describe('scenarioFor, nationally', () => {
  it.each([
    // [package, ready after, moderately, not ready, cost to unlock (₦)]
    // The workbook's own Ready count agrees for these ten.
    ['solar_topup', 184, 1878, 744, 29_400_000],
    ['network_extension', 214, 1941, 651, 33_000_000],
    ['satellite', 226, 1916, 664, 168_000_000],
    ['solar_topup_router', 1421, 641, 744, 314_080_000],
    ['full_solar_router', 2231, 267, 308, 2_965_960_000],
    ['solar_topup_fibrex', 276, 1786, 744, 81_420_000],
    ['full_solar_fibrex', 403, 2095, 308, 510_270_000],
    ['full_solar_network_extension', 417, 2237, 152, 735_755_000],
    ['solar_topup_satellite', 245, 1897, 664, 222_900_000],
    ['full_solar_satellite', 418, 2232, 156, 1_033_320_000],
    // The four the workbook gets wrong. Its Ready counts: 1,940 / 330 / 56 / 231.
    ['router', 1295, 767, 744, 45_000_000],
    ['fibrex', 253, 1809, 744, 29_880_000],
    ['full_solar', 271, 2227, 308, 311_585_000],
    ['solar_topup_network_extension', 238, 1917, 651, 90_900_000],
  ])('%s', (id, ready, moderately, notReady, cost) => {
    const r = scenarioFor(facilities, byId(id as string));
    expect(r.distribution).toEqual({
      ready,
      moderately_ready: moderately,
      not_ready: notReady,
    });
    expect(r.readyToday).toBe(170);
    expect(r.unlocked).toBe((ready as number) - 170);
    expect(r.costNGN).toBeCloseTo(cost as number, 0);
  });
});

describe('planScenario', () => {
  const paths = facilityPaths(facilities);
  const ALL = new Set([
    'router',
    'fibrex',
    'solar_topup',
    'full_solar',
    'network_extension',
    'satellite',
  ] as const);

  it('leaves no facility out of reach of every fix', () => {
    expect(paths.filter((p) => p.blockedOther)).toEqual([]);
    for (const p of paths) {
      expect(p.needs.length === 0, p.facility.uuid).toBe(p.baseline === 'ready');
    }
  });

  it.each(SCENARIO_PACKAGES.map((p) => [p.id, p] as const))(
    'agrees with scenarioFor on %s, with no budget',
    (_id, pkg) => {
      const plan = planScenario(paths, new Set(pkg.components), null);
      const table = scenarioFor(facilities, pkg);
      expect(plan.readyBefore + plan.newlyReady).toBe(table.distribution.ready);
      expect(plan.spendNGN).toBeCloseTo(table.costNGN, 0);
      expect(plan.overBudget.facilities).toBe(0);
    },
  );

  it('makes every facility Ready with every fix and no budget', () => {
    const plan = planScenario(paths, ALL, null);
    expect(plan.after).toEqual({ ready: 2806, moderately_ready: 0, not_ready: 0 });
  });

  it('spends a budget on the cheapest facilities first', () => {
    // ₦45m is exactly the 1,125 facilities that need only a ₦40,000 router.
    const plan = planScenario(paths, ALL, 45_000_000);
    expect(plan.newlyReady).toBe(1125);
    expect(plan.spendNGN).toBe(45_000_000);
    expect(plan.bought.router).toEqual({ facilities: 1125, costNGN: 45_000_000 });
  });

  it('never spends past the budget, and more money never makes fewer Ready', () => {
    let last = -1;
    for (const budget of [0, 1e6, 5e7, 2.5e8, 1e9, 2.5e9, 5e9]) {
      const plan = planScenario(paths, ALL, budget);
      expect(plan.spendNGN).toBeLessThanOrEqual(budget + 0.5);
      expect(plan.newlyReady).toBeGreaterThanOrEqual(last);
      last = plan.newlyReady;
    }
  });

  it('draws a curve that ends at everything reachable', () => {
    const plan = planScenario(paths, ALL, null);
    const end = plan.curve[plan.curve.length - 1]!;
    expect(end.ready).toBe(plan.reachable.facilities);
    expect(end.spendNGN).toBeCloseTo(plan.reachable.costNGN, 0);
  });
});
