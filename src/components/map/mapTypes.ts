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
 * The boundary ink for a polygon with **no fill**, chosen from the base map.
 *
 * Which stroke a shape wants is decided by what is behind it, not by which
 * layer it is on:
 *
 *   filled   `CHOROPLETH_STROKE` — white, cutting a gap between two colours
 *   unfilled `adminStrokeFor()`  — read against whatever the base map painted
 *
 * Getting this wrong is not a subtle miss. An invisible administrative
 * boundary does not read as "no boundary drawn" — it reads as *the base map's*
 * boundary being ours, and since OpenStreetMap's Nigerian LGA geometry differs
 * from the COD-AB set this dashboard is built on, that silently shows the
 * reader the wrong shape for the name in the tooltip.
 *
 * **The ground, not the scheme.** Satellite imagery is dark whichever theme the
 * page is in, so keying this to light/dark alone puts a dark line over dark
 * aerial photography — which is how the first version of this fix broke Lagos
 * while looking correct everywhere else. The rule is one line long: the ground
 * is dark if the reader is on satellite, or the page is in its dark scheme.
 */
export function adminStrokeFor(baseMap: BaseMapId, isDark = false): string {
  const groundIsDark = baseMap === 'satellite' || isDark;
  return groundIsDark
    ? 'hsl(var(--map-admin-paper) / 0.85)'
    : 'hsl(var(--map-admin-ink) / 0.8)';
}

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
 * How opaque a thematic fill is over the current base map.
 *
 * Down from a flat 0.8, and the change is the point of the base-map rework
 * rather than a tweak to it. 0.8 was chosen so a polygon would composite to the
 * same colour as the matching chip in the pane — which it did, at the cost of
 * burying whatever was underneath. That trade only looked acceptable because
 * the tiles had already been scrimmed to a sixth of their strength and there
 * was nothing left down there worth seeing. With Positron underneath there is:
 * a state's roads, its towns and its neighbours' names all read through.
 *
 * ## Two values, because we have two scales and they fail differently
 *
 * The **bands** are categorical and separated by *hue* — red, amber, green. Cut
 * their opacity and they get paler together; which band a polygon is in is
 * still obvious, because nothing about hue is lost. That was the argument for
 * 0.38, which is what ecat's coverage map uses for this kind of scale.
 *
 * It holds for the *hue* and it failed for everything else. At 0.38 over Esri's
 * grey canvas the three bands composited to #f7d3d2, #f7eed6 and #e5edde —
 * which are, in order, a pink, a cream and an off-white, and they are 1.03 and
 * 1.06 apart in contrast. Nothing about hue was lost and the map still read as
 * blank paper, because the reader is not comparing two polygons side by side;
 * they are looking at Kano and remembering Lagos. So the bands sit at 0.5, and
 * they are painted in the brighter `--*-map` variants — the two changes are one
 * change, and neither is sufficient alone (see globals.css).
 *
 * The **ramp** is sequential and separated by *lightness alone* — one blue at
 * five steps from 73% down to 28%. Transparency compresses lightness directly:
 * over Positron's near-white land, 0.38 puts the five steps 4.2 points of
 * lightness apart, which is not a difference a reader can hold across two
 * polygons on opposite sides of the map. At 0.6 the gaps are ~6.7 and the ramp
 * is legible again, and the tiles still come through at 40% — against the 17%
 * the old scrim-plus-0.8 stack left them.
 *
 * The two ended up close together — 0.5 and 0.6 — but they are still two
 * numbers, because they answer to different failures: the ramp is thin the
 * moment its lightness steps compress, and the bands are thin the moment the
 * whole scale drifts towards the paper. Keep them a parameter for that reason,
 * not because the gap between them is large.
 *
 * **Higher again in dark mode**, because a translucent fill over a dark ground
 * composites towards black and goes muddy rather than merely darker.
 *
 * `plain` stays fully opaque: there is nothing under it to see.
 */
export function fillOpacityFor(
  baseMap: BaseMapId,
  { isDark = false, sequential = false }: { isDark?: boolean; sequential?: boolean } = {},
): number {
  if (baseMap === 'plain') return 1;
  if (sequential) return isDark ? 0.68 : 0.6;
  return isDark ? 0.6 : 0.5;
}

export const CHOROPLETH_STROKE = 'rgb(255 255 255 / 0.85)';

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
   * readiness band, and the layer becomes a magnitude choropleth. Reach for it
   * where the units barely differ in band and a band choropleth would paint
   * one colour across the whole map — a share or a score varies, so the ramp
   * has something to say. The band fill is the right choice wherever the units
   * genuinely differ in band, and it is what both national maps use: Assessed
   * States carried the ramp over investment need for a while and has gone back
   * to the band, so that its twelve states read in the same colours National
   * Coverage gives them.
   *
   * Callers must ship a scale legend with it: a sequential encoding is
   * unreadable without one.
   */
  step?: number | null;
  /** Pre-formatted measure for the tooltip, e.g. "54.1% not ready". */
  valueLabel?: string;
  /**
   * The band's name, where the caller's band is not a readiness band — the
   * state maps show maturity on the band scale, and a Mature state must not
   * hover as "Ready". Also names a null band ("Not assessed") where the caller
   * knows why it is null. Falls back to `BAND_LABEL` / "No data".
   */
  bandLabel?: string;
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

/**
 * CSS custom property carrying each band's colour *on a map*.
 *
 * The `-map` variants, not the pastels the rest of the app fills with. A map
 * fill is composited at partial opacity over a base map and arrives as a tint
 * of the canvas; these are the same three hues taken bright enough to survive
 * that. The full argument, and the values, are in globals.css — the short
 * version is that a colour picked to be read flat and a colour picked to be
 * read through 50% of itself cannot be the same colour.
 */
const BAND_VAR: Record<Band, string> = {
  ready: 'ready-map',
  moderately_ready: 'moderate-map',
  not_ready: 'not-ready-map',
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
 *
 * The colour is the band's map variant — see `BAND_VAR`. Callers painting a
 * swatch of this fill *off* the map (a legend key) must composite it the way
 * the polygons do, at `fillOpacityFor`, or the key will be a stronger colour
 * than anything it is explaining.
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
