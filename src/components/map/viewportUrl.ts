/**
 * The camera, in the address bar.
 *
 * This dashboard's stated principle is that every view is a link — scope lives
 * in the path and nowhere else, so `/states/kano/dala?domain=workforce_capacity`
 * is a whole sentence someone can paste to a colleague. The map broke that
 * promise the moment it learned to pan and zoom: a reader who framed one
 * compound on satellite imagery and sent the link handed over a URL that
 * reopens at LGA extent, and the thing they were pointing at is somewhere on
 * screen for the recipient to find by eye.
 *
 * So the viewport rides along too, as `?v=<layer>~<x>,<y>,<w>`.
 *
 * ## Why the layer key is in there
 *
 * A viewBox means the same rectangle of ground at every level — that is the
 * whole point of the shared projection — which makes a stale one silently
 * *plausible* rather than obviously wrong. An LGA's viewport is a perfectly
 * legal rectangle inside the national map's extent, so drilling out while the
 * parameter was still in the querystring would frame the country on a
 * 20-unit box and look like a rendering fault. Stamping the layer that wrote it
 * and refusing to read it back on any other layer makes that unrepresentable.
 *
 * ## Why height is not stored
 *
 * It is derived. The viewport's aspect ratio is the map element's, which the
 * recipient's own layout decides — storing the writer's height would letterbox
 * the reader's map to the shape of a window they never saw.
 */

import type { ViewportRect } from '@/hooks/useMapViewport';

export const VIEWPORT_PARAM = 'v';

/** Three significant-ish decimals: enough to land within a few metres at the
 *  deepest zoom, short enough to keep the URL readable. */
function round(n: number): string {
  return n.toFixed(3).replace(/\.?0+$/, '');
}

export function encodeViewport(layerKey: string, rect: ViewportRect): string {
  return `${layerKey}~${round(rect.x)},${round(rect.y)},${round(rect.w)}`;
}

/**
 * Read a viewport for `layerKey`, or null.
 *
 * Returns null for anything it does not fully trust — a different layer, a
 * malformed value, a non-positive width — because the fallback is the layer's
 * own extent, which is always correct. A map that opens somewhere odd is worse
 * than one that ignores a broken parameter.
 */
export function decodeViewport(
  value: string | null,
  layerKey: string,
  aspect: number,
): ViewportRect | null {
  if (!value) return null;
  const [key, body] = value.split('~');
  if (key !== layerKey || !body) return null;

  const [x, y, w] = body.split(',').map(Number);
  if (![x, y, w].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (!w || w <= 0 || !Number.isFinite(aspect) || aspect <= 0) return null;

  return { x: x!, y: y!, w, h: w * aspect };
}
