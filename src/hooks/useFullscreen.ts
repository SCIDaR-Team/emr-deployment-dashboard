import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Put one element full-screen, and know when it is.
 *
 * The map is the page on both explorer routes, but "the page" still means a
 * pane down one side, a filter row across the top and a browser around all of
 * it — perhaps 55% of the display given to the thing the reader is actually
 * reading. At national extent that is enough. Two levels down, picking one
 * clinic out of a cluster of six on satellite imagery, it is not, and there is
 * no amount of zooming that substitutes for screen: zoom changes the scale, and
 * what is short is the *extent* visible at that scale.
 *
 * Native fullscreen rather than a CSS-fixed overlay, because the map is a
 * canvas the reader works in and the browser chrome is as much a border as the
 * pane is. The element keeps its React tree, so the viewport, the selection and
 * every layer toggle survive going in and coming out.
 *
 * State is read from `document.fullscreenElement` on the browser's own event
 * rather than tracked locally: the reader can leave with Escape or the system
 * gesture, neither of which goes through the button, and a locally-tracked flag
 * would then be stuck saying the map is full-screen while it plainly is not.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Some browsers, and every one in a sandboxed iframe with no
   *  `allow="fullscreen"`, refuse the request. A button that silently does
   *  nothing is worse than an absent one, so the caller can hide it. */
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof document !== 'undefined' && !!document.fullscreenEnabled);
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen().catch(() => setSupported(false));
    } else {
      // Rejects rather than throws when the gesture is not user-activated or
      // the frame is not permitted to; either way the answer is "this browser
      // will not", so the control retires itself instead of failing again.
      void el.requestFullscreen().catch(() => setSupported(false));
    }
  }, []);

  return { ref, isFullscreen, supported, toggle };
}
