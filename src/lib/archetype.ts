/**
 * Domain roles, and the two roll-up rules that combine bands.
 *
 * The classification itself is not here. With no scores in the model there is
 * nothing to classify at runtime — a facility arrives from the data layer with
 * its band already set. What remains is the part that is genuinely a UI
 * concern: which domains gate readiness (so a page can say *why* a place sits
 * where it does), and how a set of bands rolls up into one.
 */

import type { Band, FacilityThemeId } from './types';
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
