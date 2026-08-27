/**
 * Scope for Assessed States.
 *
 * Four levels, one more than National Coverage. That extra level is the whole
 * reason the two pages differ: coverage rests on a model that classifies areas,
 * so an LGA is the smallest thing it can say anything about, while this page
 * rests on a survey of individual facilities — so it can go down to the thing
 * that was actually visited and name it.
 *
 * The path carries all four (`/assessment/kano/dala/f-00042`) and nothing is
 * held in a store, for the same reason as on the other page: the filter row,
 * the map and the pane's list all set scope, and a store would let them
 * disagree. The query string stays for the filters, which narrow the population
 * rather than move around it — the path is where you are, the query is what you
 * are looking at.
 *
 * Only the 12 surveyed states resolve. A path naming one of the other 25 falls
 * back to the top level rather than opening an empty state: there is no survey
 * under it, and a page of zeroes would read as a finding rather than an absence.
 */

import { facilityBandUnder } from '@/lib/archetype';
import { GAP_BY_ID, gapCostNGN } from '@/lib/gapCatalogue';
import type {
  AreaProfile,
  Band,
  BandDistribution,
  FacilitySummary,
  FacilityThemeId,
} from '@/lib/types';

export type AssessmentLevel = 'all' | 'state' | 'lga' | 'facility';

export type AssessmentScope =
  | { level: 'all'; state: null; lga: null; facility: null }
  | { level: 'state'; state: AreaProfile; lga: null; facility: null }
  | { level: 'lga'; state: AreaProfile; lga: AreaProfile; facility: null }
  | { level: 'facility'; state: AreaProfile; lga: AreaProfile; facility: FacilitySummary };

/** The 12 with a facility survey behind them. `primary` is the evidence grade
 *  the ETL sets for exactly those; the other 25 are desk review. */
export function assessedStates(states: AreaProfile[]): AreaProfile[] {
  return states.filter((s) => s.evidenceGrade === 'primary');
}

/**
 * Resolve the path into a scope.
 *
 * Falls back level by level rather than erroring — an unknown or unassessed
 * state resolves to `all`, an unknown LGA to its state, an unknown facility to
 * its LGA. A stale link should land somewhere sensible.
 */
export function resolveAssessmentScope(
  states: AreaProfile[],
  lgas: AreaProfile[],
  facilities: FacilitySummary[],
  stateId?: string,
  lgaId?: string,
  facilityId?: string,
): AssessmentScope {
  const state = stateId ? states.find((s) => s.id === stateId) : undefined;
  if (!state || state.evidenceGrade !== 'primary') {
    return { level: 'all', state: null, lga: null, facility: null };
  }

  const lga = lgaId ? lgas.find((l) => l.id === `${state.id}.${lgaId}`) : undefined;
  if (!lga) return { level: 'state', state, lga: null, facility: null };

  const facility = facilityId
    ? facilities.find((f) => f.uuid === facilityId && f.lgaId === lgaId)
    : undefined;
  if (!facility) return { level: 'lga', state, lga, facility: null };

  return { level: 'facility', state, lga, facility };
}

/** The URL for a scope, so the map, the filter row and the pane's list all
 *  produce the same link for the same place. */
export function assessmentPath(stateId?: string, lgaId?: string, facilityId?: string): string {
  if (!stateId) return '/assessment';
  if (!lgaId) return `/assessment/${stateId}`;
  if (!facilityId) return `/assessment/${stateId}/${lgaId}`;
  return `/assessment/${stateId}/${lgaId}/${facilityId}`;
}

/** `kano.dala` → `dala`. LGA ids are parent-qualified in the profile data and
 *  bare in the boundary files and the URL. */
export function bareLgaId(id: string): string {
  return id.split('.')[1] ?? id;
}

export function distributionTotal(d: BandDistribution): number {
  return d.not_ready + d.moderately_ready + d.ready;
}

/**
 * Share of an area's facilities that are not ready, 0–1.
 *
 * What the top-level map paints with no domain ticked. It has to be a share
 * there rather than a band: all 12 assessed states classify to the same
 * state-level band, so a band choropleth over them is twelve identical polygons
 * carrying one value between them — see the note on `GeoDatum.step`. Under a
 * domain the map switches to bands, because those genuinely differ state to
 * state. Null where nothing was surveyed, so the caller can tell "none not
 * ready" from "nothing to say".
 */
export function notReadyShare(d: BandDistribution): number | null {
  const total = distributionTotal(d);
  return total ? d.not_ready / total : null;
}

/**
 * Count a facility list into the three bands, under the Domain filter.
 *
 * Every count on this page comes through here, and every one of them reads the
 * band the same way — `facilityBandUnder`. Pass the ticked domains and the
 * whole page moves onto that reading at once: the pane's split, the polygon
 * fills, the badge on each list row.
 */
export function facilityDistribution(
  facilities: FacilitySummary[],
  domains: readonly FacilityThemeId[] = [],
): BandDistribution {
  const dist: BandDistribution = { not_ready: 0, moderately_ready: 0, ready: 0 };
  for (const f of facilities) {
    const band = facilityBandUnder(f, domains);
    if (band) dist[band] += 1;
  }
  return dist;
}

/** Count a facility list into the three bands, for one domain. */
export function facilityDomainDistribution(
  facilities: FacilitySummary[],
  themeId: keyof FacilitySummary['themeBands'],
): BandDistribution {
  const dist: BandDistribution = { not_ready: 0, moderately_ready: 0, ready: 0 };
  for (const f of facilities) {
    const band: Band | null = f.themeBands[themeId] ?? null;
    if (band) dist[band] += 1;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Overlap between domains
// ---------------------------------------------------------------------------

/**
 * Total and intersection across a domain selection.
 *
 * Both are asked for and they say different things. The total is the programme
 * figure — everything that has to be closed across these domains, which is what
 * a budget is built from. The intersection is the diagnostic one: facilities
 * failing in *every* selected domain at once, which is the population no single
 * workstream can clear.
 *
 * The intersection is also the only one of the two that moves. Every facility
 * in the dataset carries at least one technical infrastructure gap, so `any`
 * reads 2,806 for every selection that includes infrastructure and says nothing.
 * `all` falls from 2,670 across two domains to 741 across all four. A figure
 * leading with the union would look responsive and be inert.
 */
export interface DomainOverlap {
  /** Facilities carrying a gap in at least one selected domain. */
  any: number;
  /** Facilities carrying a gap in every selected domain. */
  all: number;
  /** Gap instances across the selection. */
  gaps: number;
  costNGN: number;
  /** Actions the source does not price. Held apart so a total can say what it
   *  excludes rather than quietly absorbing unpriced work. */
  unpriced: number;
}

export function domainOverlap(
  facilities: readonly FacilitySummary[],
  domains: readonly FacilityThemeId[],
): DomainOverlap {
  let any = 0;
  let all = 0;
  let gaps = 0;
  let costNGN = 0;
  let unpriced = 0;

  for (const f of facilities) {
    const hit = new Set<FacilityThemeId>();
    for (const id of f.gaps) {
      const gap = GAP_BY_ID[id];
      if (!gap) continue;
      const domain = gap.domain as FacilityThemeId;
      if (!domains.includes(domain)) continue;
      const priced = gapCostNGN(gap);
      gaps += 1;
      costNGN += priced.costNGN;
      unpriced += priced.unpriced;
      hit.add(domain);
    }
    if (hit.size) any += 1;
    // `domains.length` rather than a subset test: a facility is in the
    // intersection only when every selected domain fired for it.
    if (domains.length && hit.size === domains.length) all += 1;
  }

  return { any, all, gaps, costNGN, unpriced };
}
