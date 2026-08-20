import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDismissable } from '@/hooks/useDismissable';

export interface ComboOption {
  value: string;
  label: string;
  /** Optional second line — LGA under a facility name, say. */
  hint?: string;
}

export interface ComboboxProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Expand in normal flow instead of floating. See the note below. */
  inline?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Searchable single-select. The facility picker's list runs to 2,804 entries, so
 * a native `<select>` is unusable and typeahead is the point of the component.
 *
 * `inline` expands the list in normal flow rather than absolutely. Inside a
 * scrolling container — the filter drawer, a card with `overflow-hidden` — an
 * absolutely positioned panel is clipped, while an in-flow one grows the scroll
 * height and every option stays reachable. Floating is the default because in a
 * filter bar the in-flow version shoves the page down on every open.
 */
export function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  inline = false,
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
    : options;

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && (
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-left text-sm transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          disabled && 'cursor-not-allowed opacity-55',
          open || selected ? 'border-brand-500' : 'border-input hover:border-brand-500/50',
        )}
      >
        <span className={cn('truncate', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border bg-surface shadow-pop',
            inline ? 'mt-1.5' : 'absolute left-0 right-0 z-40 mt-1.5 animate-pop-in',
          )}
        >
          <div className="relative border-b border-border p-2">
            <Search
              size={14}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-md border border-input bg-page pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none"
            />
          </div>

          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
            ) : (
              filtered.slice(0, 200).map((o) => {
                const active = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                        active ? 'font-semibold text-brand-600' : 'text-foreground',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{o.label}</span>
                        {o.hint && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {o.hint}
                          </span>
                        )}
                      </span>
                      {active && <Check size={14} className="shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
            {/* 2,804 facilities is more DOM than any user will scroll. Typing is
                the intended path; this line says so rather than silently
                truncating. */}
            {filtered.length > 200 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                {(filtered.length - 200).toLocaleString()} more — keep typing to narrow
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
