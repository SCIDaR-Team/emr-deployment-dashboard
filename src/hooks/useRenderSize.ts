import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * An element's rendered CSS size.
 *
 * The maps use the width to pick a raster tile zoom that matches how large the
 * SVG is actually drawn, rather than guessing: an SVG has no intrinsic pixel
 * size, so viewBox units alone cannot say whether a tile will land at 60px or
 * 600px. The height is there for the same reason in the other direction — a map
 * given both dimensions by its parent letterboxes, and the scale it ends up
 * drawn at is whichever axis ran out first. Starts at a sensible desktop size
 * so the first paint is never tile-less.
 *
 * A **callback ref**, not a `useRef`, and that is the whole point of it. Every
 * map returns a skeleton while its boundaries are in flight and only then
 * renders the element this attaches to — so a `useEffect(…, [])` observer runs
 * against a `ref.current` of `null`, never re-runs, and leaves the size pinned
 * at the default for the life of the component. It was: all three maps have
 * been picking tile zooms off a hardcoded 900px since the loading state was
 * added. A callback ref fires when the element actually arrives.
 */
export function useRenderSize<T extends HTMLElement>(): [(el: T | null) => void, number, number] {
  const [size, setSize] = useState({ w: 900, h: 732 });
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(([entry]) => {
      // Quantised: a drag-resize would otherwise re-request every tile on every
      // animation frame, and zoom only changes at power-of-two boundaries.
      const w = Math.round((entry?.contentRect.width ?? 0) / 64) * 64;
      const h = Math.round((entry?.contentRect.height ?? 0) / 64) * 64;
      if (w > 0 && h > 0) setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    observer.current = ro;
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return [ref, size.w, size.h];
}
