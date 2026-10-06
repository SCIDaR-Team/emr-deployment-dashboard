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
 * ## The bands are opaque, in the client's own colours
 *
 * A band polygon is painted solid in `--ready`, `--moderate` and `--not-ready`
 * — the three fills the client supplied, and the ones every chip, bar and
 * badge in the panes is painted with. The map and the pane beside it therefore
 * show one green, one amber and one red, which is what the client asked for.
 *
 * That cannot be had any other way. A translucent fill is not a colour, it is
 * a mix with whatever is underneath: at 0.5 the bands came out as one colour
 * over the grey canvas, another over Streets' beige land, a muddy brown over
 * its forest reserves and parks, and not quite any of them the pane's. Brighter
 * `--*-map` variants were tried to pull the composite back towards the pane
 * (see globals.css); they got closer on one base map and further on the next,
 * and were never the client's colours. Opaque is the only fill that arrives
 * exactly as specified on every base map.
 *
 * What it costs is the base map *inside* the country. The ground around it is
 * untouched — neighbours, coastline, the Atlantic — so Nigeria still reads as a
 * country on a map; and the reader who wants a state's roads and towns has the
 * Indicator switch in the layer panel, which drops the fills and shows the
 * base map at full strength. The facility layer draws no fill at all, so the
 * base map is whole there whatever this says.
 *
 * ## The ramp stays translucent
 *
 * The sequential ramp is not a client colour — one blue at five steps from 73%
 * down to 28% — so it keeps letting the base map through. Transparency
 * compresses lightness directly: at 0.38 the five steps were 4.2 points of
 * lightness apart, which is not a difference a reader can hold across two
 * polygons on opposite sides of the map; at 0.6 the gaps are ~6.7. Higher in
 * dark mode, where a translucent fill composites towards black and goes muddy,
 * and higher over Streets, the one base map drawn to be read on its own, whose
 * parks otherwise show through as darker blotches. `plain` has nothing under
 * it to see, so it is opaque.
 */
export function fillOpacityFor(
  baseMap: BaseMapId,
  { isDark = false, sequential = false }: { isDark?: boolean; sequential?: boolean } = {},
): number {
  if (!sequential || baseMap === 'plain') return 1;
  if (baseMap === 'osm') return 0.75;
  return isDark ? 0.68 : 0.6;
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
   * Labelled groups of figures for the tooltip, under the band — National
   * Coverage's state readings by domain. When set they replace `valueLabel` in
   * the tooltip (which still names the shape for screen readers and exports).
   */
  tooltipGroups?: { title: string; rows: { label: string; value: string }[] }[];
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
 * The fill for a state known only from desk review — see
 * `--secondary-evidence` in globals.css. Opaque, like the bands, so it is the
 * same colour on the map as in the legend whatever base map is underneath.
 */
export const SECONDARY_FILL = 'hsl(var(--secondary-evidence))';

// ---------------------------------------------------------------------------
// Band fills for map polygons
// ---------------------------------------------------------------------------

/**
 * CSS custom property carrying each band's colour on a map polygon: the
 * client's own fills, the same ones the panes use, painted opaque — see
 * `fillOpacityFor` for why opaque is the only way they arrive unchanged.
 */
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
 *
 * The colour is the client's band fill — see `BAND_VAR`. Callers painting a
 * swatch of this fill *off* the map (a legend key) take `fillOpacityFor` too,
 * so the key and the polygons can never disagree.
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
