import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Where the reader is in the geographic hierarchy, and every way back up it.
 *
 * `Nigeria › Kano › Dala › Dala Health Post`.
 *
 * A drill-down map has a problem a flat one does not: two levels in, the shape
 * on screen is an unfamiliar outline at an unfamiliar scale, and nothing about
 * it says which country it came out of. The breadcrumb is the fix, and it does
 * two separate jobs that are easy to mistake for one.
 *
 * It **states the context** — the reader can name what they are looking at
 * without recognising it, which matters most for exactly the LGAs nobody
 * recognises. And it **is the way back**: every ancestor is a link, so
 * returning to the state view from a facility is one click rather than three
 * presses of a back arrow. The arrow this sits beside goes up exactly one
 * level; this goes to any level, named.
 *
 * ## Why it lives on the map
 *
 * Overlaid on the map's top-left corner rather than in the page header, because
 * it describes the *map's* scope rather than the page's, and because that
 * corner is where the eye already goes when a view changes under it. It also
 * has to survive full screen, where the page header is not on the display at
 * all — a reader who has given the map the whole screen is precisely the one
 * with the least context to spare.
 */

export interface Crumb {
  /** Stable identity for the key, e.g. `kano` or `f-00042`. */
  id: string;
  label: string;
  /** What the level is, in the vocabulary of the hierarchy — shown to screen
   *  readers so "Dala" is announced as an LGA rather than a bare word. */
  kind: 'Country' | 'State' | 'LGA' | 'Facility';
  /** Navigate to this level. Absent on the last crumb, which is where the
   *  reader already is. */
  onSelect?: () => void;
}

export function MapBreadcrumb({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Geographic hierarchy"
      className={cn(
        'flex max-w-full items-center gap-0.5 overflow-hidden rounded-lg border border-border bg-surface/92 px-2 py-1 shadow-card backdrop-blur',
        className,
      )}
    >
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
            )}
            {last || !crumb.onSelect ? (
              <span
                // `aria-current="location"` rather than "page": the reader has
                // not moved to a different page, they have moved to a different
                // place on this one, which is the distinction the value exists
                // for.
                aria-current={last ? 'location' : undefined}
                className={cn(
                  'truncate px-1 text-xs leading-tight',
                  last ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
                title={`${crumb.kind}: ${crumb.label}`}
              >
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={crumb.onSelect}
                title={`Back to ${crumb.kind.toLowerCase()}: ${crumb.label}`}
                aria-label={`Back to ${crumb.kind.toLowerCase()} ${crumb.label}`}
                className="truncate rounded px-1 text-xs leading-tight text-muted-foreground transition-colors hover:text-brand-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
