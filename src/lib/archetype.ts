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
 * workforce capacity.
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

/** The four facility domains. Local rather than imported from `themes` to keep
 *  this module free of UI concerns — the count is a fact about the dataset. */
const FACILITY_THEME_COUNT = 4;

/**
 * How many published readiness columns a domain selection resolves to.
 *
 * The whole Domain feature turns on this. The dataset publishes six readiness
 * columns per facility — two overall readings and four per-domain ones — and
 * **nothing in this app may produce a seventh.** A selection either names one
 * of those columns or it does not, and this says which case you are in:
 *
 *   overall   nothing ticked, or all four ticked. All four is the same
 *             statement as none — the reader has narrowed to everything — so
 *             it falls back to the published overall reading rather than
 *             claiming the four domains compose into it. They do not: the
 *             overall EMR-use column is the technical infrastructure column,
 *             identically, in all 2,806 rows, and the other three domains are
 *             not in it.
 *   single    one ticked. That domain's own published column.
 *   multi     two or three ticked. **No published column answers this**, so no
 *             single band may be shown for it. Surfaces that need one band
 *             fall back to the published overall; the pane shows the selected
 *             domains side by side instead, which is the honest reading.
 */
export type DomainSelectionMode = 'overall' | 'single' | 'multi';

export function domainSelectionMode(
  domains: readonly FacilityThemeId[],
): DomainSelectionMode {
  if (!domains.length || domains.length === FACILITY_THEME_COUNT) return 'overall';
  return domains.length === 1 ? 'single' : 'multi';
}

/**
 * A facility's readiness under the Domain filter. **The rule.**
 *
 * Everything the Domain control touches goes through here: the pane's counts,
 * the map's fills, the Gap filter, the badge on a list row. That is the point —
 * a count, a polygon's colour and a filtered list cannot disagree about what
 * "not ready" meant, because there is one function that decides it.
 *
 * **Every value it returns is a column the assessment published.** It composes
 * nothing. It used to: with several domains ticked it returned the weakest of
 * their bands, on the assessment's principle that strength in one domain cannot
 * offset a gap in another. That principle is sound and the number it produced
 * was not — no such column exists in the source, so the figure could not be
 * checked against anything, and the page was showing a derived band beside
 * published ones in the same visual language.
 *
 * So the three cases, per `domainSelectionMode`:
 *
 *   overall   the facility's published EMR-use band.
 *   single    that domain's published band.
 *   multi     the published EMR-use band again — a fallback, not an answer.
 *             Two ticked domains ask a question one swatch of colour cannot
 *             carry, and the pane answers it properly, one row per domain.
 *             Callers that can show more than one band should read
 *             `domainSelectionMode` and do so rather than calling this.
 *
 * **Which overall band, and why `useBand`.** The source carries two — how ready
 * the facility is to *run* an EMR, and whether anything blocks putting one in.
 * A map point is one colour and cannot show both, so this picks the use band,
 * because that is the scale the four domain bands are on. Ticking a domain then
 * narrows one question rather than switching to a different one, and a point's
 * colour means the same thing either way.
 *
 * The deployment band is not hidden by this — the pane shows both readings side
 * by side at every level, and the facility card shows both. What this function
 * decides is only what a single swatch of colour stands for.
 */
export function facilityBandUnder(
  facility: FacilitySummary,
  domains: readonly FacilityThemeId[],
): Band | null {
  if (domainSelectionMode(domains) !== 'single') return facility.useBand;
  return facility.themeBands[domains[0]!] ?? null;
}
