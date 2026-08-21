/**
 * Domain roles, and the two roll-up rules that combine bands.
 *
 * The classification itself is not here. With no scores in the model there is
 * nothing to classify at runtime — a facility arrives from the data layer with
 * its band already set. What remains is the part that is genuinely a UI
 * concern: which domains gate readiness (so a page can say *why* a place sits
 * where it does), and how a set of bands rolls up into one.
 */

import type { Band, FacilitySummary, FacilityThemeId } from './types';
import { BAND_RANK } from './bands';

/**
 * Domains that gate readiness at facility level.
 *
 * The governing principle from the assessment: strong performance in
 * supporting domains cannot compensate for gaps in technical infrastructure or
 * workforce capacity. Leadership & Governance is also core, but it is assessed
 * at state level only and so does not appear here.
 */
export const FACILITY_CORE_THEMES: readonly FacilityThemeId[] = [
  'technical_infrastructure',
  'workforce_capacity',
] as const;

export const FACILITY_SUPPORTING_THEMES: readonly FacilityThemeId[] = [
  'workflow_transition',
  'data_use_reporting',
] as const;

/** Count bands into a distribution. Nulls are dropped from the counts but the
 *  caller keeps its own total, so an unbanded facility is never silently
 *  reclassified as Not ready. */
export function archetypeDistribution(bands: (Band | null)[]): Record<Band, number> {
  const dist: Record<Band, number> = {
    not_ready: 0,
    moderately_ready: 0,
    ready: 0,
  };
  for (const b of bands) if (b) dist[b] += 1;
  return dist;
}

/**
 * Final state deployment level: the state-level enabling environment combined
 * with the readiness of that state's facilities.
 *
 * The weaker of the two governs, except that a state strong on one side and
 * weak on the other cannot land at the bottom — the strength is real and the
 * plan for it differs from a state weak on both. Returns null when either
 * input is missing.
 */
export function stateDeploymentLevel(
  stateBand: Band | null,
  facilityBand: Band | null,
): Band | null {
  if (!stateBand || !facilityBand) return null;
  const worst = Math.min(BAND_RANK[stateBand], BAND_RANK[facilityBand]);
  const best = Math.max(BAND_RANK[stateBand], BAND_RANK[facilityBand]);
  if (worst === 1) return best === 3 ? 'moderately_ready' : 'not_ready';
  if (worst === 3) return 'ready';
  return 'moderately_ready';
}

/**
 * The weakest band in a set — how several domain readings roll up into one.
 *
 * A straight minimum, unlike `stateDeploymentLevel`'s floor, and for the
 * assessment's own reason: strong performance in one domain cannot compensate
 * for a gap in another. A facility that cannot keep the lights on is not ready,
 * however well its staff are trained. The floor above exists because a *state*
 * strong on one side of a two-sided reading has something real to build on;
 * four readings of the same facility are not two sides of anything.
 *
 * Nulls are skipped rather than dominating — an unscored domain is unknown, not
 * a gap. Null comes back only when nothing in the set was scored at all.
 */
export function worstBand(bands: (Band | null)[]): Band | null {
  let worst: Band | null = null;
  for (const band of bands) {
    if (band && (!worst || BAND_RANK[band] < BAND_RANK[worst])) worst = band;
  }
  return worst;
}

/**
 * A facility's readiness under the Domain filter. **The rule.**
 *
 * Everything the Domain control touches goes through here: the pane's counts,
 * the map's fills, the Gap filter, the badge on a list row. That is the point —
 * a count, a polygon's colour and a filtered list cannot disagree about what
 * "not ready" meant, because there is one function that decides it.
 *
 * Nothing ticked is not a fifth domain: it is the facility's own overall band,
 * which is what every figure on these pages meant before the control existed.
 */
export function facilityBandUnder(
  facility: FacilitySummary,
  domains: readonly FacilityThemeId[],
): Band | null {
  if (!domains.length) return facility.archetype;
  return worstBand(domains.map((d) => facility.themeBands[d] ?? null));
}
