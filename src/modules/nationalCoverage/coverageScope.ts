/**
 * Scope and lens for National Coverage.
 *
 * Scope lives in the URL and nowhere else — the path carries where you are
 * (`/states/kano/dala`). That is a deliberate constraint rather than a
 * shortcut. This page has two controls that set the same scope — the filter row
 * and the map itself — and a store would let them disagree. With the URL as the
 * single source, clicking Kano on the map and picking Kano from the dropdown
 * are the same act, and every view a reader reaches is a link they can send to
 * someone else.
 *
 * The lens is the one thing held in the filter store, which mirrors it into
 * `?domain=workforce_capacity` — so it is still in the link, and it is still
 * one value with one owner. See the note in `NationalCoveragePage` for why it
 * cannot be written here directly.
 */

import { BANDS } from '@/lib/bands';
import { worstBand } from '@/lib/archetype';
import type { AreaProfile, Band, CoverageThemeId } from '@/lib/types';

/**
 * The domain lens: the domains ticked, in the order the page understands them.
 *
 * Empty is not a domain of its own — it is the absence of one, and it is what
 * the page opens on. Under it the map paints each area's overall band and the
 * pane shows every block; under one or more domains, both narrow to those.
 */
export type DomainLens = CoverageThemeId[];

const COVERAGE_IDS: CoverageThemeId[] = ['technical_infrastructure', 'workforce_capacity'];

/**
 * The filter store's domains, narrowed to the ones this page has a reading for.
 *
 * The Domain control is shared with Assessed States, which offers four domains
 * against the facility survey. This page reads `AreaProfile.coverage`, and a
 * state profile carries bands for two — Workflow & Transition is a question the
 * facility instrument asks and the coverage model does not. Anything it cannot
 * paint drops out here rather than arriving at a map as an unknown key.
 */
export function coverageLens(domains: readonly string[]): DomainLens {
  return COVERAGE_IDS.filter((id) => domains.includes(id));
}

export type Scope =
  | { level: 'national'; state: null; lga: null }
  | { level: 'state'; state: AreaProfile; lga: null }
  | { level: 'lga'; state: AreaProfile; lga: AreaProfile };

/**
 * Resolve the path into a scope.
 *
 * Falls back rather than erroring: an unknown state id resolves to national, an
 * unknown LGA to its state. A stale link should land somewhere sensible, not on
 * a blank page.
 */
export function resolveScope(
  states: AreaProfile[],
  lgas: AreaProfile[],
  stateId?: string,
  lgaId?: string,
): Scope {
  const state = stateId ? states.find((s) => s.id === stateId) : undefined;
  if (!state) return { level: 'national', state: null, lga: null };

  const lga = lgaId ? lgas.find((l) => l.id === `${state.id}.${lgaId}`) : undefined;
  if (!lga) return { level: 'state', state, lga: null };

  return { level: 'lga', state, lga };
}

/** The area whose figures the pane is showing. Null at national level, where
 *  the caller reads the national profile instead. */
export function scopedArea(scope: Scope): AreaProfile | null {
  return scope.level === 'lga' ? scope.lga : scope.level === 'state' ? scope.state : null;
}

/**
 * The band an area shows under the current lens.
 *
 * The one place the lens is applied to a band. Everything that paints — map
 * fills, list rows, the pane's own badge — goes through here, so the colour on
 * a polygon and the colour on its row in the list cannot disagree.
 *
 * Two domains roll up to the weaker of them, the same rule the facility page
 * uses: a state that cannot power a clinic is not ready to deploy into it,
 * however well staffed it is. That is what lets one polygon keep one fill while
 * the control behind it takes more than one answer.
 */
export function bandUnderLens(area: AreaProfile, lens: DomainLens): Band | null {
  if (!lens.length) return area.coverage.band;
  return worstBand(lens.map((id) => area.coverage.themeBands[id] ?? null));
}

/** Count areas by the band they show under the lens. */
export function countByBand(areas: AreaProfile[], lens: DomainLens): Record<Band, number> {
  const counts: Record<Band, number> = { not_ready: 0, moderately_ready: 0, ready: 0 };
  for (const area of areas) {
    const band = bandUnderLens(area, lens);
    if (band) counts[band] += 1;
  }
  return counts;
}

/** Counts by a specific domain, regardless of the active lens — the pane shows
 *  a block per domain, and each one reads only itself. */
export function countByDomain(
  areas: AreaProfile[],
  themeId: CoverageThemeId,
): Record<Band, number> {
  return countByBand(areas, [themeId]);
}

export function totalOf(counts: Record<Band, number>): number {
  return BANDS.reduce((sum, b) => sum + counts[b], 0);
}
