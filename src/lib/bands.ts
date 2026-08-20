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

import type { Band } from './types';

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
 */
export const BAND_CLASSES: Record<
  Band,
  { text: string; bg: string; wash: string; border: string; fill: string; texture: string }
> = {
  not_ready: {
    text: 'text-notready',
    bg: 'bg-notready',
    wash: 'bg-notready-wash',
    border: 'border-notready',
    fill: 'fill-notready',
    texture: 'band-texture-notready',
  },
  moderately_ready: {
    text: 'text-moderate',
    bg: 'bg-moderate',
    wash: 'bg-moderate-wash',
    border: 'border-moderate',
    fill: 'fill-moderate',
    texture: 'band-texture-moderate',
  },
  ready: {
    text: 'text-ready',
    bg: 'bg-ready',
    wash: 'bg-ready-wash',
    border: 'border-ready',
    fill: 'fill-ready',
    texture: 'band-texture-ready',
  },
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
//   BAND_TEXTURE   area fills — CSS classes for HTML, `<pattern>` for SVG
//                  (`components/map/BandPattern.tsx`)
//   BAND_MARKER    point marks, where a texture inside a 6px dot is invisible
//                  and the shape of the dot is the thing that reads
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
