import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { handoffFrom, recordView } from '@/components/map/viewHandoff';
import { VIEWPORT_PARAM, decodeViewport } from '@/components/map/viewportUrl';
import { useViewportUrl } from './useViewportUrl';
import { fitViewBox, type Box } from '@/lib/mapProjection';

/**
 * Pan/zoom state for a map layer, plus the gesture that carries the reader
 * between layers.
 *
 * Zooming is a viewBox change — never a reprojection — which is the same
 * property `mapProjection` is built around, so a layer can be zoomed
 * arbitrarily without any of its geometry, labels or tiles being recomputed.
 * The raster base map re-picks its tile zoom off the viewBox width on its own,
 * so imagery sharpens as the reader goes in without this hook knowing tiles
 * exist.
 *
 * Drill-through: each layer can only zoom so far before the useful detail is
 * on the *next* layer down. Push past that limit and `onDrillIn` fires with
 * the point at the centre of the view; pull back out past the layer's own
 * extent and `onDrillOut` fires. Both need a deliberate overshoot rather than
 * a single notch, so an ordinary scroll that happens to bottom out doesn't
 * teleport the reader somewhere they didn't ask to go.
 */

export interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function parseRect(viewBox: string): ViewportRect {
  const [x = 0, y = 0, w = 1, h = 1] = viewBox.split(/\s+/).map(Number);
  return { x, y, w, h };
}

function formatRect(r: ViewportRect): string {
  return `${r.x.toFixed(2)} ${r.y.toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)}`;
}

/** How much accumulated over-zoom counts as "the reader means it" (~1.5x). */
const DRILL_OVERSHOOT = 0.4;

/** Overshoot decays if the reader pauses, so two unrelated gestures never add
 *  up into a drill. */
const OVERSHOOT_IDLE_MS = 500;

/** After a level change, ignore the tail of the gesture that caused it. */
const DRILL_COOLDOWN_MS = 700;

/** Drag further than this and the gesture was a pan, not a click on a unit. */
const CLICK_SLOP_PX = 4;

/**
 * How long a camera move takes.
 *
 * Long enough that the eye can follow a state growing into the frame, short
 * enough that a reader clicking through four levels is not waiting on it. The
 * cross-level flight gets the longer figure because it also has to cover a
 * layer swap: the geometry underneath changes at the start of it, and a fast
 * animation reads as a flicker rather than as a move.
 */
const FLY_MS = 520;
const STEP_MS = 260;

/** Cubic ease in and out — the standard camera curve. A linear fly starts and
 *  stops abruptly enough that it reads as a jump with frames in the middle. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Whether to move the camera at all.
 *
 * Every flight in this hook is decorative in the strict sense — the reader ends
 * up at exactly the same viewport either way — so an OS-level request for
 * reduced motion is honoured by jumping straight to the destination. Read at
 * call time rather than cached, because the setting can change mid-session.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Interpolate between two viewports.
 *
 * Position lerps linearly but **size lerps geometrically** — the midpoint of a
 * flight from a 700-unit view to a 20-unit one is 118 units, not 360. That is
 * what makes a long zoom feel like constant motion instead of a slow crawl
 * followed by a lurch: the eye reads zoom as a ratio, so equal steps have to be
 * equal *multiples*. Nigeria to one LGA is a 40x change, which is exactly the
 * range where a linear size lerp falls apart.
 */
function lerpRect(a: ViewportRect, b: ViewportRect, t: number): ViewportRect {
  const w = a.w * Math.pow(b.w / a.w, t);
  const h = a.h * Math.pow(b.h / a.h, t);
  // Centres, not corners: interpolating x/y directly lets the subject drift
  // out of frame and back in when the two rects differ a lot in size.
  const cx = (a.x + a.w / 2) + ((b.x + b.w / 2) - (a.x + a.w / 2)) * t;
  const cy = (a.y + a.h / 2) + ((b.y + b.h / 2) - (a.y + a.h / 2)) * t;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

interface Options {
  /** The layer's fully-zoomed-out viewBox. Changing it re-frames the viewport,
   *  which is what makes a drill land framed on the new unit. */
  base: string;
  /**
   * Which layer this is — `'national'`, `'state'`, `'lga'`.
   *
   * Only ever used to arrange the flight between levels: the outgoing layer
   * leaves its viewport under this key and the incoming one, seeing a different
   * key, flies in from it. See `viewHandoff`. Omit it and the layer simply
   * starts at its own extent, which is the old behaviour.
   */
  layerKey?: string;
  /**
   * Whether `base` is the layer's real extent yet.
   *
   * Every layer computes its extent from boundaries it fetches, and renders a
   * placeholder `base` until they land. That placeholder must not be treated as
   * a destination: a viewport restored from the URL would be adopted against
   * the wrong rectangle and then thrown away a moment later when the real
   * extent arrived and re-framed the map. Leave it unset for a layer whose
   * extent is known from the first render.
   */
  ready?: boolean;
  /** How far in this layer can usefully go before the next one takes over. */
  maxScale?: number;
  /** Called with the centre of the view and the live `<svg>`, so the layer can
   *  hit-test which of its own units the reader has zoomed into — see
   *  `unitAtPoint`. */
  onDrillIn?: (point: { x: number; y: number }, svg: SVGSVGElement | null) => void;
  onDrillOut?: () => void;
}

export function useMapViewport({
  base,
  maxScale = 6,
  layerKey,
  ready = true,
  onDrillIn,
  onDrillOut,
}: Options) {
  const svgRef = useRef<SVGSVGElement>(null);
  const baseRect = useMemo(() => parseRect(base), [base]);

  /**
   * Where this layer's first frame is drawn.
   *
   * Not `baseRect`, when the reader arrived by drilling: the previous level
   * left its viewport in the handoff slot, and starting there is what lets the
   * flight below read as one continuous zoom across the layer swap. Computed in
   * a state initialiser so it is settled before the first paint — an effect
   * would show one frame at full extent first, which is the cut this exists to
   * remove.
   */
  const [rect, setRect] = useState<ViewportRect>(
    () => (layerKey ? handoffFrom(layerKey) : null) ?? baseRect,
  );
  const rectRef = useRef(rect);

  /** The rAF handle for a flight in progress, so the next one — or any reader
   *  gesture — can cut it short rather than fight it. */
  const anim = useRef<number | null>(null);

  const stopFlight = useCallback(() => {
    if (anim.current !== null) {
      cancelAnimationFrame(anim.current);
      anim.current = null;
    }
  }, []);

  const setViewport = useCallback(
    (next: ViewportRect) => {
      rectRef.current = next;
      setRect(next);
      // Every layer publishes its live viewport, so whichever layer replaces
      // this one knows where the camera was left. Cheap — a single object
      // assignment — and it has to be here rather than on unmount, since a
      // component that has already unmounted cannot report anything.
      if (layerKey) recordView(layerKey, next);
    },
    [layerKey],
  );

  /**
   * Move the camera to `target` over `ms`, easing.
   *
   * The one path every programmatic viewport change goes through — the zoom
   * buttons, reset, fit-to-selection, and the cross-level flight. Reader
   * gestures deliberately do *not*: a wheel or a pinch is already a continuous
   * stream of positions, and easing each one would put the map a few hundred
   * milliseconds behind the fingers driving it.
   */
  const flyTo = useCallback(
    (target: ViewportRect, ms = FLY_MS) => {
      stopFlight();
      const from = rectRef.current;
      const same =
        Math.abs(from.x - target.x) < 1e-3 &&
        Math.abs(from.y - target.y) < 1e-3 &&
        Math.abs(from.w - target.w) < 1e-3;
      if (same) return;
      if (ms <= 0 || prefersReducedMotion()) {
        setViewport(target);
        return;
      }
      const t0 = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        setViewport(t >= 1 ? target : lerpRect(from, target, easeInOutCubic(t)));
        anim.current = t >= 1 ? null : requestAnimationFrame(frame);
      };
      anim.current = requestAnimationFrame(frame);
    },
    [setViewport, stopFlight],
  );

  /**
   * Settle the camera whenever the layer's own extent becomes known or changes.
   *
   * Three cases.
   *
   * A **shared link** wins outright: `?v=` names an exact viewport the sender
   * chose, so it is adopted rather than flown away from — flying to the base
   * extent first would show the recipient the default framing and then move,
   * which is the opposite of arriving where you were sent. It is clamped to
   * this layer's extent, and `decodeViewport` refuses anything written by a
   * different layer, so a stale parameter can only ever be ignored.
   *
   * Otherwise, on the **first** settled extent there may be a flight owed —
   * from the previous level's framing down onto this one, if the reader arrived
   * by drilling (see `viewHandoff`).
   *
   * On a **later** change the reader is still on this layer and its subject
   * moved under them (a different state picked in the filter row), which is a
   * camera move for the same reason.
   */
  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;

    if (first.current) {
      first.current = false;
      const shared = layerKey
        ? decodeViewport(
            new URLSearchParams(window.location.search).get(VIEWPORT_PARAM),
            layerKey,
            baseRect.h / baseRect.w,
          )
        : null;
      if (shared) {
        setViewport(clamp(shared));
        return;
      }
      flyTo(baseRect, FLY_MS);
      return;
    }

    flyTo(baseRect, STEP_MS);
    // `flyTo`, `clamp` and `setViewport` are stable; re-running on a new
    // `baseRect` (or on the extent becoming known) is the point of the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRect, ready]);

  // Publish the camera to `?v=`, so a link carries the framing and not just the
  // scope — see `useViewportUrl` for why this is a `replaceState` and not a
  // navigation.
  useViewportUrl(layerKey, rect, baseRect);

  useEffect(() => stopFlight, [stopFlight]);

  const overshoot = useRef({ amount: 0, at: 0, direction: 0 });
  /**
   * Where the last zoom was anchored, in viewBox units.
   *
   * This — not the centre of the view — is what a drill hit-tests. Zooming
   * about the pointer keeps whatever is under the pointer under the pointer,
   * so a state the reader zoomed into from the corner of the map is still in
   * the corner when the limit is reached; taking the centre instead would drill
   * into its neighbour. Null until the first pointer-anchored zoom, so the
   * +/- buttons fall back to the centre, which is what they zoom about.
   */
  const lastFocus = useRef<{ x: number; y: number } | null>(null);
  const drilledAt = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef(0);
  const dragDistance = useRef(0);
  /**
   * Whether this gesture has taken pointer capture.
   *
   * Capture is claimed lazily, on the first move past the click slop, and never
   * on pointerdown: while a capture is active the browser retargets the
   * following `click` to the capturing element, so capturing up front sent
   * every click to the `<svg>` and the shape's own handler — the click-to-drill
   * path — never ran. Deferring it costs nothing, since capture only matters
   * once the pointer can leave the element, which is exactly when a drag has
   * started.
   */
  const captured = useRef(false);
  const [panning, setPanning] = useState(false);

  const clamp = useCallback(
    (r: ViewportRect): ViewportRect => {
      const w = Math.min(r.w, baseRect.w);
      const h = Math.min(r.h, baseRect.h);
      return {
        w,
        h,
        x: Math.min(Math.max(r.x, baseRect.x), baseRect.x + baseRect.w - w),
        y: Math.min(Math.max(r.y, baseRect.y), baseRect.y + baseRect.h - h),
      };
    },
    [baseRect],
  );

  /** Client coordinates → viewBox units. Valid because the SVG is rendered at
   *  `h-auto w-full`, so its box always has the viewBox's own aspect ratio and
   *  `preserveAspectRatio` never letterboxes. */
  const toViewport = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const r = rectRef.current;
    if (!svg) return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const box = svg.getBoundingClientRect();
    return {
      x: r.x + ((clientX - box.left) / box.width) * r.w,
      y: r.y + ((clientY - box.top) / box.height) * r.h,
    };
  }, []);

  /**
   * Zoom by `factor` (>1 = closer) about a fixed point.
   *
   * Returns the overshoot — how much of the requested zoom the layer could not
   * absorb — which is what the drill-through decision is made from.
   */
  const zoomAbout = useCallback(
    (factor: number, focus: { x: number; y: number }, anchored = true) => {
      lastFocus.current = anchored ? focus : null;
      const cur = rectRef.current;
      const minW = baseRect.w / maxScale;
      const wanted = cur.w / factor;
      const w = Math.min(Math.max(wanted, minW), baseRect.w);
      const h = w * (cur.h / cur.w);
      const next = clamp({
        w,
        h,
        x: focus.x - (focus.x - cur.x) * (w / cur.w),
        y: focus.y - (focus.y - cur.y) * (h / cur.h),
      });
      setViewport(next);
      // Positive = wanted to go further in than allowed, negative = further out.
      return Math.log(w / wanted);
    },
    [baseRect, maxScale, clamp, setViewport],
  );

  const registerOvershoot = useCallback(
    (amount: number) => {
      if (amount === 0) return;
      const now = Date.now();
      if (now - drilledAt.current < DRILL_COOLDOWN_MS) return;

      const direction = Math.sign(amount);
      const o = overshoot.current;
      if (now - o.at > OVERSHOOT_IDLE_MS || o.direction !== direction) {
        o.amount = 0;
        o.direction = direction;
      }
      o.amount += Math.abs(amount);
      o.at = now;

      if (o.amount < DRILL_OVERSHOOT) return;
      const handler = direction > 0 ? onDrillIn : onDrillOut;
      if (!handler) return;
      o.amount = 0;
      drilledAt.current = now;
      const r = rectRef.current;
      const centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      if (direction > 0) onDrillIn?.(lastFocus.current ?? centre, svgRef.current);
      else onDrillOut?.();
    },
    [onDrillIn, onDrillOut],
  );

  // React attaches wheel at the root as a passive listener, where
  // preventDefault() is a no-op — so this one is bound natively.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      // The reader is driving now — a flight still in progress would fight
      // them for the viewport for the rest of its duration.
      stopFlight();
      // Zoom needs a modifier. The map lives partway down a scrolling page, and
      // a bare wheel that zooms instead of scrolling traps anyone whose pointer
      // happens to be over it. Trackpad pinch already arrives as ctrl+wheel, so
      // that gesture keeps working untouched.
      if (!e.ctrlKey && !e.metaKey) {
        // A bare wheel pans instead — but only once zoomed in, and only while
        // there is somewhere left to pan. At full extent, or against an edge,
        // the event is left alone and the page scrolls as it always did, so the
        // map can be scrolled *through* rather than trapping the reader in it.
        const cur = rectRef.current;
        if (cur.w >= baseRect.w - 1e-6 && cur.h >= baseRect.h - 1e-6) return;
        const svg = svgRef.current;
        if (!svg) return;
        const box = svg.getBoundingClientRect();
        const next = clamp({
          ...cur,
          x: cur.x + (e.deltaX / box.width) * cur.w,
          y: cur.y + (e.deltaY / box.height) * cur.h,
        });
        if (Math.abs(next.x - cur.x) < 1e-6 && Math.abs(next.y - cur.y) < 1e-6) return;
        e.preventDefault();
        setViewport(next);
        return;
      }
      e.preventDefault();
      // Pinch sends a stream of small deltas where a notched wheel sends one
      // large one; the divisor keeps a notch decisive without making a pinch
      // lurch.
      const step = e.deltaY / (Math.abs(e.deltaY) >= 50 ? 260 : 60);
      registerOvershoot(zoomAbout(Math.exp(-step), toViewport(e.clientX, e.clientY)));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAbout, toViewport, registerOvershoot, clamp, setViewport, baseRect, stopFlight]);

  /**
   * Take pointer capture, tolerating failure.
   *
   * `setPointerCapture` throws NotFoundError whenever the id is not an active
   * pointer — a pointer released between two events, a replayed or synthesised
   * one. Unguarded, that exception aborts the rest of the handler it was called
   * from, which is the handler that does the panning: the map would simply stop
   * moving. Capture only extends a drag past the edge of the element, so losing
   * it degrades the gesture rather than breaking it.
   */
  const capture = (el: Element, pointerId: number) => {
    try {
      el.setPointerCapture(pointerId);
      captured.current = true;
    } catch {
      captured.current = false;
    }
  };

  const midpoint = () => {
    const pts = [...pointers.current.values()];
    const a = pts[0]!;
    const b = pts[1]!;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  const bind = {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopFlight();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDistance.current = 0;
      if (pointers.current.size === 2) {
        pinchDistance.current = midpoint().d;
        // A pinch is never a click, so capture immediately — it keeps working
        // if a finger strays off the map mid-gesture.
        capture(e.currentTarget, e.pointerId);
      } else {
        setPanning(true);
      }
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size >= 2) {
        const { cx, cy, d } = midpoint();
        if (pinchDistance.current > 0 && d > 0) {
          registerOvershoot(zoomAbout(d / pinchDistance.current, toViewport(cx, cy)));
        }
        pinchDistance.current = d;
        return;
      }

      const svg = svgRef.current;
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      const cur = rectRef.current;
      const dx = ((e.clientX - prev.x) / box.width) * cur.w;
      const dy = ((e.clientY - prev.y) / box.height) * cur.h;
      dragDistance.current += Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
      if (!captured.current && dragDistance.current > CLICK_SLOP_PX) {
        capture(e.currentTarget, e.pointerId);
      }
      setViewport(clamp({ ...cur, x: cur.x - dx, y: cur.y - dy }));
    },
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.delete(e.pointerId);
      pinchDistance.current = 0;
      if (pointers.current.size === 0) {
        setPanning(false);
        captured.current = false;
      }
    },
    onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.delete(e.pointerId);
      pinchDistance.current = 0;
      if (pointers.current.size === 0) {
        setPanning(false);
        captured.current = false;
      }
    },
    // A pan that ends over a state must not also count as a click on it.
    // Capture phase, so this runs before the shape's own handler.
    onClickCapture: (e: React.MouseEvent<SVGSVGElement>) => {
      if (dragDistance.current > CLICK_SLOP_PX) {
        e.stopPropagation();
        e.preventDefault();
        dragDistance.current = 0;
      }
    },
    onDoubleClick: (e: React.MouseEvent<SVGSVGElement>) => {
      zoomAbout(1.8, toViewport(e.clientX, e.clientY));
    },
  };

  const scale = baseRect.w / rect.w;

  return {
    svgRef,
    viewBox: formatRect(rect),
    scale,
    isZoomed: scale > 1.001,
    panning,
    bind,
    /**
     * Client coordinates → viewBox units.
     *
     * Exposed so a layer can turn a pointer position into a coordinate for the
     * live lat/lon readout, without a second copy of the box arithmetic that
     * could drift out of step with the one the gestures use.
     */
    toViewport,
    /** The live viewport, for anything that has to measure the view rather
     *  than just render it — the scale bar's ground distance, the readout's
     *  centre latitude. */
    rect,
    flyTo,
    /**
     * Frame a bounding box — "zoom to selection", in GIS terms.
     *
     * Takes the same padded fit every layer's base extent goes through, so
     * fitting one state on the national map frames it exactly the way the state
     * layer will when the reader drills into it — but with `fitViewBox`'s
     * absolute padding floor switched off and the layer's own `maxScale` used
     * as the lower bound on width instead.
     *
     * Both halves of that matter. The floor is four viewBox units, which is a
     * good margin around a country and *larger than the subject* when the
     * subject is two facilities thirty metres apart, so leaving it on capped a
     * cluster expansion at about 2.5x when it needed nine. And with the floor
     * gone there is nothing left to stop a fit on a near-degenerate box from
     * zooming to an absurd scale — past what the tile layer will serve, and
     * past the point where the drill-out gesture still makes sense — which is
     * what `maxScale` is already the answer to everywhere else in this hook.
     */
    fitTo: (box: Box, padFrac?: number) => {
      const wanted = parseRect(fitViewBox(box, padFrac, 0));
      const minW = baseRect.w / maxScale;
      if (wanted.w >= minW) {
        flyTo(clamp(wanted));
        return;
      }
      // Too tight for this layer: keep the centre, open out to the limit.
      const h = minW * (wanted.h / wanted.w);
      flyTo(
        clamp({
          w: minW,
          h,
          x: wanted.x + wanted.w / 2 - minW / 2,
          y: wanted.y + wanted.h / 2 - h / 2,
        }),
      );
    },
    zoomBy: (factor: number) => {
      const r = rectRef.current;
      const minW = baseRect.w / maxScale;
      const w = Math.min(Math.max(r.w / factor, minW), baseRect.w);
      const h = w * (r.h / r.w);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      flyTo(clamp({ w, h, x: cx - w / 2, y: cy - h / 2 }), STEP_MS);
    },
    reset: () => flyTo(baseRect),
  };
}

/**
 * Which unit sits under a point, by hit-testing the rendered paths.
 *
 * Uses the browser's own `isPointInFill` rather than a JS point-in-polygon:
 * the paths are already in the DOM, and this way the answer can never
 * disagree with what the reader sees — including for the multi-part
 * geometries (Lagos's islands, riverine Rivers LGAs) where a home-grown test
 * would need its own special case.
 */
export function unitAtPoint(svg: SVGSVGElement | null, point: { x: number; y: number }): string | null {
  if (!svg) return null;
  const pt = svg.createSVGPoint();
  pt.x = point.x;
  pt.y = point.y;
  for (const el of svg.querySelectorAll<SVGPathElement>('path[data-unit-id]')) {
    if (el.isPointInFill(pt)) return el.dataset.unitId ?? null;
  }
  return null;
}
