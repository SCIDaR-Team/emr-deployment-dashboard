/**
 * In-page section navigation.
 *
 * A page here is four or five stacked panels and often two or three screens
 * tall, so the only way to reach the itemised schedule at the bottom was to
 * scroll past everything above it and hope you recognised it on the way past.
 * These tabs are the second way through a page: click one and it scrolls to
 * that section. Scrolling by hand is unchanged — the row follows along and
 * marks where you are, so it doubles as a "you are here" for a reader who never
 * clicks it at all.
 *
 * They are deliberately *not* `role="tablist"`. Real tabs show one panel and
 * hide the rest; every section here stays on the page and stays reachable by
 * scrolling, and announcing hidden panels that do not exist would send a screen
 * reader hunting for them. It is a list of in-page links, so that is what it
 * reports itself as.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface PageSection {
  /** DOM id of the section, set with `data-section` on the element itself. */
  id: string;
  /** Tab text. Short — the section's own heading, trimmed if it is a sentence. */
  label: string;
}

/**
 * Clearance under the sticky header, so a section that scrolls to the top lands
 * *below* the header rather than behind it. The header measures itself into
 * `--page-header-h` (see PageHeader); this is the gap left under it.
 */
const HEADROOM = 12;

/** How far under the header a section's top must pass before it counts as the
 *  one being read. A few pixels of slack absorbs sub-pixel scroll positions. */
const ACTIVATION_SLACK = 8;

/** Travel time for a tab click, in ms. Long enough that the reader sees which
 *  way the page moved — the point of animating it at all — and short enough
 *  that clicking two tabs in a row does not feel queued. */
const SCROLL_MS = 320;

/**
 * Scroll `el` to just under the sticky header, animated.
 *
 * Driven here rather than handed to `scrollIntoView({ behavior: 'smooth' })`
 * because the destination is not "the top of the container": it is the top
 * minus a header whose height changes per page and rewraps with the viewport.
 * Owning the animation also means the reduced-motion case is an explicit jump
 * rather than something inherited from a `scroll-behavior` override.
 *
 * Returns a cancel function — a second click must abandon the first flight
 * rather than fight it for the scroll position.
 */
function animateTo(scroller: HTMLElement, el: HTMLElement): () => void {
  const top = Math.max(
    0,
    Math.min(
      scroller.scrollTop +
        el.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        (headerHeight() + HEADROOM),
      scroller.scrollHeight - scroller.clientHeight,
    ),
  );

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scroller.scrollTop = top;
    return () => {};
  }

  const from = scroller.scrollTop;
  const distance = top - from;
  const started = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const progress = Math.min(1, (now - started) / SCROLL_MS);
    // Ease out cubic: leaves fast so the click feels answered, arrives slow so
    // the reader can see where they landed.
    scroller.scrollTop = from + distance * (1 - (1 - progress) ** 3);
    if (progress < 1) frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}

function headerHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--page-header-h');
  return Number.parseFloat(raw) || 0;
}

export function SectionTabs({
  sections,
  className,
}: {
  sections: PageSection[];
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  const listRef = useRef<HTMLElement>(null);

  /**
   * Which section is being read.
   *
   * Of the sections whose top has passed under the header, the *lowest* one
   * wins — not the last in document order. On a stacked page the two rules
   * agree, but several pages put two panels side by side, and there they do
   * not: siblings in a row share a top, so "last in document order" would let
   * the right-hand panel permanently shadow the left.
   *
   * Passing under the header, rather than merely being visible, is what counts:
   * a short final section can never reach the top of a tall viewport, so an
   * "is it in view" test would leave the last tab unreachable. Reaching the
   * bottom of the scroll container is therefore special-cased to it.
   */
  const sync = useCallback(() => {
    const scroller = document.getElementById('main');
    if (!scroller || sections.length === 0) return;

    const threshold = headerHeight() + HEADROOM + ACTIVATION_SLACK;
    let current = sections[0]!.id;
    let best = -Infinity;
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (!el) continue;
      const { top } = el.getBoundingClientRect();
      // Strictly greater, so a tie between two panels in the same row resolves
      // to the earlier one — which is the left-hand one, and the one a reader
      // scanning that row reaches first.
      if (top <= threshold && top > best) {
        best = top;
        current = section.id;
      }
    }

    const atBottom =
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    if (atBottom) current = sections[sections.length - 1]!.id;

    setActive(current);
  }, [sections]);

  useEffect(() => {
    const scroller = document.getElementById('main');
    if (!scroller) return;

    // Run straight off the event, not coalesced into a frame. Scroll events are
    // already delivered at most once per frame, and the work is a handful of
    // `getBoundingClientRect` reads over the four or five sections a page has —
    // a rAF wrapper would buy nothing and would stop the strip tracking in any
    // context where frames are not being served.
    sync();
    scroller.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      scroller.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [sync]);

  /** Keep the active tab in view when the row itself has overflowed — on a
   *  phone the later tabs sit off the right edge and would never be seen. */
  useEffect(() => {
    const row = listRef.current;
    if (!row || !active) return;
    const tab = row.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`);
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const cancelScroll = useRef<() => void>(() => {});
  useEffect(() => () => cancelScroll.current(), []);

  const go = (id: string) => {
    const scroller = document.getElementById('main');
    const el = document.getElementById(id);
    if (!scroller || !el) return;
    cancelScroll.current();
    cancelScroll.current = animateTo(scroller, el);
    setActive(id);
  };

  if (sections.length < 2) return null;

  return (
    <nav
      ref={listRef}
      aria-label="Sections on this page"
      className={cn(
        'flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-4 py-1.5 sm:px-5',
        // The row is one line and must stay one line: it is a wayfinding strip,
        // and a strip that wraps to two rows on a narrow screen costs more of
        // the fold than the scrolling it saves.
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {sections.map((section) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            data-tab={section.id}
            onClick={() => go(section.id)}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap rounded px-2.5 py-1 text-xs transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              isActive
                ? 'bg-brand-50 font-medium text-brand-700'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}
