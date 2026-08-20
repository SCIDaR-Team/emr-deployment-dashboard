/**
 * Scroll position across route changes.
 *
 * React Router's own `ScrollRestoration` drives the *window*, and this app does
 * not scroll the window — `main` in AppShell is the scroll container (the shell
 * is `h-screen overflow-hidden` so the rail stays put). So the container kept
 * whatever offset the last page left it at, and opening a module from halfway
 * down another one landed the reader halfway down the new one. Harmless when
 * every route change came from the rail at the top of the page; obvious as soon
 * as drill-down links exist further down.
 *
 * Two behaviours, which are not the same thing:
 *
 *   - a *new* navigation (rail, drill-down, back-to-national) starts at the top,
 *     because the reader has not been here yet
 *   - browser back/forward restores where they were, because they have
 *
 * Keyed on pathname, never on `location.key`. Filter changes rewrite the
 * querystring with `replace`, which mints a fresh key on every keystroke — a
 * hook that reset on key would fire the whole page back to the top each time
 * someone typed in the search box.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** How many frames to keep re-applying a restored offset. Lazy routes mount
 *  behind a skeleton, so the container is often too short to hold the offset
 *  for a frame or two after the pathname changes. */
const MAX_RESTORE_FRAMES = 30;

export function useScrollRestoration(ref: RefObject<HTMLElement>): void {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const offsets = useRef(new Map<string, number>());
  const currentPath = useRef(pathname);

  // Record continuously rather than on unmount: the page being left is not
  // unmounted at a point where its offset is still readable, and a passive
  // scroll listener costs nothing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => offsets.current.set(currentPath.current, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref]);

  useLayoutEffect(() => {
    if (currentPath.current === pathname) return;
    currentPath.current = pathname;

    const el = ref.current;
    if (!el) return;

    const target = navigationType === 'POP' ? (offsets.current.get(pathname) ?? 0) : 0;

    if (target === 0) {
      el.scrollTop = 0;
      return;
    }

    let frames = 0;
    let raf = 0;
    const apply = () => {
      el.scrollTop = target;
      if (el.scrollTop < target && frames++ < MAX_RESTORE_FRAMES) {
        raf = requestAnimationFrame(apply);
      }
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [pathname, navigationType, ref]);
}
