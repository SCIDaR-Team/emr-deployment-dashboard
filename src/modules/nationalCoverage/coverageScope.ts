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
import { COVERAGE_THEMES } from '@/lib/themes';
import { worstBand } from '@/lib/archetype';
import type {
  AreaProfile,
  Band,
  CoverageThemeId,
  LeadershipSubDomainId,
} from '@/lib/types';

/**
 * The domain lens: the domains ticked, in the order the page understands them.
 *
 * Empty is not a domain of its own — it is the absence of one, and it is what
 * the page opens on. Under it the map paints each area's overall band and the
 * pane shows every block; under one or more domains, both narrow to those.
 */
export type DomainLens = CoverageThemeId[];

const COVERAGE_IDS: CoverageThemeId[] = COVERAGE_THEMES.map((t) => t.id);

/**
 * The filter store's domains, narrowed to the ones this page has a reading for.
 *
 * The Domain control is shared with Assessed States, which offers four domains
 * against the facility survey. This page reads `AreaProfile.coverage`, and a
 * state profile carries bands for three — Technical Infrastructure and
 * Workforce Capacity, which the facility instrument also asks about, plus
 * Leadership & Governance, which only a desk source can answer. Workflow &
 * Transition and Data Use & Reporting are questions the facility instrument
 * asks and the coverage model does not. Anything this page cannot paint drops
 * out here rather than arriving at a map as an unknown key.
 *
 * `facilityLens` in `lib/themes.ts` is the mirror of this, on the other page.
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

/**
 * Whether anything in this population is unclassified under the lens.
 *
 * Worth asking because it is newly *normal*. Under the overall lens every state
 * carries a band, so no-data was a case that never arose here; Leadership
 * covers 27 of 37, so ten polygons go grey the moment it is ticked. The legend
 * and the pane both read this so that grey is explained rather than left to be
 * guessed at — see the note on `Band` in types.ts about null being a fourth
 * state.
 */
export function hasUnbanded(areas: AreaProfile[], lens: DomainLens): boolean {
  return areas.some((area) => bandUnderLens(area, lens) === null);
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

/**
 * How a population of areas bands on each leadership sub-domain.
 *
 * The national counterpart of the four rows a state shows: one state reads Not
 * ready on data governance, and this says twenty-two of twenty-seven do. It is
 * the same move `countByDomain` makes one level up — a band per state becomes a
 * count of states per band — applied to the sub-domains beneath the band.
 *
 * Computed from the state profiles rather than carried in the data, for the
 * same reason the band counts are: the pane's denominator has to be whatever
 * set of areas it is actually showing, and a figure baked at build time would
 * silently keep saying "of 27" if the workbook ever grew.
 *
 * `scored` is the denominator and is returned rather than inferred, because it
 * is not `areas.length` — ten states carry no reading at all. Every count here
 * is out of the states that have one.
 */
export type LeadershipTally = {
  scored: number;
  bySubDomain: Record<LeadershipSubDomainId, Record<Band, number>>;
};

export function countLeadershipBands(areas: AreaProfile[]): LeadershipTally {
  const bySubDomain = {} as LeadershipTally['bySubDomain'];
  let scored = 0;

  for (const area of areas) {
    const bands = area.coverage.leadership;
    if (!bands) continue;
    scored += 1;
    for (const [id, band] of Object.entries(bands) as [LeadershipSubDomainId, Band][]) {
      /*
       * An unrecognised value stops the render rather than counting into
       * nothing.
       *
       * Without this the failure is silent and confident, which is the worst
       * shape a data bug takes on a dashboard. `counts[band] += 1` on a value
       * that is not a band writes `NaN` to a key nobody reads, leaves all three
       * real counts at zero, and renders four rows of "0 of 27" with full-width
       * empty bars — while the heading above them still says 27, because the
       * area *did* carry a reading. Every number on screen is then wrong and
       * nothing looks broken.
       *
       * It is reachable in exactly one situation, and it happened: the shape of
       * this field changed from a Yes/Partial/No answer to a `Band`, and a
       * browser holding the previous `states.json` fed the old vocabulary to
       * the new code. `public/data/` is committed and validated at build time,
       * so in a correct deployment this cannot fire — which is precisely why
       * firing loudly costs nothing and buys the one case that matters.
       */
      if (!BANDS.includes(band)) {
        throw new Error(
          `${area.name}: leadership sub-domain "${id}" reads ` +
            `${JSON.stringify(band)}, which is not a readiness band. This field ` +
            `once held "yes" / "partial" / "no" — a stale public/data/states.json ` +
            `is the likely cause, so hard-reload, and re-run \`npm run ` +
            `data:leadership && npm run data:ingest\` if that does not clear it.`,
        );
      }
      bySubDomain[id] ??= { not_ready: 0, moderately_ready: 0, ready: 0 };
      bySubDomain[id][band] += 1;
    }
  }

  return { scored, bySubDomain };
}
