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

import type { Band, DomainSeverity, Horizon } from './types';

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

/**
 * The same three levels in the State Maturity sheet's own words.
 *
 * Maturity is written on the band scale (`build-maturity.mjs`), so it takes the
 * band's colours and icons, but a state the sheet calls Mature must never read
 * "Ready". National Coverage and the state level of Assessed States show it
 * under these labels; everything facility-level keeps `BAND_LABEL`.
 */
export const MATURITY_LABEL: Record<Band, string> = {
  not_ready: 'Not mature',
  moderately_ready: 'Moderately mature',
  ready: 'Mature',
};

/** What a null maturity band means: the sheet has not scored the state. */
export const MATURITY_NO_DATA = 'Not assessed';

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
// Urgencies run red → orange → blue → purple and answer "when must this
// happen". The cool end is what makes the second scale legible as a different
// one: nothing on the readiness scale is blue or purple, so a cool chip cannot
// be a band.
//
// Colour is never alone. Every call site prints the word — Major, Moderate,
// Minor, Long-term — and `URGENCY_MARKER` adds a shape, so the scale survives a
// colour-vision deficiency, a greyscale print and a chip too small for either.

/** Tailwind ink classes per horizon. Ink only: an urgency colours a word or a
 *  glyph, never a fill, so there is no `bg`/`wash` half the way a band has one. */
export const HORIZON_CLASSES: Record<Horizon, { text: string; border: string }> = {
  major: { text: 'text-urgency-major', border: 'border-urgency-major' },
  moderate: { text: 'text-urgency-moderate', border: 'border-urgency-moderate' },
  minor: { text: 'text-urgency-minor', border: 'border-urgency-minor' },
  long_term: { text: 'text-urgency-longterm', border: 'border-urgency-longterm' },
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
  major: '\u25c6',
  moderate: '\u25b2',
  minor: '\u25cf',
  long_term: '\u25cb',
};

/**
 * Deployment phase — when an action happens relative to go-live: before,
 * during or after.
 *
 * A property of the action, from the sheet's own wording, and **not** a
 * coarsening of the urgency scale. It used to be one: every urgency mapped to
 * exactly one phase. The revised sheet broke that on purpose — Minor now
 * covers gaps to fix *before* deployment (tablets, device maintenance, most
 * workforce work) and actions to complete *during* it (wiring, sockets,
 * furniture) — so the phase rides on the action and a plan grouped by phase
 * reads it from there.
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

/**
 * When an urgency's actions happen, as a phrase rather than a level.
 *
 * This is the when-phrase *on its own*, which is why it exists alongside
 * `HORIZON_LABEL`. That one carries the urgency and the phrase in a single
 * string — "Major — before deployment" — which is right for a row with no
 * other heading. A card or a group band prints the urgency as its own heading,
 * so the full label would set the same word twice, one line apart.
 *
 * Minor is the one urgency that spans two phases, and says so.
 */
export const HORIZON_WHEN: Record<Horizon, string> = {
  major: PHASE_LABEL.before,
  moderate: PHASE_LABEL.before,
  minor: 'Before or during deployment',
  long_term: PHASE_LABEL.after,
};

// ---------------------------------------------------------------------------
// Domain severity
// ---------------------------------------------------------------------------
//
// A domain's highest gap severity at a facility — the sheet's own reading, and
// not a band. It is drawn in the urgency inks because it *is* the urgency
// scale: a domain's severity is the worst urgency among the actions its gaps
// call for. "No gap" takes no colour at all.

/**
 * Best first — No gap, Minor, Moderate, Major — the same left-to-right flow as
 * the readiness cards (Ready, Moderately ready, Not ready), so the severity
 * rows read in the direction a reader has just learned from the block above
 * them, and each level sits under the band it maps onto.
 */
export const DOMAIN_SEVERITIES: readonly DomainSeverity[] = [
  'none',
  'minor',
  'moderate',
  'major',
] as const;

export const DOMAIN_SEVERITY_LABEL: Record<DomainSeverity, string> = {
  major: 'Major gap',
  moderate: 'Moderate gap',
  minor: 'Minor gap',
  none: 'No gap',
};

/** The short column head, for a table with four of them in 420px. */
export const DOMAIN_SEVERITY_SHORT: Record<DomainSeverity, string> = {
  major: 'Major',
  moderate: 'Moderate',
  minor: 'Minor',
  none: 'No gap',
};

export const DOMAIN_SEVERITY_CLASS: Record<DomainSeverity, string> = {
  major: HORIZON_CLASSES.major.text,
  moderate: HORIZON_CLASSES.moderate.text,
  minor: HORIZON_CLASSES.minor.text,
  none: 'text-muted-foreground',
};

/** A glyph per severity, from the urgency set, so the two read as one scale. */
export const DOMAIN_SEVERITY_MARKER: Record<DomainSeverity, string> = {
  major: URGENCY_MARKER.major,
  moderate: URGENCY_MARKER.moderate,
  minor: URGENCY_MARKER.minor,
  none: '\u2013',
};

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
