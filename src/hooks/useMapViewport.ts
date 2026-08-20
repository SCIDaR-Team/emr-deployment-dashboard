import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

interface Options {
  /** The layer's fully-zoomed-out viewBox. Changing it resets the viewport,
   *  which is what makes a drill land framed on the new unit. */
  base: string;
  /** How far in this layer can usefully go before the next one takes over. */
  maxScale?: number;
  /** Called with the centre of the view and the live `<svg>`, so the layer can
   *  hit-test which of its own units the reader has zoomed into — see
   *  `unitAtPoint`. */
  onDrillIn?: (point: { x: number; y: number }, svg: SVGSVGElement | null) => void;
  onDrillOut?: () => void;
}

export function useMapViewport({ base, maxScale = 6, onDrillIn, onDrillOut }: Options) {
  const svgRef = useRef<SVGSVGElement>(null);
  const baseRect = useMemo(() => parseRect(base), [base]);

  const [rect, setRect] = useState<ViewportRect>(baseRect);
  const rectRef = useRef(rect);
  const setViewport = useCallback((next: ViewportRect) => {
    rectRef.current = next;
    setRect(next);
  }, []);

  useEffect(() => {
    rectRef.current = baseRect;
    setRect(baseRect);
  }, [baseRect]);

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
  }, [zoomAbout, toViewport, registerOvershoot, clamp, setViewport, baseRect]);

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
    zoomBy: (factor: number) => {
      const r = rectRef.current;
      zoomAbout(factor, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, false);
    },
    reset: () => setViewport(baseRect),
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
