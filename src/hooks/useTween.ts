import { useEffect, useRef, useState } from 'react';
import { easeOutQuint } from './useCountUp';

/**
 * Glide a figure from its last value to its new one.
 *
 * The counterpart to `useCountUp`, for the one place in the app where a number
 * *should* move on every change: the scenario builder, where the reader is
 * pulling a lever and the figure moving is the answer. `useCountUp` counts once
 * and then lands later values instantly, because on a filtered page a number
 * in motion on every click reads as recalculation. Here the motion is the
 * feedback, so it runs each time — from wherever the figure was, never from
 * zero, and quickly enough that a reader dragging a slider is never waiting.
 *
 * Honours reduced motion the same way `useCountUp` does: the value lands on
 * the next render.
 */
export function useTween(value: number, durationMs = 420): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(value)) {
      current.current = value;
      setShown(value);
      return;
    }

    const from = current.current;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = t < 1 ? from + (value - from) * easeOutQuint(t) : value;
      current.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return shown;
}
