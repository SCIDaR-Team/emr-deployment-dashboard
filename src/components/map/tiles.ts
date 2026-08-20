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

/** A tighter cap than the providers' own: one screenful of a Nigerian LGA at
 *  ~256px/tile is a handful of requests, and a runaway zoom estimate must not
 *  turn into hundreds. */
const MAX_TILES = 64;

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
export function tilesForRect(rect: ViewBoxRect, source: BaseMapSource, renderPx: number): MapTile[] {
  const tile = source.tile;
  if (!tile || rect.w <= 0 || rect.h <= 0) return [];

  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const ideal = Math.log2(((renderPx * dpr) / TILE_PX) * (WORLD_SIZE / rect.w));

  let z = Math.max(MIN_ZOOM, Math.min(tile.maxZoom, Math.round(ideal)));
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
