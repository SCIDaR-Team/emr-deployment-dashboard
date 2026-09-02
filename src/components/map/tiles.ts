/**
 * Slippy-map tile arithmetic against the shared Mercator projection.
 *
 * Because `mapProjection` is linear in Web Mercator space, a tile is an exact
 * axis-aligned square in viewBox units — no per-tile reprojection, no canvas,
 * no map library. Placing one is `<image>` at a computed x/y/size.
 */

import { WORLD_SIZE, WORLD_X0, WORLD_Y0 } from '@/lib/mapProjection';
import type { BaseMapSource } from '@/store/basemapStore';

/** Native pixel size of a raster tile from both providers. */
const TILE_PX = 256;

/** Below this the tiles are coarser than the national view ever needs. */
const MIN_ZOOM = 4;

/**
 * The deepest level the *fallback* layer will ask for.
 *
 * Both providers publish complete global coverage to around here and then get
 * patchy: Esri's World Imagery has metre-scale photography over Kano city and
 * none at all at z19 over Rano, forty kilometres away. A facility view zoomed
 * past a provider's coverage asked for tiles that do not exist and drew a black
 * frame — the map appearing to break at precisely the moment it was doing what
 * it was built to do.
 *
 * So every map draws two tile layers: this one underneath, at a level that
 * certainly exists, and the sharp one on top of it. Where the sharp tiles are
 * there they cover it completely and nothing changes; where they are not, the
 * reader gets upscaled imagery of the right place instead of a hole.
 *
 * **This is the second line of defence, not the first.** It only helps against
 * a provider that answers a missing tile with an *error* — OpenStreetMap 404s,
 * and the fallback shows through. Esri does not: a missing tile comes back
 * `200 image/jpeg`, 2,521 bytes, reading "Map data not yet available", and it
 * paints over the fallback exactly as a real tile would. See
 * `imageryCoverage.ts` for the first line, which is to not request it.
 */
const FALLBACK_MAX_ZOOM = 16;

/** How far below the sharp level the fallback sits where both exist. Two levels
 *  is a sixteenth of the tiles for a layer that is usually invisible. */
const FALLBACK_ZOOM_BIAS = -2;

/**
 * A tighter cap than the providers' own: one screenful at ~256px/tile is a
 * handful of requests, and a runaway zoom estimate must not turn into hundreds.
 *
 * Raised from 64 with the full-viewport base map. Tiles used to be clipped to
 * the subject's outline, so the only ones ever *requested* were the ones inside
 * it; they now cover the whole frame, because the ground around a facility is
 * part of what the reader came to see (see `TileLayer`). A full-screen map at
 * retina density lands around 90 tiles, and stepping down a zoom level to stay
 * under 64 was costing a level of sharpness at exactly the depth where
 * sharpness is the point.
 */
const MAX_TILES = 140;

export interface ViewBoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapTile {
  key: string;
  href: string;
  x: number;
  y: number;
  size: number;
}

export function parseViewBox(viewBox: string): ViewBoxRect {
  const [x = 0, y = 0, w = 1000, h = 813] = viewBox.split(/\s+/).map(Number);
  return { x, y, w, h };
}

/**
 * The slippy-map zoom level this view corresponds to, unrounded.
 *
 * The number every other mapping tool puts in its status bar and its URL, and
 * the one thing a reader can carry between this map and any other: "z 17 over
 * Sabon Gari" means the same view in QGIS, in Google Maps and here. Fractional
 * because the viewport is continuous — the tiles underneath quantise to an
 * integer, the camera does not, and rounding the readout would make it stick
 * while the map visibly moved.
 */
export function zoomForRect(rect: ViewBoxRect, renderPx: number): number {
  if (rect.w <= 0 || renderPx <= 0) return 0;
  return Math.log2((renderPx / TILE_PX) * (WORLD_SIZE / rect.w));
}

function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

/**
 * The tiles covering `rect`, at the zoom whose pixels land closest to 1:1 with
 * how large the SVG is actually drawn.
 *
 * `renderPx` is the on-screen CSS width of the map. It only picks the zoom, so
 * a rough value is fine — being one level off costs sharpness, never
 * correctness. Device pixel ratio is folded in so a retina screen gets the
 * finer level rather than four upscaled tiles.
 */
export function tilesForRect(
  rect: ViewBoxRect,
  source: BaseMapSource,
  renderPx: number,
  options: { zoomBias?: number; zoomCap?: number } = {},
): MapTile[] {
  const tile = source.tile;
  if (!tile || rect.w <= 0 || rect.h <= 0) return [];

  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const ideal =
    Math.log2(((renderPx * dpr) / TILE_PX) * (WORLD_SIZE / rect.w)) + (options.zoomBias ?? 0);

  const ceiling = Math.min(tile.maxZoom, options.zoomCap ?? tile.maxZoom);
  let z = Math.max(MIN_ZOOM, Math.min(ceiling, Math.round(ideal)));
  let out: MapTile[] = [];

  // Step down a level rather than emit a screenful of requests if the estimate
  // (or a very wide viewport) overshoots.
  for (; z >= MIN_ZOOM; z--) {
    const n = 2 ** z;
    const size = WORLD_SIZE / n;

    const u0 = (rect.x + WORLD_X0) / WORLD_SIZE;
    const u1 = (rect.x + rect.w + WORLD_X0) / WORLD_SIZE;
    const v0 = (rect.y + WORLD_Y0) / WORLD_SIZE;
    const v1 = (rect.y + rect.h + WORLD_Y0) / WORLD_SIZE;

    const tx0 = Math.max(0, Math.floor(u0 * n));
    const tx1 = Math.min(n - 1, Math.floor(u1 * n));
    const ty0 = Math.max(0, Math.floor(v0 * n));
    const ty1 = Math.min(n - 1, Math.floor(v1 * n));

    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > MAX_TILES) continue;

    out = [];
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        out.push({
          key: `${z}/${tx}/${ty}`,
          href: tileUrl(tile.url, z, tx, ty),
          x: (tx / n) * WORLD_SIZE - WORLD_X0,
          y: (ty / n) * WORLD_SIZE - WORLD_Y0,
          size,
        });
      }
    }
    break;
  }

  return out;
}

/**
 * The fallback tiles for a view — see `FALLBACK_MAX_ZOOM`.
 *
 * Returns nothing when it would duplicate the sharp layer exactly, which is the
 * case at national and state extents where the requested level is already at or
 * below the cap.
 */
export function fallbackTilesForRect(
  rect: ViewBoxRect,
  source: BaseMapSource,
  renderPx: number,
): MapTile[] {
  return tilesForRect(rect, source, renderPx, {
    zoomBias: FALLBACK_ZOOM_BIAS,
    zoomCap: FALLBACK_MAX_ZOOM,
  });
}

/**
 * The unrounded slippy zoom this view *wants*, device pixel ratio included.
 *
 * The same figure `tilesForRect` picks its level from, exposed so that a
 * coverage probe can ask "is there imagery at the level we are about to
 * request?" without duplicating the arithmetic and drifting out of step with
 * it. Distinct from `zoomForRect`, which is the readout: that one is what the
 * reader is looking at, in CSS pixels; this one is what the tiles are cut at.
 */
export function requestedZoom(rect: ViewBoxRect, source: BaseMapSource, renderPx: number): number {
  const tile = source.tile;
  if (!tile || rect.w <= 0 || renderPx <= 0) return 0;
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const ideal = Math.log2(((renderPx * dpr) / TILE_PX) * (WORLD_SIZE / rect.w));
  return Math.max(MIN_ZOOM, Math.min(tile.maxZoom, Math.round(ideal)));
}

/** The tile containing the centre of a view, at a given zoom. What a coverage
 *  probe asks about — one tile stands for the view, because imagery footprints
 *  are far larger than a screenful. */
export function centreTile(rect: ViewBoxRect, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const u = (rect.x + rect.w / 2 + WORLD_X0) / WORLD_SIZE;
  const v = (rect.y + rect.h / 2 + WORLD_Y0) / WORLD_SIZE;
  return {
    x: Math.max(0, Math.min(n - 1, Math.floor(u * n))),
    y: Math.max(0, Math.min(n - 1, Math.floor(v * n))),
  };
}
