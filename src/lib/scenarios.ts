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
