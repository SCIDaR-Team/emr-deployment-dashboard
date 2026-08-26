/**
 * The viewport a reader was looking at when they crossed between map levels.
 *
 * Nigeria, a state's LGAs and an LGA's facilities are three separate
 * components: the page swaps one for another as the path changes, each mounts
 * its own `<svg>`, fetches its own boundaries and frames its own extent. That
 * is the right decomposition — an LGA layer has no business holding 774
 * polygons it will never draw — but on its own it makes a drill-down a *cut*.
 * The country is replaced by a state, at a different scale, with no visual
 * account of how one became the other, and the reader has to re-find
 * themselves on every level change.
 *
 * What makes the cut avoidable is the thing `mapProjection` is built around:
 * all three layers plot through one projection, so a viewBox means the same
 * rectangle of ground whichever layer is holding it. A state's framing is
 * therefore a legal viewport for the national layer and vice versa — the two
 * are the same coordinate space at different magnifications.
 *
 * So the outgoing layer leaves its last viewport here, and the incoming one
 * picks it up and *flies* from it to its own extent. Drilling into Kano starts
 * the LGA layer showing exactly the rectangle the national map was showing and
 * zooms it down onto the state; drilling back out starts the national map on
 * Kano and pulls back to the country. The geometry underneath changes at the
 * swap, which the cross-fade covers, but the camera never jumps.
 *
 * A module-level slot rather than a context, because the two parties never
 * exist at the same time — the writer has unmounted before the reader mounts,
 * so there is no tree for a provider to span. Nothing else reads it and it is
 * cleared by age, so it cannot leak state between unrelated visits.
 */

import type { ViewportRect } from '@/hooks/useMapViewport';

interface Handoff {
  rect: ViewportRect;
  /** Which layer left it. A layer never accepts its own — see `handoffFrom`. */
  key: string;
  at: number;
}

let slot: Handoff | null = null;

/**
 * How stale a handoff may be and still be honoured.
 *
 * A level change is one navigation: the outgoing layer unmounts and the
 * incoming one mounts in the same frame or the next. Anything older than this
 * is not a drill-down — it is a reader who left the page, went elsewhere and
 * came back — and flying them in from a viewport they last saw minutes ago
 * would be disorienting rather than continuous. Generous enough to survive a
 * boundary fetch on a slow connection, since the incoming layer only mounts
 * its `<svg>` once its GeoJSON has landed.
 */
const MAX_AGE_MS = 2500;

/** Called by every layer on every viewport change, via `useMapViewport`. */
export function recordView(key: string, rect: ViewportRect): void {
  slot = { rect, key, at: Date.now() };
}

/**
 * The viewport to fly in from, or null to start at the layer's own extent.
 *
 * Read during render rather than in an effect, so a layer's very first paint
 * is already at the handoff and there is no frame of it drawn at full extent
 * before the animation starts.
 *
 * Deliberately does *not* consume the slot. Consuming it would make the result
 * depend on how many times the component happened to render — which under
 * StrictMode's double-invocation is twice — so instead a layer is simply
 * refused its own leavings, which is the actual condition being tested.
 */
export function handoffFrom(key: string): ViewportRect | null {
  if (!slot || slot.key === key) return null;
  if (Date.now() - slot.at > MAX_AGE_MS) return null;
  return slot.rect;
}

/**
 * Forget any pending handoff.
 *
 * For the cases where a level change is *not* a drill — the reader clicked a
 * different state in the filter row, or landed on a deep link cold. Flying in
 * from an unrelated viewport there would animate a relationship that does not
 * exist.
 */
export function clearHandoff(): void {
  slot = null;
}
