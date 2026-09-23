import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, PencilLine } from 'lucide-react';
import { useDismissable } from '@/hooks/useDismissable';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, parseNaira } from '@/lib/format';
import type { ScenarioTarget, TargetPlan } from '@/lib/scenarios';
import { convertTarget, targetLabel } from './scenarioState';
import type { ScenarioComponentId } from '@/lib/types';
import { FIXES, type FixDef } from './fixes';

/**
 * The builder's controls, shared by its three views: the six fixes, and the
 * target a scenario is steered by — a budget, a number of facilities, or a
 * share Ready. Each comes in a full size for the side panel and a compact one
 * for a comparison column.
 */

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; icon?: React.ReactNode }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex items-center gap-px rounded-[4px] border border-border bg-border">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            'mono inline-flex items-center gap-1.5 uppercase transition-colors first:rounded-l-[3px] last:rounded-r-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            size === 'sm'
              ? 'px-2 py-0.5 text-[9.5px] tracking-[0.07em]'
              : 'px-2.5 py-1 text-tick tracking-[0.09em]',
            o.id === value
              ? 'bg-foreground font-semibold text-surface'
              : 'bg-surface text-muted-foreground hover:text-foreground',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'mono rounded-full border px-1.5 py-0.5 text-tick uppercase tracking-[0.03em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active
          ? 'border-foreground bg-foreground font-semibold text-surface'
          : 'border-border bg-surface text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function TextButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mono text-tick uppercase tracking-[0.08em] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function PanelLabel({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="mono text-tick font-bold uppercase tracking-[0.1em] text-foreground">
        {children}
      </p>
      {aside}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fixes
// ---------------------------------------------------------------------------

/** Select all · Clear, beside the fixes' label. */
export function FixActions({
  chosen,
  onChange,
}: {
  chosen: ReadonlySet<ScenarioComponentId>;
  onChange: (next: ScenarioComponentId[]) => void;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <TextButton
        onClick={() => onChange(FIXES.map((f) => f.id))}
        disabled={chosen.size === FIXES.length}
      >
        All
      </TextButton>
      <span aria-hidden className="h-3 w-px bg-border" />
      <TextButton onClick={() => onChange([])} disabled={chosen.size === 0}>
        Clear
      </TextButton>
    </span>
  );
}

/**
 * The six fixes as switches. Full size: a tile each, with the unit price and a
 * live hint — how many more facilities adding it would make Ready now, or what
 * it is buying. Compact: an icon each, for a comparison column.
 */
export function FixPicker({
  chosen,
  onChange,
  gains,
  bought,
  limited,
  compact,
  className,
}: {
  chosen: ReadonlySet<ScenarioComponentId>;
  onChange: (next: ScenarioComponentId[]) => void;
  gains?: Partial<Record<ScenarioComponentId, number>>;
  bought?: Record<ScenarioComponentId, { facilities: number; costNGN: number }>;
  limited?: boolean;
  compact?: boolean;
  /** For the full size: given a height (a flex-1 in a column), the three
   *  rows of tiles share it, so the tiles grow to fill the panel. */
  className?: string;
}) {
  const toggle = (id: ScenarioComponentId) =>
    onChange(chosen.has(id) ? [...chosen].filter((c) => c !== id) : [...chosen, id]);

  if (compact) {
    return (
      <div className="grid grid-cols-6 gap-1">
        {FIXES.map((fix) => {
          const on = chosen.has(fix.id);
          const Icon = fix.icon;
          return (
            <button
              key={fix.id}
              type="button"
              aria-pressed={on}
              aria-label={fix.label}
              title={`${fix.label} · ${formatNaira(fix.unitCostNGN, true)} each`}
              onClick={() => toggle(fix.id)}
              className={cn(
                'flex h-8 items-center justify-center rounded-[5px] border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                on
                  ? 'border-ready-ink bg-ready-ink text-surface'
                  : 'border-border bg-surface text-muted-foreground hover:border-foreground/40 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn('grid grid-cols-2 grid-rows-[repeat(3,minmax(auto,1fr))] gap-1.5', className)}
    >
      {FIXES.map((fix) => (
        <FixTile
          key={fix.id}
          fix={fix}
          on={chosen.has(fix.id)}
          gain={gains?.[fix.id]}
          bought={bought?.[fix.id]}
          limited={Boolean(limited)}
          onToggle={() => toggle(fix.id)}
        />
      ))}
    </div>
  );
}

function FixTile({
  fix,
  on,
  gain,
  bought,
  limited,
  onToggle,
}: {
  fix: FixDef;
  on: boolean;
  gain: number | undefined;
  bought: { facilities: number; costNGN: number } | undefined;
  limited: boolean;
  onToggle: () => void;
}) {
  const Icon = fix.icon;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={`${fix.label} — ${fix.blurb}`}
      className={cn(
        'group flex min-w-0 flex-col justify-between gap-1 rounded-[7px] border px-2.5 py-1.5 text-left transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        on
          ? 'border-ready-ink bg-ready-wash shadow-[inset_0_0_0_1px_hsl(var(--ready-ink))]'
          : 'border-border bg-surface hover:border-foreground/30',
      )}
    >
      <span className="flex items-start gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] transition-colors',
            on
              ? 'bg-ready-ink text-surface'
              : 'bg-surface-sunk text-muted-foreground group-hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 self-center truncate text-body font-semibold text-foreground">
          {fix.short}
        </span>
      </span>
      <span className="mono flex items-baseline justify-between gap-1 text-note tabular-nums">
        <span className="text-muted-foreground">{formatNaira(fix.unitCostNGN, true)}</span>
        {on ? (
          bought?.facilities ? (
            <span className="flex min-w-0 items-center gap-0.5 font-semibold text-ready-ink">
              <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />
              <span className="truncate">{formatCount(bought.facilities)} Ready</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">
              {limited ? 'not reached' : 'needs more'}
            </span>
          )
        ) : gain ? (
          <span className="truncate font-semibold text-ready-ink">+{formatCount(gain)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * The states a scenario is limited to, as one slim row — "All in view" or the
 * names — opening a checklist. Slimmer than the filter row's dropdown, so a
 * comparison column keeps its height for the result.
 */
export function StatePicker({
  items,
  selected,
  onChange,
}: {
  items: { key: string; label: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  const chosen = new Set(selected);
  const names = items.filter((i) => chosen.has(i.key)).map((i) => i.label);
  const summary = !names.length
    ? 'All states in view'
    : names.length <= 2
      ? names.join(', ')
      : `${names.length} states`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`States: ${summary}`}
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-[5px] border bg-surface px-2 text-left text-note transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
          names.length
            ? 'border-foreground/40 font-semibold text-foreground'
            : 'border-border text-muted-foreground hover:border-foreground/40',
        )}
      >
        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div
          id={id}
          role="listbox"
          aria-multiselectable
          className="absolute left-0 right-0 top-8 z-40 max-h-64 overflow-y-auto rounded-[6px] border border-border bg-surface p-1 shadow-pop animate-pop-in"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={!selected.length}
            className="w-full rounded-[4px] px-2 py-1 text-left text-note font-semibold text-brand-600 hover:bg-muted disabled:text-muted-foreground disabled:hover:bg-transparent"
          >
            All states in view
          </button>
          {items.map((item) => {
            const on = chosen.has(item.key);
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() =>
                  onChange(on ? selected.filter((k) => k !== item.key) : [...selected, item.key])
                }
                className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1 text-left text-note text-foreground hover:bg-muted"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border',
                    on ? 'border-foreground bg-foreground text-surface' : 'border-input',
                  )}
                >
                  {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="mono text-[10.5px] tabular-nums text-muted-foreground">
                  {formatCount(item.count)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

const KIND_OPTIONS: { id: ScenarioTarget['kind']; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'facilities', label: 'Facilities' },
  { id: 'share', label: 'Share' },
];

function parseTarget(kind: ScenarioTarget['kind'], text: string): ScenarioTarget | undefined {
  if (kind === 'budget') {
    const v = parseNaira(text);
    return v === undefined ? undefined : { kind, ngn: v };
  }
  const n = Number(text.replace(/[,%\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return kind === 'facilities'
    ? { kind, n: Math.round(n) }
    : { kind, pct: Math.min(100, Math.round(n)) };
}

const QUICK: Record<ScenarioTarget['kind'], ScenarioTarget[]> = {
  budget: [
    { kind: 'budget', ngn: 20_000_000 },
    { kind: 'budget', ngn: 100_000_000 },
    { kind: 'budget', ngn: 500_000_000 },
    { kind: 'budget', ngn: 1_000_000_000 },
    { kind: 'budget', ngn: null },
  ],
  facilities: [500, 1000, 1500, 2000].map((n) => ({ kind: 'facilities', n }) as const),
  share: [25, 50, 75, 90].map((pct) => ({ kind: 'share', pct }) as const),
};

const same = (a: ScenarioTarget, b: ScenarioTarget) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What the scenario is steered by, and what that comes to.
 *
 * The target is set in figure type and is itself the input — type "250m",
 * "1500" or "75" — with the kind switched above it. Beside it, the other side
 * of the bargain: a budget shows the facilities it buys; a count or a share
 * shows what it costs. Under it, a meter and the quick amounts.
 */
export function TargetControl({
  target,
  onChange,
  plan,
  total,
  compact,
}: {
  target: ScenarioTarget;
  onChange: (t: ScenarioTarget) => void;
  plan: TargetPlan;
  /** Facilities in the scenario's scope — the denominator of a share. */
  total: number;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setInvalid(false), [target]);

  const shown = targetLabel(target);
  const commit = () => {
    if (draft === null) return;
    const next = parseTarget(target.kind, draft);
    if (!next) {
      setInvalid(true);
      return;
    }
    onChange(next);
    setDraft(null);
  };

  const readyAfter = plan.readyBefore + plan.newlyReady;
  const budgetMeter =
    target.kind === 'budget'
      ? target.ngn
        ? plan.spendNGN / target.ngn
        : plan.reachable.costNGN
          ? plan.spendNGN / plan.reachable.costNGN
          : 0
      : total
        ? readyAfter / total
        : 0;

  const other =
    target.kind === 'budget' ? (
      <>
        <span className="text-ready-ink">+{formatCount(plan.newlyReady)}</span>
        <span className="block text-note font-normal text-muted-foreground">made Ready</span>
      </>
    ) : (
      <>
        <span>{formatNaira(plan.spendNGN, true)}</span>
        <span className="block text-note font-normal text-muted-foreground">
          +{formatCount(plan.newlyReady)} made Ready
        </span>
      </>
    );

  const note =
    plan.shortfall > 0 ? (
      <span className="text-notready-ink">
        {formatCount(plan.shortfall)} short — the chosen fixes reach{' '}
        {formatCount(plan.reachable.facilities)}
      </span>
    ) : target.kind === 'budget' ? (
      target.ngn === null ? (
        <>Chosen fixes top out at {formatNaira(plan.reachable.costNGN, true)}</>
      ) : (
        <>
          Spent {formatNaira(plan.spendNGN, true)} ·{' '}
          {formatNaira(Math.max(0, target.ngn - plan.spendNGN), true)} left
        </>
      )
    ) : (
      <>
        {formatCount(readyAfter)} of {formatCount(total)} Ready after
      </>
    );

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Segmented
          size="sm"
          value={target.kind}
          onChange={(k) => k !== target.kind && onChange(convertTarget(k, plan, total))}
          options={KIND_OPTIONS}
        />
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <label className="group flex min-w-0 flex-1 items-center gap-1">
          <input
            value={draft ?? shown}
            onFocus={(e) => {
              setDraft(
                target.kind === 'budget'
                  ? target.ngn === null
                    ? ''
                    : formatNaira(target.ngn, true)
                  : String(target.kind === 'facilities' ? target.n : target.pct),
              );
              requestAnimationFrame(() => e.target.select());
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDraft(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label={
              target.kind === 'budget'
                ? 'Budget in naira — type 250m or 1.2bn, or leave empty for no limit'
                : target.kind === 'facilities'
                  ? 'Facilities to make Ready'
                  : 'Share of facilities Ready, in per cent'
            }
            aria-invalid={invalid}
            placeholder={target.kind === 'budget' ? 'No limit' : ''}
            className={cn(
              'mono w-full min-w-0 rounded-[4px] bg-transparent font-semibold leading-none tracking-tight text-foreground outline-none transition-colors hover:bg-surface-sunk/70 focus:bg-surface-sunk',
              compact ? 'py-0.5 text-lead' : 'py-0.5 text-[26px]',
              invalid && 'text-notready-ink',
            )}
          />
          {!compact && (
            <PencilLine
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
        </label>
        <p
          className={cn(
            'mono shrink-0 text-right font-semibold leading-tight tabular-nums text-foreground',
            compact ? 'text-body' : 'text-lead',
          )}
        >
          {other}
        </p>
      </div>

      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
        <div
          className="h-full rounded-full bg-ready-ink transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, budgetMeter * 100)}%` }}
        />
      </div>
      <p className="mono mt-1 truncate text-[10.5px] tabular-nums text-muted-foreground">{note}</p>

      {!compact && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {QUICK[target.kind].map((q) => (
            <Chip key={targetLabel(q)} active={same(q, target)} onClick={() => onChange(q)}>
              {targetLabel(q).replace(/\.0(?=[a-z])/, '')}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
