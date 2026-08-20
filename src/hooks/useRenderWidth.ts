import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * An element's rendered CSS width.
 *
 * The maps use it to pick a raster tile zoom that matches how large the SVG is
 * actually drawn, rather than guessing: an SVG has no intrinsic pixel size, so
 * viewBox units alone cannot say whether a tile will land at 60px or 600px.
 * Starts at a sensible desktop width so the first paint is never tile-less.
 */
export function useRenderWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      // Quantised: a drag-resize would otherwise re-request every tile on every
      // animation frame, and zoom only changes at power-of-two boundaries.
      if (w > 0) setWidth(Math.round(w / 64) * 64);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
