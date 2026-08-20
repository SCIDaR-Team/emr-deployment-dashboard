import { useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { MobileNavBar, Sidebar } from './Sidebar';
import { Toaster } from '@/components/ui';
import { useFilterUrlSync } from '@/hooks/useFilterUrlSync';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';

/**
 * App shell: fixed dark-green sidebar, scrolling content.
 *
 * Filters live inside each page under its title (as labelled dropdowns), not in
 * a shared side rail — that follows the ERA prototype and keeps the map as the
 * widest element on the page. The URL sync is mounted here, once, because it
 * must survive route changes: it is the filter state that persists across
 * modules, not the page rendering it.
 *
 * `main` is the scroll container, not the window, so scroll restoration is
 * mounted here against it — see useScrollRestoration.
 */
export function AppShell() {
  useFilterUrlSync();

  const mainRef = useRef<HTMLElement>(null);
  useScrollRestoration(mainRef);

  return (
    // `relative` is load-bearing, not cosmetic. `sr-only` is `position:
    // absolute`, and with no positioned ancestor those nodes resolve against the
    // initial containing block — so `overflow-hidden` here does not clip them
    // and each one extends the *document*'s scroll height to wherever it sits.
    // On the explorer that is a ranked-table `<caption>` ~1800px down, which
    // gave the window a scrollbar and scrolled the rail off the top with it.
    <div className="relative flex h-screen overflow-hidden bg-page">
      {/*
        The navigation rail is five links deep and sits before the content in
        the DOM, so without this every keyboard and screen-reader user tabs
        through the whole of it on every route. Visible only when focused,
        which is the one state it needs to exist in.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-surface focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Skip to main content
      </a>
      <Sidebar />
      {/* `min-w-0`: without it this flex child takes its width from the widest
          thing inside it — a 15-column ranked table — and the whole page scrolls
          sideways instead of the table scrolling inside its own card. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNavBar />
        <main
          ref={mainRef}
          id="main"
          // `tabIndex={-1}` so the skip link actually moves focus: an anchor to
          // a non-focusable element scrolls the page but leaves focus where it
          // was, and the next Tab goes straight back into the navigation.
          tabIndex={-1}
          // `relative` for the same reason as the shell root above, one level
          // tighter: it makes the scroll container the containing block, so a
          // page's `sr-only` nodes scroll with their own content instead of
          // being clipped against the shell at a stale offset.
          className="relative flex-1 overflow-y-auto focus:outline-none"
        >
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
