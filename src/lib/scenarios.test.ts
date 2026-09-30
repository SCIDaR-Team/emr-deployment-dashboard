/**
 * The scenario engine.
 *
 * Its arithmetic is tested on a fixed sample of facilities (`src/test/fixtures`),
 * so a new revision of the workbook never breaks these tests. The published
 * data is held to the properties the engine relies on — true of any valid data,
 * so they name no figure. Whether its figures agree with the workbook's own is
 * `npm run data:check`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION, SAMPLE, byUuid, price } from '@/test/fixtures';
import { SCENARIO_PACKAGES } from './gapCatalogue';
import {
  facilityPaths,
  needGroups,
  planComposition,
  planForTarget,
  planScenario,
  scenarioBand,
  scenarioFor,
} from './scenarios';
import type { FacilitySummary, ScenarioComponentId } from './types';

const ALL_FIXES: ScenarioComponentId[] = [
  'router',
  'fibrex',
  'solar_topup',
  'full_solar',
  'network_extension',
  'satellite',
];
const EVERY = new Set(ALL_FIXES);
const byId = (id: string) => SCENARIO_PACKAGES.find((p) => p.id === id)!;
const {
  router,
  fibrex,
  solarTopup,
  fullSolar,
  fullSolarModerate,
  satellite,
  networkExtension,
  tablets,
  wiring,
  grid,
} = ACTION;

describe('scenarioBand', () => {
  it('is the facility’s own readiness when nothing is funded', () => {
    for (const f of SAMPLE) expect(scenarioBand(f, []), f.uuid).toBe(f.deploymentBand);
  });

  it('makes a facility Ready only when every fix it needs is funded', () => {
    expect(scenarioBand(byUuid('k2'), ['router'])).toBe('ready');
    // Needs a solar top-up too.
    expect(scenarioBand(byUuid('k4'), ['router'])).toBe('moderately_ready');
    expect(scenarioBand(byUuid('k4'), ['router', 'solar_topup'])).toBe('ready');
    // A router does nothing for a facility with no power: still Not ready.
    expect(scenarioBand(byUuid('k5'), ['router'])).toBe('not_ready');
  });

  it('makes every facility Ready when all six fixes are funded', () => {
    for (const f of SAMPLE) expect(scenarioBand(f, ALL_FIXES), f.uuid).toBe('ready');
  });
});

describe('scenarioFor', () => {
  it('counts what a package unlocks, and costs it where it unlocks', () => {
    const r = scenarioFor(SAMPLE, byId('router'));
    // k2, k3 and j1 need only a router; k4 and k5 need more.
    expect(r.distribution).toEqual({ ready: 5, moderately_ready: 3, not_ready: 3 });
    expect(r.readyToday).toBe(2);
    expect(r.unlocked).toBe(3);
    expect(r.costNGN).toBeCloseTo(3 * price(router), 0);
    // Every router needed, including the two that unlock nothing.
    expect(r.costEverywhereNGN).toBeCloseTo(5 * price(router), 0);
    expect(r.costPerUnlockedNGN).toBeCloseTo(price(router), 0);
  });

  it('prices a two-fix package at the facilities it makes Ready', () => {
    const r = scenarioFor(SAMPLE, byId('solar_topup_router'));
    expect(r.unlocked).toBe(4);
    expect(r.costNGN).toBeCloseTo(4 * price(router) + price(solarTopup), 0);
  });
});

describe('facilityPaths and needGroups', () => {
  const paths = facilityPaths(SAMPLE);
  const path = (uuid: string) => paths.find((p) => p.facility.uuid === uuid)!;

  it('lists the fixes each facility needs, and what they cost it', () => {
    expect(path('k1').needs).toEqual([]);
    expect(path('k4').needs).toEqual(['solar_topup', 'router']);
    expect(path('k4').costNGN).toBeCloseTo(price(solarTopup) + price(router), 0);
    // Tablets are no fix: they are not in what k3 costs to make Ready.
    expect(path('k3').costNGN).toBeCloseTo(price(router), 0);
    expect(paths.filter((p) => p.blockedOther)).toEqual([]);
  });

  it('groups the facilities not yet Ready by their fixes, cheapest first', () => {
    const groups = needGroups(paths);
    expect(groups.reduce((s, g) => s + g.facilities, 0)).toBe(9);
    expect(groups.find((g) => g.key === 'router')).toMatchObject({ facilities: 3 });
    const each = groups.map((g) => g.costEachNGN);
    expect(each).toEqual([...each].sort((a, b) => a - b));
  });
});

describe('planScenario', () => {
  const paths = facilityPaths(SAMPLE);
  const costs = paths
    .filter((p) => p.baseline !== 'ready')
    .map((p) => p.costNGN)
    .sort((a, b) => a - b);
  const cheapest = (k: number) => costs.slice(0, k).reduce((s, c) => s + c, 0);

  it('makes every facility Ready with every fix and no budget', () => {
    const plan = planScenario(paths, EVERY, null);
    expect(plan.after).toEqual({ ready: 11, moderately_ready: 0, not_ready: 0 });
    expect(plan.readyBefore).toBe(2);
    expect(plan.newlyReady).toBe(9);
  });

  it('spends a budget on the cheapest facilities first, and stops at the first it cannot pay for', () => {
    for (let k = 1; k <= costs.length; k += 1) {
      const plan = planScenario(paths, EVERY, cheapest(k));
      expect(plan.newlyReady, `${k} cheapest`).toBe(k);
      expect(plan.spendNGN).toBeCloseTo(cheapest(k), 0);
      const funded = plan.funded.map((p) => p.costNGN);
      expect(funded).toEqual([...funded].sort((a, b) => a - b));
      // A naira short of the k-th facility buys one fewer.
      expect(planScenario(paths, EVERY, cheapest(k) - 1).newlyReady).toBe(k - 1);
    }
  });

  it('buys none of a facility’s fixes unless all are chosen', () => {
    const plan = planScenario(paths, new Set(['router'] as const), null);
    expect(plan.newlyReady).toBe(3);
    expect(plan.bought.router).toEqual({ facilities: 3, costNGN: 3 * price(router) });
    // What the rest wait on: k4 a top-up; k5 and l3 full solar; j2, j3 and l1
    // their own connectivity fix.
    expect(plan.waitingOn).toMatchObject({
      solar_topup: 1,
      full_solar: 2,
      fibrex: 1,
      satellite: 1,
      network_extension: 1,
    });
  });

  it('never spends past the budget, and more money never makes fewer Ready', () => {
    let last = -1;
    for (const budget of [0, cheapest(2) / 2, cheapest(4), cheapest(7) + 1, cheapest(9)]) {
      const plan = planScenario(paths, EVERY, budget);
      expect(plan.spendNGN).toBeLessThanOrEqual(budget + 0.5);
      expect(plan.newlyReady).toBeGreaterThanOrEqual(last);
      last = plan.newlyReady;
    }
  });

  it('draws a curve that ends at everything reachable', () => {
    const plan = planScenario(paths, EVERY, null);
    const end = plan.curve[plan.curve.length - 1]!;
    expect(end.ready).toBe(plan.reachable.facilities);
    expect(end.spendNGN).toBeCloseTo(plan.reachable.costNGN, 0);
    expect(plan.reachable.costNGN).toBeCloseTo(cheapest(9), 0);
  });
});

describe('planComposition', () => {
  it('splits the whole plan into the readiness fixes and the rest, by phase', () => {
    const c = planComposition(SAMPLE);
    const fixes =
      5 * price(router) +
      price(fibrex) +
      price(solarTopup) +
      price(fullSolar) +
      price(satellite) +
      price(networkExtension) +
      price(fullSolarModerate);
    expect(c.readinessFixesNGN).toBeCloseTo(fixes, 0);
    expect(c.otherBeforeNGN).toBeCloseTo(3 * price(tablets), 0);
    expect(c.duringNGN).toBeCloseTo(price(wiring), 0);
    expect(c.afterNGN).toBeCloseTo(price(grid), 0);
    expect(c.totalNGN).toBeCloseTo(
      SAMPLE.reduce((s, f) => s + f.costNGN, 0),
      0,
    );
    // Every fix in the sample is at a facility all six fixes make Ready.
    expect(c.readinessFixesNGN).toBeCloseTo(planScenario(facilityPaths(SAMPLE), EVERY, null).spendNGN, 0);
  });
});

describe('planForTarget', () => {
  const paths = facilityPaths(SAMPLE);

  it('makes a number of facilities Ready at the lowest cost', () => {
    const byCount = planForTarget(paths, EVERY, { kind: 'facilities', n: 3 });
    expect(byCount.newlyReady).toBe(3);
    expect(byCount.spendNGN).toBeCloseTo(
      planScenario(paths, EVERY, null).funded.slice(0, 3).reduce((s, p) => s + p.costNGN, 0),
      0,
    );
    expect(byCount.shortfall).toBe(0);
  });

  it('reaches a share of all facilities, counting those Ready already', () => {
    const plan = planForTarget(paths, EVERY, { kind: 'share', pct: 50 });
    expect(plan.readyBefore + plan.newlyReady).toBe(Math.ceil(0.5 * 11));
  });

  it('says how far short a target falls when the fixes cannot reach it', () => {
    const plan = planForTarget(paths, new Set(['router'] as const), { kind: 'facilities', n: 5 });
    expect(plan.newlyReady).toBe(3);
    expect(plan.shortfall).toBe(2);
  });

  it('agrees with a budget when the facilities it buys are asked for by count', () => {
    const byBudget = planForTarget(paths, EVERY, { kind: 'budget', ngn: price(solarTopup) });
    const byCount = planForTarget(paths, EVERY, { kind: 'facilities', n: byBudget.newlyReady });
    expect(byCount.spendNGN).toBeCloseTo(byBudget.spendNGN, 0);
  });
});

/**
 * The published data, held to what the engine assumes of it. Each holds for
 * any valid revision of the workbook, so none names a figure — a data update
 * that breaks one has broken the dashboard's arithmetic, and the sync stops.
 */
describe('the published data', () => {
  const facilities: FacilitySummary[] = JSON.parse(
    readFileSync(join(__dirname, '../../public/data/facilities-summary.json'), 'utf8'),
  );
  const paths = facilityPaths(facilities);

  it('gives every facility the band the readiness rule gives it', () => {
    for (const f of facilities) expect(scenarioBand(f, []), f.uuid).toBe(f.deploymentBand);
  });

  it('leaves no facility out of reach of the six fixes', () => {
    expect(paths.filter((p) => p.blockedOther)).toEqual([]);
    for (const f of facilities) expect(scenarioBand(f, ALL_FIXES), f.uuid).toBe('ready');
  });

  it.each(SCENARIO_PACKAGES.map((p) => [p.id, p] as const))(
    'plans %s as the package table counts it',
    (_id, pkg) => {
      const plan = planScenario(paths, new Set(pkg.components), null);
      const table = scenarioFor(facilities, pkg);
      expect(plan.readyBefore + plan.newlyReady).toBe(table.distribution.ready);
      expect(plan.spendNGN).toBeCloseTo(table.costNGN, 0);
    },
  );

  it('prices every facility in a need group the same', () => {
    const notReady = paths.filter((p) => p.baseline !== 'ready');
    for (const g of needGroups(paths)) {
      const members = notReady.filter((p) => p.groupKey === g.key);
      expect(members.length).toBe(g.facilities);
      for (const m of members) expect(m.costNGN).toBe(g.costEachNGN);
    }
    expect(needGroups(paths).reduce((s, g) => s + g.facilities, 0)).toBe(notReady.length);
  });

  it('puts the readiness fixes and the other before-go-live work in the plan’s before phase', () => {
    const national = JSON.parse(
      readFileSync(join(__dirname, '../../public/data/national.json'), 'utf8'),
    );
    const c = planComposition(facilities);
    expect(c.readinessFixesNGN + c.otherBeforeNGN).toBeCloseTo(
      national.deployment.costByPhase.before,
      0,
    );
    expect(c.readinessFixesNGN).toBeCloseTo(planScenario(paths, EVERY, null).spendNGN, 0);
  });
});
