import { useEffect, useRef } from 'react';
import { VIEWPORT_PARAM, encodeViewport } from '@/components/map/viewportUrl';
import type { ViewportRect } from './useMapViewport';

/**
 * Keep `?v=` in step with where the camera is.
 *
 * The read side is not here: a layer needs its starting viewport during its
 * very first render, before any effect has run, so it decodes the parameter
 * itself and hands the result to `useMapViewport` as `initial`. This hook owns
 * only the write.
 *
 * ## Three deliberate choices
 *
 * **`replaceState`, not `navigate`.** Panning a map is not a navigation. Going
 * through the router would push an entry per frame and turn the browser's Back
 * button into an undo history for mouse movement — and re-render the whole page
 * on every one. This edits the address bar and tells nobody, which is exactly
 * what a URL that merely *describes* the current view should do.
 *
 * **Debounced.** A drag emits a viewport per animation frame, and a flight
 * emits one per frame for half a second. Writing each would be hundreds of
 * history operations for one gesture; the reader only needs the address bar
 * correct by the time they reach for it.
 *
 * **Removed at full extent.** A map sitting at its own default extent is
 * described completely by its path, so the parameter would be noise — and
 * worse, it would pin a link to a framing the sender never deliberately chose.
 * The URL stays clean until the reader actually moves the camera.
 */
export function useViewportUrl(
  layerKey: string | undefined,
  rect: ViewportRect,
  base: ViewportRect,
): void {
  // The router owns the rest of the querystring, so every write re-reads it
  // rather than caching — a filter changed since the last write must not be
  // clobbered by a stale copy.
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!layerKey) return;

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);

      // "At its extent" rather than "equal to it": a flight lands within a
      // rounding error of the base rect, and an exact comparison would leave
      // the parameter behind after every zoom-out.
      const atBase =
        Math.abs(rect.w - base.w) < base.w * 1e-3 &&
        Math.abs(rect.x - base.x) < base.w * 1e-3 &&
        Math.abs(rect.y - base.y) < base.h * 1e-3;

      if (atBase) {
        if (!params.has(VIEWPORT_PARAM)) return;
        params.delete(VIEWPORT_PARAM);
      } else {
        const next = encodeViewport(layerKey, rect);
        if (params.get(VIEWPORT_PARAM) === next) return;
        params.set(VIEWPORT_PARAM, next);
      }

      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
      );
    }, 350);

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [layerKey, rect, base]);
}
