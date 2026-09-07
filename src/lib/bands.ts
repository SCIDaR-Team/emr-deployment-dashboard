/**
 * Readiness bands — the three-way classification, and the only measure in the
 * app.
 *
 * There are no cut points here and no `toBand(score)`, because there is no
 * score to cut: a band arrives already classified from the data layer. What
 * lives here is everything *downstream* of the classification — its labels,
 * its colours, its non-colour carriers, and the two roll-up rules
 * (`dominantBand`, `bandShare`) that answer "how does a population sit"
 * without reaching for an average.
 */

import type { Band, Horizon } from './types';

export const BANDS: readonly Band[] = ['not_ready', 'moderately_ready', 'ready'] as const;

/** Ordinal rank — use for comparisons rather than string equality chains. */
export const BAND_RANK: Record<Band, number> = {
  not_ready: 1,
  moderately_ready: 2,
  ready: 3,
};

export const BAND_LABEL: Record<Band, string> = {
  not_ready: 'Not ready',
  moderately_ready: 'Moderately ready',
  ready: 'Ready',
};

/** The action each band implies — used on the Assessment States donut legend. */
export const BAND_ACTION: Record<Band, string> = {
  not_ready: 'Foundational investment',
  moderately_ready: 'Targeted intervention',
  ready: 'Immediate roll out',
};

/** One-line description of what a band means for facilities in it — the
 *  Assessment States archetype legend's subtext, one level plainer than
 *  `BAND_ACTION`. */
export const BAND_DESCRIPTION: Record<Band, string> = {
  ready: 'Facilities ready for EMR deployment',
  moderately_ready: 'Facilities moderately ready',
  not_ready: 'Facilities not ready',
};

/** The short subtitle under the readiness pill — Facility Scorecard,
 *  State Summary. */
export const BAND_SUBTITLE: Record<Band, string> = {
  ready: 'Immediate roll-out ready',
  moderately_ready: 'Targeted interventions required',
  not_ready: 'Foundational investment required',
};

export const BAND_TIMELINE: Record<Band, string> = {
  not_ready: 'Year 1+',
  moderately_ready: '6 months to 1 year',
  ready: 'Under 6 months',
};

/**
 * Tailwind class fragments per band.
 *
 * Every status colour in the app comes from here. Note each entry pairs the
 * colour with a text label or icon at the call site — colour alone does not
 * survive a colour-vision deficiency or a greyscale print-out.
 *
 * `texture` is the carrier for the places where a label will not fit: a map
 * polygon, a 6px distribution segment, a donut arc. See `BAND_TEXTURE` below.
 *
 * The entries split two ways, and the split matters. `bg`, `wash` and `fill`
 * are the client's band colours — pastels, chosen as choropleth fills. `text`
 * and `border` are the *ink* half of the same band: same hue, taken down to a
 * weight that can be read as a label. Reach for `.text` on anything with
 * words in it and `.bg`/`.fill` on anything without, and the two never cross.
 */
/**
 * The band colours as raw CSS, for the few places that need a value rather than
 * a class — an inline `style`, a canvas, an SVG attribute a class cannot reach.
 * Same custom properties the Tailwind tokens are built on, so they stay in step
 * with the theme. This is the *fill*; for a value that will be text, see
 * `BAND_CSS_INK` below.
 */
export const BAND_CSS_COLOR: Record<Band, string> = {
  not_ready: 'hsl(var(--not-ready))',
  moderately_ready: 'hsl(var(--moderate))',
  ready: 'hsl(var(--ready))',
};

/** The ink half of each band — the same hue at a text weight. Use this, never
 *  `BAND_CSS_COLOR`, wherever the value ends up as a `color` or a stroke on a
 *  label: the fills are pastels and do not read as text. */
export const BAND_CSS_INK: Record<Band, string> = {
  not_ready: 'hsl(var(--not-ready-ink))',
  moderately_ready: 'hsl(var(--moderate-ink))',
  ready: 'hsl(var(--ready-ink))',
};

export const BAND_CLASSES: Record<
  Band,
  { text: string; bg: string; wash: string; border: string; fill: string; texture: string }
> = {
  not_ready: {
    text: 'text-notready-ink',
    bg: 'bg-notready',
    wash: 'bg-notready-wash',
    border: 'border-notready-ink',
    fill: 'fill-notready',
    texture: 'band-texture-notready',
  },
  moderately_ready: {
    text: 'text-moderate-ink',
    bg: 'bg-moderate',
    wash: 'bg-moderate-wash',
    border: 'border-moderate-ink',
    fill: 'fill-moderate',
    texture: 'band-texture-moderate',
  },
  ready: {
    text: 'text-ready-ink',
    bg: 'bg-ready',
    wash: 'bg-ready-wash',
    border: 'border-ready-ink',
    fill: 'fill-ready',
    texture: 'band-texture-ready',
  },
};

// ---------------------------------------------------------------------------
// Urgency — the other scale
// ---------------------------------------------------------------------------
//
// Horizons live in the generated `gapCatalogue.ts`, which owns their ids and
// their labels because the sheet does. What they *look like* is a presentation
// decision and belongs here, beside the bands, for one reason: these are the
// only two scales in the app that carry status colour, and the whole job of
// this pair of tables is to keep them from being mistaken for each other.
//
// Bands run red → amber → green and answer "how ready is this".
// Urgencies run red → orange → blue → grey and answer "when must this happen".
// Blue is what makes the second scale legible as a different one: nothing on
// the readiness scale is blue, so a blue chip cannot be a band.
//
// Colour is never alone. Every call site prints the word — Critical, Major,
// Minor, Optional — and `URGENCY_MARKER` adds a shape, so the scale survives a
// colour-vision deficiency, a greyscale print and a chip too small for either.

/** Tailwind ink classes per horizon. Ink only: an urgency colours a word or a
 *  glyph, never a fill, so there is no `bg`/`wash` half the way a band has one. */
export const HORIZON_CLASSES: Record<Horizon, { text: string; border: string }> = {
  critical: { text: 'text-urgency-critical', border: 'border-urgency-critical' },
  major: { text: 'text-urgency-major', border: 'border-urgency-major' },
  minor: { text: 'text-urgency-minor', border: 'border-urgency-minor' },
  long_term: { text: 'text-urgency-optional', border: 'border-urgency-optional' },
};

/**
 * The non-colour carrier for urgency: one glyph per horizon.
 *
 * A weight ramp, so the four separate in greyscale and in the order they
 * matter — solid diamond, solid triangle, solid dot, hollow dot. Geometric
 * rather than pictorial: the rest of this interface is hairlines and mono type,
 * and an emoji bolt beside a naira figure reads as a different product.
 *
 * The same discipline as `BAND_MARKER`, and deliberately a *different* shape
 * vocabulary from it — a reader who has learned the band shapes must not meet
 * them again meaning something else.
 */
export const URGENCY_MARKER: Record<Horizon, string> = {
  critical: '\u25c6',
  major: '\u25b2',
  minor: '\u25cf',
  long_term: '\u25cb',
};

/**
 * Deployment phase — the four urgencies collapsed onto the three moments the
 * sheet's own wording names: before, during, after.
 *
 * This is a *coarsening* of the urgency scale, and the only one we allow. It is
 * legitimate where the old `priority` was not, for one reason: Critical and
 * Major are two urgencies but one budget — both read "to fix before EMR
 * deployment" in the source, and a programme deciding what it must buy to go
 * live at all needs them added together. What the old scale did wrong was
 * collapse them and then *lose* the finer reading; here both survive, in two
 * views of the same rows.
 *
 * Ordered chronologically, not by size. The sequence is the reading.
 */
export const HORIZON_PHASES = ['before', 'during', 'after'] as const;

export type HorizonPhase = (typeof HORIZON_PHASES)[number];

export const PHASE_LABEL: Record<HorizonPhase, string> = {
  before: 'Before deployment',
  during: 'During deployment',
  after: 'After deployment',
};

/** Which phase each urgency falls in. The one place the mapping is written. */
export const PHASE_OF: Record<Horizon, HorizonPhase> = {
  critical: 'before',
  major: 'before',
  minor: 'during',
  long_term: 'after',
};

/**
 * When an urgency has to happen, as a phrase rather than a level — the phase
 * label, reached from the urgency.
 *
 * This is the when-phrase *on its own*, which is why it exists alongside
 * `HORIZON_LABEL`. That one carries the urgency and the phrase in a single
 * string — "Critical — before deployment" — which is right for a row with no
 * other heading. A card or a group band prints the urgency as its own heading,
 * so the full label would set the same word twice, one line apart.
 *
 * Derived from `PHASE_OF` rather than restated, so that a phase can never
 * disagree with the note beside an urgency it contains. Kept here rather than
 * beside `HORIZON_LABEL` because `gapCatalogue.ts` is generated from the sheet
 * and this phrasing is ours.
 */
export const HORIZON_WHEN = Object.fromEntries(
  (Object.keys(PHASE_OF) as Horizon[]).map((h) => [h, PHASE_LABEL[PHASE_OF[h]]]),
) as Record<Horizon, string>;

// ---------------------------------------------------------------------------
// The non-colour carrier
// ---------------------------------------------------------------------------
//
// The scale is red / amber / green, which is the single worst combination for
// the most common colour-vision deficiencies — deuteranopia and protanopia both
// collapse red and green towards each other, and our amber and red are within
// four points of the same lightness, so they do not separate in greyscale
// either. `BandBadge` has always paired the colour with an icon and a label.
// These three tables extend that pattern to the surfaces where no label fits.
//
// One shape vocabulary, two renderings, because the media genuinely differ:
//
//   BAND_TEXTURE   HTML area fills — the `.band-texture-*` classes in
//                  globals.css, for distribution bars and donut arcs. No
//                  longer used on the map: polygon fills there are flat
//                  colour at the client's direction, so colour is their only
//                  carrier (see `bandFlatFill` in components/map/mapTypes.ts).
//   BAND_MARKER    point marks, where a texture inside a small dot is
//                  invisible and the shape of the dot is the thing that reads
//
// There was a third, BAND_DECAL, for the ECharts canvas, which could use
// neither of the above. The charts it served were replaced by the meters and
// tracks in `components/ui/Meter.tsx`, which are plain DOM and take the CSS
// classes directly, so ECharts and the decal table left together.
//
// Keep the two saying the same thing. A reader who learns "dots mean moderate"
// on the map must not meet a different dots on the panel beside it.
//
// Ready is deliberately the untextured one. It is the band that should read as
// solid and complete, and leaving the best case clean keeps the texture from
// looking like damage.

export type BandTexture = 'solid' | 'dots' | 'stripes';

export const BAND_TEXTURE: Record<Band, BandTexture> = {
  ready: 'solid',
  moderately_ready: 'dots',
  not_ready: 'stripes',
};

/** Point marks. Ordinal: the sides go up as readiness goes down. */
export type BandMarker = 'circle' | 'square' | 'triangle';

export const BAND_MARKER: Record<Band, BandMarker> = {
  ready: 'circle',
  moderately_ready: 'square',
  not_ready: 'triangle',
};

/** Spoken form of the carrier, for legends and tooltips. */
export const BAND_TEXTURE_LABEL: Record<BandTexture, string> = {
  solid: 'solid',
  dots: 'dotted',
  stripes: 'striped',
};

/** CSS custom-property name per band, for SVG that cannot use classes. */
export const BAND_CSS_VAR: Record<Band, string> = {
  not_ready: '--not-ready',
  moderately_ready: '--moderate',
  ready: '--ready',
};

/** Resolve a band to its live colour, reading the CSS variable at call time so
 *  the value tracks light/dark. Pass an element to scope the lookup. */
export function bandColor(band: Band | null, el?: HTMLElement): string {
  const root = el ?? document.documentElement;
  if (!band) {
    return `hsl(${getComputedStyle(root).getPropertyValue('--no-data').trim()})`;
  }
  const raw = getComputedStyle(root).getPropertyValue(BAND_CSS_VAR[band]).trim();
  return `hsl(${raw})`;
}

/**
 * The band a population as a whole sits in, from its band counts.
 *
 * With no score to average, "how ready is this state" has to be answered from
 * the split itself. The rule is deliberately conservative and stated here once
 * so every surface answers it the same way:
 *
 *   ready              a majority of banded facilities are Ready
 *   not_ready          a majority are Not ready
 *   moderately_ready   anything else — including an even three-way split
 *
 * Returns null when nothing in the population carries a band, which is not the
 * same as Not ready.
 */
export function dominantBand(distribution: Record<Band, number>): Band | null {
  const total = BANDS.reduce((sum, b) => sum + (distribution[b] ?? 0), 0);
  if (!total) return null;
  if ((distribution.ready ?? 0) / total > 0.5) return 'ready';
  if ((distribution.not_ready ?? 0) / total > 0.5) return 'not_ready';
  return 'moderately_ready';
}

/** Share of a population sitting in one band, 0–100. Null when the population
 *  carries no bands at all — never 0, which would read as a real finding. */
export function bandShare(
  distribution: Record<Band, number>,
  band: Band,
): number | null {
  const total = BANDS.reduce((sum, b) => sum + (distribution[b] ?? 0), 0);
  if (!total) return null;
  return ((distribution[band] ?? 0) / total) * 100;
}
