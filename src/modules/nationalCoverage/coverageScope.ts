/**
 * Scope and lens for National Coverage.
 *
 * Both live in the URL and nowhere else — the path carries where you are
 * (`/states/kano/dala`) and one query parameter carries what you are looking at
 * (`?domain=workforce_capacity`). Nothing is held in a store.
 *
 * That is a deliberate constraint rather than a shortcut. This page has two
 * controls that set the same scope — the filter row and the map itself — and a
 * store would let them disagree. With the URL as the single source, clicking
 * Kano on the map and picking Kano from the dropdown are the same act, and
 * every view a reader reaches is a link they can send to someone else.
 */

import { BANDS } from '@/lib/bands';
import type { AreaProfile, Band, CoverageThemeId } from '@/lib/types';

/**
 * The domain lens.
 *
 * `overall` is not a domain — it is the absence of one, and it is what the page
 * opens on. Under it the map paints each area's overall band and the pane shows
 * every block; under a domain, both narrow to that domain.
 */
export type DomainLens = 'overall' | CoverageThemeId;

const LENSES: DomainLens[] = ['overall', 'technical_infrastructure', 'workforce_capacity'];

export function parseLens(raw: string | null): DomainLens {
  return LENSES.includes(raw as DomainLens) ? (raw as DomainLens) : 'overall';
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
 */
export function bandUnderLens(area: AreaProfile, lens: DomainLens): Band | null {
  return lens === 'overall' ? area.coverage.band : (area.coverage.themeBands[lens] ?? null);
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

/** Counts by a specific domain, regardless of the active lens — the national
 *  pane shows a block per domain when no lens is set. */
export function countByDomain(
  areas: AreaProfile[],
  themeId: CoverageThemeId,
): Record<Band, number> {
  return countByBand(areas, themeId);
}

export function totalOf(counts: Record<Band, number>): number {
  return BANDS.reduce((sum, b) => sum + counts[b], 0);
}
