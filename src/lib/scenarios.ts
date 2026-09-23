/**
 * What-if scenarios: how many facilities would be Ready if only some of the
 * power and connectivity fixes were funded.
 *
 * Readiness is decided by the Technical Infrastructure actions alone, and only
 * power and facility connectivity ever produce a Major or Moderate one there —
 * so funding the six fixes those areas call for (router, FibreX, solar top-up,
 * full solar system, network extension, satellite) is what moves a facility's
 * band. A package funds one or two of them; this says what readiness would then
 * be, and what it costs.
 *
 * Computed here, from each facility's own actions, rather than read from the
 * workbook's scenario columns, for two reasons. It follows whatever facilities
 * the page has in scope — a state selection re-runs it. And four of the
 * workbook's fourteen scenario columns disagree with its own readiness rule
 * (docs/data-queries, query F); the ingest checks the other ten against the
 * sheet in every row, and pins the four so a change is noticed.
 */

import { ACTION_BY_ID, type ScenarioPackageDef } from './gapCatalogue';
import type { Band, FacilitySummary, ScenarioComponentId } from './types';

/**
 * A facility's readiness if a package is funded. **The rule** — the same one
 * `scenarioBand` in scripts/assessment-source.mjs checks against the workbook.
 *
 * Every Technical Infrastructure action the package does not close counts; the
 * worst of them decides the band. With nothing funded this is the facility's
 * own `deploymentBand`.
 */
export function scenarioBand(
  facility: FacilitySummary,
  components: readonly ScenarioComponentId[],
): Band {
  let band: Band = 'ready';
  for (const id of Object.keys(facility.actions)) {
    const action = ACTION_BY_ID[id];
    if (!action || action.domain !== 'technical_infrastructure') continue;
    if (action.scenario && components.includes(action.scenario)) continue;
    if (action.horizon === 'major') return 'not_ready';
    if (action.horizon === 'moderate') band = 'moderately_ready';
  }
  return band;
}

/** What a package's fixes cost at one facility, in its own quantities. */
function packageCost(
  facility: FacilitySummary,
  components: readonly ScenarioComponentId[],
): number {
  let cost = 0;
  for (const [id, qty] of Object.entries(facility.actions)) {
    const action = ACTION_BY_ID[id];
    if (!action?.scenario || !components.includes(action.scenario)) continue;
    cost += (action.unitCostNGN ?? 0) * qty;
  }
  return cost;
}

export interface ScenarioResult {
  pkg: ScenarioPackageDef;
  /** Readiness across the facilities in scope with the package funded. */
  distribution: Record<Band, number>;
  /** Ready before anything is funded. */
  readyToday: number;
  /** Facilities the package takes from Moderately or Not ready to Ready. */
  unlocked: number;
  /**
   * What the package's fixes cost **at the facilities it makes Ready** — the
   * money that buys `unlocked`. Not the cost of funding the fixes everywhere
   * they are needed: a router at a facility that also needs a solar system
   * leaves it not ready, and that spend is `costEverywhereNGN`.
   */
  costNGN: number;
  /** The package's fixes funded at every facility that needs them. */
  costEverywhereNGN: number;
  /** `costNGN` per facility unlocked, or null where nothing is unlocked. */
  costPerUnlockedNGN: number | null;
}

export function scenarioFor(
  facilities: readonly FacilitySummary[],
  pkg: ScenarioPackageDef,
): ScenarioResult {
  const distribution: Record<Band, number> = { not_ready: 0, moderately_ready: 0, ready: 0 };
  let readyToday = 0;
  let unlocked = 0;
  let costNGN = 0;
  let costEverywhereNGN = 0;

  for (const f of facilities) {
    const band = scenarioBand(f, pkg.components);
    distribution[band] += 1;
    const cost = packageCost(f, pkg.components);
    costEverywhereNGN += cost;
    if (f.deploymentBand === 'ready') {
      readyToday += 1;
    } else if (band === 'ready') {
      unlocked += 1;
      costNGN += cost;
    }
  }

  return {
    pkg,
    distribution,
    readyToday,
    unlocked,
    costNGN,
    costEverywhereNGN,
    costPerUnlockedNGN: unlocked ? costNGN / unlocked : null,
  };
}

// ---------------------------------------------------------------------------
// The scenario builder: any mix of fixes, under a budget
// ---------------------------------------------------------------------------

/**
 * What one facility needs to become Ready: the fixes, and what they cost.
 *
 * `needs` are the scenario components of its blocking Technical
 * Infrastructure actions — the fixes that must all be funded before it can be
 * Ready. Empty for a facility that is Ready already. `blockedOther` marks a
 * blocking action no fix covers, which would keep a facility out of reach of
 * every scenario; none exists in the data today, and the tests hold it there.
 */
export interface FacilityPath {
  facility: FacilitySummary;
  baseline: Band;
  needs: ScenarioComponentId[];
  /** The needs joined in a fixed order — the facility's "need group". */
  groupKey: string;
  costNGN: number;
  blockedOther: boolean;
}

const COMPONENT_ORDER: ScenarioComponentId[] = [
  'full_solar',
  'solar_topup',
  'router',
  'fibrex',
  'network_extension',
  'satellite',
];

export function facilityPaths(facilities: readonly FacilitySummary[]): FacilityPath[] {
  return facilities.map((facility) => {
    const needs = new Set<ScenarioComponentId>();
    let costNGN = 0;
    let blockedOther = false;
    for (const [id, qty] of Object.entries(facility.actions)) {
      const action = ACTION_BY_ID[id];
      if (!action || action.domain !== 'technical_infrastructure') continue;
      if (action.horizon !== 'major' && action.horizon !== 'moderate') continue;
      if (!action.scenario) {
        blockedOther = true;
        continue;
      }
      needs.add(action.scenario);
      costNGN += (action.unitCostNGN ?? 0) * qty;
    }
    const ordered = COMPONENT_ORDER.filter((c) => needs.has(c));
    return {
      facility,
      baseline: facility.deploymentBand ?? 'not_ready',
      needs: ordered,
      groupKey: ordered.join('+') || 'none',
      costNGN,
      blockedOther,
    };
  });
}

/**
 * The fixed order facilities are drawn in: Ready already, then everyone else
 * cheapest to make Ready first — the order a budget spends in when every fix
 * is allowed, so a growing budget sweeps across the field.
 */
export function fieldOrder(paths: readonly FacilityPath[]): FacilityPath[] {
  return [...paths].sort(
    (a, b) =>
      Number(a.baseline !== 'ready') - Number(b.baseline !== 'ready') ||
      Number(a.blockedOther) - Number(b.blockedOther) ||
      spendOrder(a, b),
  );
}

const BASELINE_RANK: Record<Band, number> = { ready: 0, moderately_ready: 1, not_ready: 2 };

/**
 * The order money reaches facilities: cheapest to make Ready first, then — for
 * facilities that cost the same — Moderately ready before Not ready, then by
 * need group, state and id. The field is drawn in this same order, so a budget
 * fills it in a clean line rather than leaving gaps, and equal-cost facilities
 * sit in solid runs of one colour rather than a salt-and-pepper mix.
 */
function spendOrder(a: FacilityPath, b: FacilityPath): number {
  return (
    a.costNGN - b.costNGN ||
    BASELINE_RANK[a.baseline] - BASELINE_RANK[b.baseline] ||
    a.groupKey.localeCompare(b.groupKey) ||
    a.facility.state.localeCompare(b.facility.state) ||
    a.facility.uuid.localeCompare(b.facility.uuid)
  );
}

export interface ScenarioPlan {
  /** Facilities the plan makes Ready, in the order the money reaches them. */
  funded: FacilityPath[];
  fundedIds: Set<string>;
  spendNGN: number;
  readyBefore: number;
  newlyReady: number;
  /** Readiness after: funded facilities are Ready, everyone else as before. */
  after: Record<Band, number>;
  /** What the plan buys, per fix: facilities it goes to, and its cost. */
  bought: Record<ScenarioComponentId, { facilities: number; costNGN: number }>;
  /** Of the facilities still not Ready, how many wait on each unfunded fix. A
   *  facility waiting on two counts under both. */
  waitingOn: Record<ScenarioComponentId, number>;
  /** Facilities the chosen fixes could make Ready but the budget does not
   *  reach, and what reaching them all would cost. */
  overBudget: { facilities: number; costNGN: number };
  /** Every facility the chosen fixes could make Ready, with no budget. */
  reachable: { facilities: number; costNGN: number };
  /** Cumulative facilities made Ready against spend, for the chosen fixes, at
   *  each point the per-facility cost changes — exact, because within a need
   *  group every facility costs the same. Starts at (0, 0). */
  curve: { spendNGN: number; ready: number }[];
}

const emptyByComponent = <T,>(make: () => T) =>
  Object.fromEntries(COMPONENT_ORDER.map((c) => [c, make()])) as Record<ScenarioComponentId, T>;

/**
 * Fund the chosen fixes, cheapest facility first, until the budget runs out.
 *
 * Money only goes where it makes a facility Ready: a router at a facility that
 * also needs solar power buys no readiness, so it is not bought. Each facility
 * counts the same, so spending in ascending order of cost to make Ready gives
 * the most facilities for any budget — the greedy order is optimal here, not a
 * heuristic. With no budget (`null`) the Ready count is `scenarioFor`'s.
 */
export function planScenario(
  paths: readonly FacilityPath[],
  allowed: ReadonlySet<ScenarioComponentId>,
  budgetNGN: number | null,
  /** Stop once this many facilities are made Ready. The cheapest-first order
   *  that maximises facilities for a budget also minimises cost for a count. */
  countLimit: number | null = null,
): ScenarioPlan {
  const eligible = paths
    .filter(
      (p) =>
        p.baseline !== 'ready' &&
        !p.blockedOther &&
        p.needs.length > 0 &&
        p.needs.every((c) => allowed.has(c)),
    )
    .sort(spendOrder);

  const funded: FacilityPath[] = [];
  let spendNGN = 0;
  for (const p of eligible) {
    if (countLimit !== null && funded.length >= countLimit) break;
    if (budgetNGN !== null && spendNGN + p.costNGN > budgetNGN + 0.5) break;
    funded.push(p);
    spendNGN += p.costNGN;
  }
  const fundedIds = new Set(funded.map((p) => p.facility.uuid));

  const after: Record<Band, number> = { ready: 0, moderately_ready: 0, not_ready: 0 };
  const bought = emptyByComponent(() => ({ facilities: 0, costNGN: 0 }));
  const waitingOn = emptyByComponent(() => 0);
  let readyBefore = 0;

  for (const p of paths) {
    if (p.baseline === 'ready') readyBefore += 1;
    const band = fundedIds.has(p.facility.uuid) ? 'ready' : p.baseline;
    after[band] += 1;
    if (band !== 'ready') {
      for (const c of p.needs) if (!allowed.has(c)) waitingOn[c] += 1;
    }
  }
  for (const p of funded) {
    for (const [id, qty] of Object.entries(p.facility.actions)) {
      const a = ACTION_BY_ID[id];
      if (!a?.scenario || !p.needs.includes(a.scenario)) continue;
      bought[a.scenario].facilities += 1;
      bought[a.scenario].costNGN += (a.unitCostNGN ?? 0) * qty;
    }
  }

  const reachableCost = eligible.reduce((s, p) => s + p.costNGN, 0);
  const curve = [{ spendNGN: 0, ready: 0 }];
  let cum = 0;
  eligible.forEach((p, i) => {
    cum += p.costNGN;
    const next = eligible[i + 1];
    if (!next || next.costNGN !== p.costNGN) curve.push({ spendNGN: cum, ready: i + 1 });
  });

  return {
    funded,
    fundedIds,
    spendNGN,
    readyBefore,
    newlyReady: funded.length,
    after,
    bought,
    waitingOn,
    overBudget: {
      facilities: eligible.length - funded.length,
      costNGN: reachableCost - spendNGN,
    },
    reachable: { facilities: eligible.length, costNGN: reachableCost },
    curve,
  };
}

/**
 * Where the readiness fixes sit inside the whole plan.
 *
 * The builder funds only the power and connectivity fixes that decide
 * readiness — about ₦4.7bn for every facility. The plan's other money does
 * not move a facility's band: tablets and backup-power repair are needed before
 * go-live too (the two together are the gap between ₦4.7bn and the ₦6.1bn
 * "before deployment"), wiring and furniture go in during deployment, and grid
 * connections come after. Split here so the builder can say so, and so the
 * three figures a reader meets on the page visibly add up.
 */
export function planComposition(facilities: readonly FacilitySummary[]): {
  readinessFixesNGN: number;
  otherBeforeNGN: number;
  duringNGN: number;
  afterNGN: number;
  totalNGN: number;
} {
  let readinessFixesNGN = 0;
  let otherBeforeNGN = 0;
  let duringNGN = 0;
  let afterNGN = 0;
  for (const f of facilities) {
    for (const [id, qty] of Object.entries(f.actions)) {
      const a = ACTION_BY_ID[id];
      if (!a || a.unitCostNGN === null) continue;
      const cost = a.unitCostNGN * qty;
      if (a.scenario) readinessFixesNGN += cost;
      else if (a.phase === 'before') otherBeforeNGN += cost;
      else if (a.phase === 'during') duringNGN += cost;
      else afterNGN += cost;
    }
  }
  return {
    readinessFixesNGN,
    otherBeforeNGN,
    duringNGN,
    afterNGN,
    totalNGN: readinessFixesNGN + otherBeforeNGN + duringNGN + afterNGN,
  };
}

export interface NeedGroup {
  key: string;
  needs: ScenarioComponentId[];
  facilities: number;
  /** What one facility in the group costs to make Ready — the same for every
   *  facility in it. */
  costEachNGN: number;
  costNGN: number;
}

/**
 * The facilities not yet Ready, grouped by the fixes they need, in the order
 * money reaches them — cheapest to make Ready first. This is the queue a budget
 * works down, and the builder draws it as one.
 */
export function needGroups(paths: readonly FacilityPath[]): NeedGroup[] {
  const groups = new Map<string, NeedGroup>();
  for (const p of paths) {
    if (p.baseline === 'ready' || p.blockedOther || !p.needs.length) continue;
    const g = groups.get(p.groupKey) ?? {
      key: p.groupKey,
      needs: p.needs,
      facilities: 0,
      costEachNGN: p.costNGN,
      costNGN: 0,
    };
    g.facilities += 1;
    g.costNGN += p.costNGN;
    groups.set(p.groupKey, g);
  }
  return [...groups.values()].sort(
    (a, b) => a.costEachNGN - b.costEachNGN || a.key.localeCompare(b.key),
  );
}

/**
 * What a scenario is steered by: money, a number of facilities, or a share of
 * all facilities Ready.
 *
 *   budget      spend up to this; `null` is no limit
 *   facilities  make this many *more* facilities Ready, as cheaply as possible
 *   share       reach this percentage of all facilities Ready, counting the
 *               ones Ready already
 */
export type ScenarioTarget =
  | { kind: 'budget'; ngn: number | null }
  | { kind: 'facilities'; n: number }
  | { kind: 'share'; pct: number };

export interface TargetPlan extends ScenarioPlan {
  target: ScenarioTarget;
  /** Facilities the target asked for that the chosen fixes cannot reach. */
  shortfall: number;
}

/** Plan a scenario to its target. See `ScenarioTarget`. */
export function planForTarget(
  paths: readonly FacilityPath[],
  allowed: ReadonlySet<ScenarioComponentId>,
  target: ScenarioTarget,
): TargetPlan {
  if (target.kind === 'budget') {
    return {
      ...planScenario(paths, allowed, target.ngn),
      target,
      shortfall: 0,
    };
  }
  const readyBefore = paths.filter((p) => p.baseline === 'ready').length;
  const wanted =
    target.kind === 'facilities'
      ? Math.max(0, Math.round(target.n))
      : Math.max(0, Math.ceil((target.pct / 100) * paths.length) - readyBefore);
  const plan = planScenario(paths, allowed, null, wanted);
  return { ...plan, target, shortfall: Math.max(0, wanted - plan.newlyReady) };
}
