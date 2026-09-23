/**
 * Scope for National Coverage.
 *
 * Scope lives in the URL and nowhere else — the path carries where you are
 * (`/states/kano/dala`). That is a deliberate constraint rather than a
 * shortcut. This page has two controls that set the same scope — the State
 * dropdown and the map itself — and a store would let them disagree. With the
 * URL as the single source, clicking Kano on the map and picking Kano from the
 * dropdown are the same act, and every view a reader reaches is a link they can
 * send to someone else.
 *
 * Scope is now the *whole* of the page's state. There was a second setting, a
 * domain lens held in the filter store and mirrored into `?domain=`, which
 * re-read every band under one or more domains; its control has come out at the
 * client's direction and the lens came out with it. Nothing else could set it,
 * and leaving it live would have let the Domain filter on Assessed States
 * silently re-paint this map with no control here to name or undo it. Every
 * band on this page is now the area's own overall reading.
 *
 * ## Two levels, and the LGA is not one of them
 *
 * The page went national → state → LGA. It now stops at the state, at the
 * client's direction, and the level did not merely lose its map: it is gone as
 * a *place*. There is no `/states/kano/dala`, no LGA in the scope union, no LGA
 * geometry in the state view, no LGA in the locator or the pane.
 *
 * The reason is that an LGA never had a reading of its own here. The coverage
 * model classifies states — electricity access, internet subscription and the
 * governance answers are all state figures — and the LGA layer inherited its
 * parent's band, which is a map that looks like 44 findings and carries one. A
 * reader was being invited to compare Dala against Nassarawa on a difference
 * the data does not contain. Two levels say exactly what the model knows: how
 * the country stands, and how one state stands.
 *
 * `lgas.json` is still loaded and still real — Assessed States drills into an
 * LGA, because a facility survey visited facilities inside one. This page
 * simply no longer has an opinion about them.
 */

import { BANDS } from '@/lib/bands';
import type { AreaProfile, Band, LeadershipSubDomainId } from '@/lib/types';

export type Scope =
  | { level: 'national'; state: null }
  | { level: 'state'; state: AreaProfile };

/**
 * Resolve the path into a scope.
 *
 * Falls back rather than erroring: an unknown state id resolves to national. A
 * stale link should land somewhere sensible, not on a blank page — and every
 * `/states/kano/dala` in someone's history is now such a link, which the page
 * rewrites to `/states/kano` rather than resolving a level that no longer
 * exists.
 */
export function resolveScope(states: AreaProfile[], stateId?: string): Scope {
  const state = stateId ? states.find((s) => s.id === stateId) : undefined;
  return state ? { level: 'state', state } : { level: 'national', state: null };
}

/** The area whose figures the pane is showing. Null at national level, where
 *  the caller reads the national profile instead. */
export function scopedArea(scope: Scope): AreaProfile | null {
  return scope.level === 'state' ? scope.state : null;
}

/**
 * The band an area shows — its State Maturity reading, on the band scale.
 *
 * A one-line read of `coverage.band`, and it stays a named function because it
 * is the one place a band is resolved for painting — map fills, list rows, the
 * pane's own badge all go through here, so the colour on a polygon and the
 * colour on its row in the list cannot disagree.
 *
 * It used to apply the domain lens, rolling two ticked domains up to the weaker
 * of them. With the Domain control gone there is one reading to resolve, and
 * this is it.
 */
export function bandOf(area: AreaProfile): Band | null {
  return area.coverage.band;
}

/**
 * Whether anything in this population is unclassified.
 *
 * Asked rather than assumed. Six of the 37 states read Not assessed in the
 * State Maturity sheet, so today this is true and the key names them — an
 * unexplained grey on a band map reads as the worst band rather than as an
 * absent one. The legend reads this so that grey is explained the moment it
 * appears, rather than left to be guessed at — see the note on `Band` in
 * types.ts about null being a fourth state.
 */
export function hasUnbanded(areas: AreaProfile[]): boolean {
  return areas.some((area) => bandOf(area) === null);
}

/** Count areas by the band they show. */
export function countByBand(areas: AreaProfile[]): Record<Band, number> {
  const counts: Record<Band, number> = { not_ready: 0, moderately_ready: 0, ready: 0 };
  for (const area of areas) {
    const band = bandOf(area);
    if (band) counts[band] += 1;
  }
  return counts;
}

export function totalOf(counts: Record<Band, number>): number {
  return BANDS.reduce((sum, b) => sum + counts[b], 0);
}

/**
 * How a population of areas bands on each leadership sub-domain.
 *
 * The national counterpart of the four rows a state shows: one state reads Not
 * ready on data governance, and this says twenty-two of twenty-seven do. It is
 * the same move `countByBand` makes one level up — a band per area becomes a
 * count of areas per band — applied to the sub-domains rather than the band.
 *
 * Computed from the state profiles rather than carried in the data, for the
 * same reason the band counts are: the pane's denominator has to be whatever
 * set of areas it is actually showing, and a figure baked at build time would
 * silently keep saying "of 31" if the workbook ever grew.
 *
 * `scored` is the denominator and is returned rather than inferred, because it
 * is not `areas.length` — six states carry no reading at all. Every count here
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
       * real counts at zero, and renders four rows of "0 of 31" with full-width
       * empty bars — while the heading above them still says 31, because the
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
            `data:maturity && npm run data:ingest\` if that does not clear it.`,
        );
      }
      bySubDomain[id] ??= { not_ready: 0, moderately_ready: 0, ready: 0 };
      bySubDomain[id][band] += 1;
    }
  }

  return { scored, bySubDomain };
}
