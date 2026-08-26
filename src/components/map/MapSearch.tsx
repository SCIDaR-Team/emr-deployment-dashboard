import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Go to a place by name.
 *
 * The filter row already has a Search box, and it does something different on
 * purpose: it *narrows the population* — type "Sumaila" and every count on the
 * page recomputes over the facilities that match. That is the right behaviour
 * for a filter and the wrong behaviour for a map, where the question "where is
 * Sumaila" wants an answer of the form "here", not "here are the 47 things
 * still standing after I removed the rest".
 *
 * So this is a **locator**, the thing every GIS puts in the corner of the map.
 * It changes no filter and removes nothing. It resolves a name to a place and
 * takes the reader there, opening whatever levels of the hierarchy lie in
 * between — which is what makes a facility in an LGA nobody can name reachable
 * without knowing which state to drill into first.
 *
 * The caller supplies the matcher, because what is findable depends on what the
 * page knows: Assessed States can resolve down to a facility, National Coverage
 * stops at the LGA. Results are computed per keystroke inside this component so
 * a page holding thousands of rows is not re-rendered on every character.
 */

export interface MapSearchResult {
  id: string;
  label: string;
  /** Which level of the hierarchy this is, shown as a chip and announced. */
  kind: 'State' | 'LGA' | 'Facility';
  /** Where it sits — "Kano" for an LGA, "Sumaila, Kano" for a facility. Two
   *  facilities in different states routinely share a name, so without this the
   *  reader is picking between identical rows. */
  hint?: string;
  onSelect: () => void;
}

/** Below this a query matches most of the country and the list is noise. */
const MIN_QUERY = 2;

/** Enough to find the thing; short enough to stay a list rather than a page. */
const MAX_RESULTS = 12;

export function MapSearchPanel({
  open,
  onClose,
  search,
  className,
}: {
  open: boolean;
  onClose: () => void;
  search: (query: string) => MapSearchResult[];
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => (query.trim().length >= MIN_QUERY ? search(query).slice(0, MAX_RESULTS) : []),
    [query, search],
  );

  // Opening lands the caret in the box: the reader clicked a magnifier, which
  // is not a request to then click again.
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  // A query change invalidates the highlight — leaving it on index 3 of a list
  // that just became two rows long means Enter goes somewhere unrelated.
  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (result: MapSearchResult) => {
    result.onSelect();
    onClose();
  };

  return (
    <div
      role="search"
      className={cn(
        'w-[268px] overflow-hidden rounded-lg border border-border bg-surface/95 shadow-pop backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a state, LGA or facility…"
          aria-label="Find a place on the map"
          // The listbox pattern, so a screen reader is told how many results
          // arrived rather than being left on a box that silently changed.
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="map-search-results"
          aria-activedescendant={
            results[active] ? `map-search-${results[active]!.id}` : undefined
          }
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const hit = results[active];
              if (hit) choose(hit);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div
        id="map-search-results"
        ref={listRef}
        role="listbox"
        aria-label="Search results"
        className="max-h-[260px] overflow-y-auto py-1"
      >
        {query.trim().length < MIN_QUERY ? (
          <p className="px-2.5 py-1.5 text-[12px] text-muted-foreground">
            Type a name to jump straight to it.
          </p>
        ) : results.length === 0 ? (
          <p className="px-2.5 py-1.5 text-[12px] text-muted-foreground">
            Nothing here by that name.
          </p>
        ) : (
          results.map((result, i) => (
            <button
              key={result.id}
              id={`map-search-${result.id}`}
              type="button"
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              // Pointer *down*, not click: the input has focus and a click would
              // blur it first, which on some browsers tears the panel down
              // before the selection lands.
              onPointerDown={(e) => {
                e.preventDefault();
                choose(result);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left transition-colors',
                i === active ? 'bg-muted' : 'hover:bg-muted',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-tight text-foreground">
                  {result.label}
                </span>
                {result.hint && (
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                    {result.hint}
                  </span>
                )}
              </span>
              <span className="mono shrink-0 text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                {result.kind}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
