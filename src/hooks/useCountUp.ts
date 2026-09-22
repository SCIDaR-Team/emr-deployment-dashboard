import { useEffect, useRef, useState } from 'react';

/**
 * Quintic ease-out.
 *
 * Most of the distance is covered in the first third, so the figure is legible
 * almost at once and the motion is a settle rather than a reveal. Nobody should
 * be waiting to read the number.
 *
 * Exported so the curve can be pinned by a test without a DOM: the animation
 * itself needs a compositing browser, which neither the test runner nor a
 * headless pane provides.
 */
export function easeOutQuint(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 5);
}

/**
 * Count a figure up from zero, once, when it first appears.
 *
 * ## Why this is a hook and not a CSS animation
 *
 * The reduced-motion rule in `globals.css` flattens every animation and
 * transition in the app to 0.01ms, which is the whole of the accessibility
 * story for the overlay entrances. It cannot reach a number being counted in
 * JavaScript, so this asks `matchMedia` directly and returns the final value on
 * the first frame when the reader has asked for less motion. A count-up is
 * exactly the kind of movement that rule exists for — it is motion *in the
 * reading itself*, not at the edge of a panel — so this must not be the one
 * animation in the app that ignores it.
 *
 * ## Once, on mount, and never on a filter change
 *
 * Every figure on these pages is live to the filter row. Animating on each
 * change would mean a number in motion on every click, which reads as the page
 * recalculating and is unbearable when the reader is sweeping through states.
 * So the count runs when the figure appears — a page load, a route change —
 * and any later value lands immediately.
 *
 * ## What happens where nothing is composited
 *
 * `shown` starts at the final value rather than at zero, so a browser that
 * never runs the animation — a hidden tab, a print, a raster capture — shows
 * the figure the page is reporting rather than a zero or a half-counted
 * number. The cost is one frame at the final value before the count begins.
 * That is the right way round for a dashboard: the worst case of the safe
 * order is a missed flourish, and the worst case of the other is an export
 * with the wrong total burnt into it.
 */
export function useCountUp(value: number, durationMs = 450): number {
  const [shown, setShown] = useState(value);
  /**
   * Whether a count has already *finished*, so later values land without
   * animating. A ref rather than state: flipping it must not cause a render.
   *
   * Set on the final frame and not on the first, which matters twice. Under
   * StrictMode every effect is mounted, torn down and mounted again, so a flag
   * raised on entry would be raised by the first pass, cancelled by its own
   * cleanup, and then read as "already counted" by the real one — the figure
   * would print instead of counting, in development only, which is the worst
   * place for a bug to hide. And in production the same flag would be raised by
   * whatever the figure happened to be before its data arrived, so a total that
   * loads a moment late would never animate either.
   *
   * Marking completion instead makes both cases right: an animation that never
   * ran leaves the flag down, and one that ran to the end puts it up.
   */
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current) {
      setShown(value);
      return;
    }

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(value) || value === 0) {
      setShown(value);
      // Not a completed count, so a real value arriving after this still gets
      // its animation — but a reader who asked for reduced motion has settled
      // the question for the whole session.
      counted.current = reduced;
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutQuint(t);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      // The last frame is assigned exactly rather than left to the easing, so
      // the figure that settles is the figure the page is reporting and not a
      // rounding of it.
      else {
        setShown(value);
        counted.current = true;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return shown;
}
