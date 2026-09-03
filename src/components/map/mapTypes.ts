import { useId } from 'react';
import { BAND_MARKER } from '@/lib/bands';
import type { Band, EvidenceGrade } from '@/lib/types';
import type { BaseMapId } from '@/store/basemapStore';

/**
 * The one boundary colour, for all three layers.
 *
 * `--map-boundary` is near-solid in both schemes (see globals.css) — the old
 * `--foreground / 0.3` was too faint to read as an administrative border.
 * Stroke *widths* stay where they were: bolder here means contrast, not weight.
 */
export const BOUNDARY_STROKE = 'hsl(var(--map-boundary) / 0.9)';

/**
 * Every clickable shape on every layer carries this.
 *
 * A focusable SVG element gets the browser's default focus ring, and an SVG
 * outline is drawn around the element's **bounding box** — so selecting an LGA
 * dropped a rounded rectangle over it and across its neighbours, which reads as
 * a rendering fault rather than as a selection.
 *
 * Suppressed rather than restyled, because the affordance is already there in a
 * better form: each layer sets `focused` from the shape's own `onFocus`, and
 * draws a brand-coloured stroke along the actual boundary for it. A keyboard
 * user tabbing across the map sees the same indicator a clicking one does, in
 * the shape of the thing they are on. Do not remove this without putting a
 * shape-following focus style in its place.
 */
export const UNIT_FOCUS_CLASS = 'outline-none';

/**
 * How opaque a readiness fill is over the current base map.
 *
 * Over tiles the fill has to let the imagery through or the base map is
 * pointless — but not so far that the three bands stop being distinguishable
 * from each other, which is the fill's actual job.
 *
 * Raised from 0.55, which was tuned against the old saturated palette: at any
 * higher value those hues buried the roads and place names outright. The
 * client's fills are pastels and do not, so the same headroom now buys colour
 * fidelity instead. At 0.55 a Not-ready polygon composited to about #FAC7C5
 * against the pane card's #FFA3A3, and a reader looking from the map to the
 * pane saw two different reds for one band. At 0.8 it lands within a couple of
 * counts of the card and the tile detail still reads through.
 */
export function fillOpacityFor(baseMap: BaseMapId): number {
  return baseMap === 'plain' ? 1 : 0.8;
}

/**
 * Sizing.
 *
 * `aspect` (the default) boxes the map to the projection's own ratio and lets
 * its height follow its width — right for a map sitting in a card among other
 * cards. `fill` takes both dimensions from the parent instead, for the
 * map-first layout where the map *is* the page and the parent is what is left
 * after the header and the pane. The projection is unchanged either way; only
 * the letterboxing moves.
 */
export type MapFit = 'aspect' | 'fill';

/** What a map layer needs to know about one geographic unit to colour and
 *  label it. Shared by all three layers so it is one shape everywhere. */
export interface GeoDatum {
  band: Band | null;
  n: number;
  evidenceGrade: EvidenceGrade;
  label?: string;
  /**
   * Optional sequential step, 0–4, on the score ramp (`--s1` … `--s5`).
   *
   * When present the polygon is filled from the ramp instead of from its
   * readiness band, and the layer becomes a magnitude choropleth. This is the
   * default for the national map now, because every one of the 12 assessed
   * states classifies to the *same* state-level band — a band choropleth there
   * paints twelve identical polygons and encodes exactly one value. A share or
   * a score varies, so the ramp has something to say. The band fill is still
   * the right choice wherever the units genuinely differ in band.
   *
   * Callers must ship a scale legend with it: a sequential encoding is
   * unreadable without one.
   */
  step?: number | null;
  /** Pre-formatted measure for the tooltip, e.g. "54.1% not ready". */
  valueLabel?: string;
  /**
   * The number `step` was bucketed from, kept so a caller can print the scale
   * it actually fitted. `step` is lossy by design — five buckets — and a legend
   * reconstructed from buckets prints bounds the polygons were never coloured
   * against.
   */
  rawValue?: number | null;
}

/** Fill for a sequential step, or undefined when the datum has no step. */
export function scoreStepFill(step: number | null | undefined): string | undefined {
  if (step == null || !Number.isFinite(step)) return undefined;
  const i = Math.max(0, Math.min(4, Math.round(step)));
  return `hsl(var(--s${i + 1}))`;
}

/** Bucket a value onto the five-step ramp over an explicit domain.
 *
 *  Domains are fitted to the data actually drawn, not to the theoretical
 *  range: share-not-ready spans 21–86% across the assessed states, so a fixed
 *  0–100 domain drops eight of the twelve into one step and the map stops
 *  discriminating. The legend prints the fitted bounds, so this stays honest. */
export function stepFor(value: number | null, lo: number, hi: number): number | null {
  if (value == null || !Number.isFinite(value) || hi <= lo) return null;
  const t = (value - lo) / (hi - lo);
  return Math.max(0, Math.min(4, Math.floor(Math.max(0, Math.min(0.999, t)) * 5)));
}

/**
 * `<pattern>` ids live in the whole document's id space, so every map that
 * renders the secondary-evidence hatch needs its own instance — `useId()`
 * keeps two maps on screen at once (unlikely today, but cheap to guarantee)
 * from colliding.
 */
export function useHatchPatternId(): string {
  const id = useId();
  return `map-hatch-${id.replace(/:/g, '')}`;
}

export function hatchFill(id: string): string {
  return `url(#${id})`;
}

// ---------------------------------------------------------------------------
// Band fills for map polygons
// ---------------------------------------------------------------------------

/** CSS custom property carrying each band's colour. */
const BAND_VAR: Record<Band, string> = {
  ready: 'ready',
  moderately_ready: 'moderate',
  not_ready: 'not-ready',
};

/**
 * Flat band colour for a polygon, or undefined for no data.
 *
 * Map polygons used to be filled with a `<pattern>` carrying the band colour
 * *and* a texture — dots for Moderately ready, 135° stripes for Not ready — so
 * that the red/amber/green scale survived a colour-vision deficiency and a
 * greyscale print. That has been dropped at the client's direction: at the
 * scale a state or an LGA is drawn, the texture read as noise inside the shape
 * rather than as a second channel, and a flat fill lets the choropleth be read
 * as one field of colour.
 *
 * The trade-off is real and worth writing down: colour is now the **only**
 * carrier on these polygons. Everywhere the band appears outside the map it
 * still has a second channel — `BandBadge` has a label and an icon, the
 * distribution bars keep their `.band-texture-*` classes (`BAND_TEXTURE` in
 * `lib/bands.ts`), and facility points on the deepest layer carry the band as
 * a *shape* rather than a texture (`bandMarkerPath` below), which a dot a few
 * pixels across can do and a stripe cannot. Restoring it here means restoring
 * the pattern, not inventing a new encoding.
 *
 * Returned as a colour string rather than a Tailwind class so it can be set as
 * the `fill` attribute, the same way `scoreStepFill` is — the two are
 * alternatives for the same slot and must be interchangeable.
 */
export function bandFlatFill(band: Band | null | undefined): string | undefined {
  return band ? `hsl(var(--${BAND_VAR[band]}))` : undefined;
}

/**
 * A facility marker's outline, centred on (cx, cy).
 *
 * Points get *shape* rather than texture: a dot on the facility layer is a few
 * pixels across, and a stripe inside it is neither visible nor countable, while
 * the silhouette reads at any size. Circle → square → triangle as readiness
 * falls, so the mark gets pointier the worse the finding. `BAND_MARKER` in
 * `lib/bands.ts` is the source of truth.
 *
 * Areas are equalised rather than radii: a square drawn at the circle's radius
 * covers ~27% more ink and reads as a different size class rather than a
 * different shape.
 */
export function bandMarkerPath(
  band: Band | null | undefined,
  cx: number,
  cy: number,
  r: number,
): string {
  const marker = band ? BAND_MARKER[band] : 'circle';

  if (marker === 'square') {
    const h = (r * Math.sqrt(Math.PI)) / 2; // half-side of an equal-area square
    return `M ${cx - h} ${cy - h} H ${cx + h} V ${cy + h} H ${cx - h} Z`;
  }

  if (marker === 'triangle') {
    // Equal-area equilateral triangle, point up.
    const side = r * Math.sqrt((4 * Math.PI) / Math.sqrt(3));
    const height = (side * Math.sqrt(3)) / 2;
    const top = cy - (height * 2) / 3;
    const bottom = cy + height / 3;
    return `M ${cx} ${top} L ${cx + side / 2} ${bottom} L ${cx - side / 2} ${bottom} Z`;
  }

  // Circle, as two arcs — so every marker is one <path> and the layer does not
  // have to switch element types per datum.
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}
