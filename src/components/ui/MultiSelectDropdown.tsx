import { useCallback, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDismissable } from '@/hooks/useDismissable';
import { CountBadge } from './Badge';

export interface DropdownItem {
  key: string;
  label: string;
  /** Facilities behind this option — shown so an empty filter is visible before
   *  it is applied, rather than after the user wonders where the data went. */
  count?: number;
  disabled?: boolean;
  /** Small swatch, e.g. a band colour. */
  color?: string;
}

export interface DropdownGroup {
  label: string;
  items: DropdownItem[];
}

export interface MultiSelectDropdownProps {
  /** The filter's name, always visible. The Figma labels every control. */
  label: string;
  groups: DropdownGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Shown on the trigger when nothing is selected. */
  placeholder?: string;
  align?: 'left' | 'right';
  panelWidth?: string;
  searchable?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  className?: string;
}

/**
 * Labelled multi-select. Trigger button, popover of checkboxes, optional search.
 *
 * The trigger summarises the selection in words rather than as a bare count —
 * "Kano, Kaduna" reads at a glance where "2 selected" makes the user open the
 * popover to find out what is filtered. It falls back to a count past three,
 * where the list stops fitting.
 */
export function MultiSelectDropdown({
  label,
  groups,
  selected,
  onChange,
  placeholder = 'All',
  align = 'left',
  panelWidth = 'w-64',
  searchable = false,
  disabled = false,
  disabledHint,
  className,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [flip, setFlip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  const chosen = new Set(selected);
  const allItems = groups.flatMap((g) => g.items);
  const labelFor = (key: string) => allItems.find((i) => i.key === key)?.label ?? key;

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length <= 3
        ? selected.map(labelFor).join(', ')
        : `${selected.length} selected`;

  const toggle = (key: string) => {
    onChange(chosen.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  // Open leftward when the trigger sits in the right half of the viewport, so a
  // filter bar's last control does not push its panel off-screen.
  const openPanel = () => {
    if (disabled) return;
    if (!open && ref.current) {
      setFlip(ref.current.getBoundingClientRect().left > window.innerWidth / 2);
    }
    setOpen(!open);
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? groups
        .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length)
    : groups;

  return (
    <div className={cn('relative', className)} ref={ref}>
      <label
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        id={`${label}-label`}
      >
        {label}
      </label>

      <button
        type="button"
        onClick={openPanel}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${label}-label`}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-left text-sm transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          disabled && 'cursor-not-allowed opacity-55',
          !disabled && (open || selected.length)
            ? 'border-brand-500 text-foreground'
            : 'border-input text-muted-foreground hover:border-brand-500/50',
        )}
      >
        <span className={cn('truncate', selected.length && 'font-medium text-foreground')}>
          {summary}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <CountBadge count={selected.length} />
          <ChevronDown
            size={16}
            className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className={cn(
            'absolute top-[4.25rem] z-40 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-pop animate-pop-in',
            panelWidth,
            flip || align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="mb-2 h-8 w-full rounded-md border border-input bg-page px-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none"
            />
          )}

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 w-full rounded-md px-2 py-1 text-left text-xs font-semibold text-brand-600 hover:bg-brand-50"
            >
              Clear {label.toLowerCase()}
            </button>
          )}

          {visible.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">No matches</p>
          )}

          {visible.map((group) => (
            <div key={group.label} className="mb-1 last:mb-0">
              {groups.length > 1 && (
                <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const active = chosen.has(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={item.disabled}
                    onClick={() => toggle(item.key)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      item.disabled
                        ? 'cursor-not-allowed text-muted-foreground opacity-60'
                        : 'hover:bg-muted',
                      active && 'font-medium text-foreground',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        active ? 'border-brand-500 bg-brand-500 text-surface' : 'border-input',
                      )}
                    >
                      {active && <Check size={12} strokeWidth={3} />}
                    </span>
                    {item.color && (
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: item.color }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count != null && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {item.count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
