import { useMemo } from 'react';
import { useTween } from '@/hooks/useTween';
import { BAND_CLASSES } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import type {
  FacilityPath,
  NeedGroup,
  ScenarioPlan,
  TargetPlan,
  planComposition,
} from '@/lib/scenarios';
import type { ScenarioComponentId } from '@/lib/types';
import { FIX_BY_ID, groupLabel } from './fixes';

/**
 * The pieces a scenario's result is read from, shared by the builder's views.
 */

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

export function Figures({ plan, total }: { plan: TargetPlan; total: number }) {
  const readyAfter = plan.readyBefore + plan.newlyReady;
  const shownAfter = useTween(readyAfter);
  const shownNew = useTween(plan.newlyReady);
  const shownSpend = useTween(plan.spendNGN);
  const per = plan.newlyReady ? plan.spendNGN / plan.newlyReady : 0;
  const shownPer = useTween(per);

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-border bg-border sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="col-span-2 bg-ready-wash px-3 py-2.5 sm:col-span-1">
        <Readiness
          before={plan.readyBefore}
          unlocked={Math.round(shownNew)}
          total={Math.round(shownAfter)}
          of={total}
          size="lg"
        />
      </div>
      <Figure
        label="Spend"
        note={
          plan.target.kind === 'budget'
            ? plan.target.ngn === null
              ? 'No budget limit'
              : `of ${formatNaira(plan.target.ngn, true)}`
            : 'the cheapest way there'
        }
      >
        {formatNaira(shownSpend, true)}
      </Figure>
      <Figure label="Per facility" note="unlocked">
        {plan.newlyReady ? formatNaira(shownPer, true) : '—'}
      </Figure>
    </div>
  );
}

/**
 * Ready before + Unlocked = Total Ready, written out as the sum it is. The
 * three terms every view of the builder uses.
 */
export function Readiness({
  before,
  unlocked,
  total,
  of,
  size = 'md',
}: {
  before: number;
  unlocked: number;
  total: number;
  /** Facilities in scope, for Total Ready's share. */
  of: number;
  size?: 'md' | 'lg';
}) {
  const figure = size === 'lg' ? 'text-[20px] 2xl:text-figure-sm' : 'text-lead tall:text-[19px]';
  const op = (sign: string) => (
    <span
      aria-hidden
      className={cn(
        'mono self-end pb-[3px] text-muted-foreground',
        size === 'lg' ? 'text-lead' : 'text-body',
      )}
    >
      {sign}
    </span>
  );
  const term = (label: string, value: string, tone: string, note?: string) => (
    <div>
      <p className="mono whitespace-nowrap text-[9.5px] uppercase tracking-[0.04em] text-muted-foreground 2xl:text-tick 2xl:tracking-[0.07em]">
        {label}
      </p>
      <p
        className={cn(
          'mono mt-1 font-semibold leading-none tracking-tight tabular-nums',
          figure,
          tone,
        )}
      >
        {value}
      </p>
      {note !== undefined && (
        <p className="mt-1 whitespace-nowrap text-[10.5px] text-muted-foreground">{note}</p>
      )}
    </div>
  );
  const notes = size === 'lg';
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-x-1.5">
      {term('Ready before', formatCount(before), 'text-foreground', notes ? 'today' : undefined)}
      {op('+')}
      {term(
        'Unlocked',
        `+${formatCount(unlocked)}`,
        'text-ready-ink',
        notes ? 'by this plan' : undefined,
      )}
      {op('=')}
      {term(
        'Total Ready',
        formatCount(total),
        'text-foreground',
        notes ? `of ${formatCount(of)} · ${formatShare(total, of)}` : undefined,
      )}
    </div>
  );
}

function Figure({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-surface px-3 py-2.5">
      <p className="mono truncate text-tick uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </p>
      <p className="mono mt-1 text-[20px] font-semibold leading-none tracking-tight tabular-nums text-foreground 2xl:text-figure-sm">
        {children}
      </p>
      <p className="mt-1 truncate text-[10.5px] text-muted-foreground">{note}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before and after
// ---------------------------------------------------------------------------

/** Readiness before and after, as two bars on one scale. */
export function BeforeAfter({ plan, total }: { plan: ScenarioPlan; total: number }) {
  const fundedFrom = (band: 'moderately_ready' | 'not_ready') =>
    plan.funded.filter((p) => p.baseline === band).length;
  const rows = [
    {
      label: 'Before',
      segs: [
        { key: 'r', n: plan.readyBefore, cls: BAND_CLASSES.ready.bg, name: 'Ready' },
        {
          key: 'm',
          n: plan.after.moderately_ready + fundedFrom('moderately_ready'),
          cls: BAND_CLASSES.moderately_ready.bg,
          name: 'Moderately ready',
        },
        {
          key: 'n',
          n: plan.after.not_ready + fundedFrom('not_ready'),
          cls: BAND_CLASSES.not_ready.bg,
          name: 'Not ready',
        },
      ],
    },
    {
      label: 'After',
      segs: [
        { key: 'r', n: plan.readyBefore, cls: BAND_CLASSES.ready.bg, name: 'Ready before' },
        { key: 'x', n: plan.newlyReady, cls: 'bg-ready-ink', name: 'Unlocked' },
        {
          key: 'm',
          n: plan.after.moderately_ready,
          cls: BAND_CLASSES.moderately_ready.bg,
          name: 'Moderately ready',
        },
        { key: 'n', n: plan.after.not_ready, cls: BAND_CLASSES.not_ready.bg, name: 'Not ready' },
      ],
    },
  ];

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2.5">
          <span className="mono w-11 shrink-0 text-tick uppercase tracking-[0.07em] text-muted-foreground">
            {row.label}
          </span>
          <div className="flex h-8 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-[4px]">
            {row.segs.map((s) =>
              s.n ? (
                <span
                  key={s.key}
                  title={`${s.name}: ${formatCount(s.n)} (${formatShare(s.n, total)})`}
                  className={cn(
                    'mono flex h-full items-center justify-center overflow-hidden whitespace-nowrap text-note font-semibold transition-[width] duration-500 ease-out',
                    s.cls,
                    s.key === 'x' ? 'text-surface' : 'text-onband',
                  )}
                  style={{ width: `${(s.n / total) * 100}%` }}
                >
                  {s.n / total > 0.05 ? formatCount(s.n) : ''}
                </span>
              ) : null,
            )}
          </div>
        </div>
      ))}
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 pl-[54px] text-[10.5px] text-muted-foreground">
        {[
          { cls: BAND_CLASSES.ready.bg, name: 'Ready before' },
          { cls: 'bg-ready-ink', name: 'Unlocked' },
          { cls: BAND_CLASSES.moderately_ready.bg, name: 'Moderately' },
          { cls: BAND_CLASSES.not_ready.bg, name: 'Not ready' },
        ].map((l) => (
          <li key={l.name} className="flex items-center gap-1">
            <span aria-hidden className={cn('block h-2 w-2 rounded-[2px]', l.cls)} />
            {l.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spending queue
// ---------------------------------------------------------------------------

/**
 * The plan written out: every group of facilities not yet Ready, in the order
 * money reaches them, with how much of each the plan funds. A rail marks each
 * group funded, part-funded or not reached; where the plan stops, the rail
 * says why — the budget ran out, or the target was met. A group waiting on a
 * fix that is not chosen offers to add it.
 */
export function SpendingQueue({
  groups,
  plan,
  chosen,
  onAdd,
  onLift,
}: {
  groups: NeedGroup[];
  plan: TargetPlan;
  chosen: ReadonlySet<ScenarioComponentId>;
  onAdd: (ids: ScenarioComponentId[]) => void;
  onLift: () => void;
}) {
  const fundedBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plan.funded) m.set(p.groupKey, (m.get(p.groupKey) ?? 0) + 1);
    return m;
  }, [plan.funded]);

  let cutAfter = -1;
  if (plan.overBudget.facilities > 0) {
    groups.forEach((g, i) => {
      if ((fundedBy.get(g.key) ?? 0) > 0) cutAfter = i;
    });
  }
  const byBudget = plan.target.kind === 'budget';

  return (
    <ol>
      {groups.map((g, i) => {
        const missing = g.needs.filter((n) => !chosen.has(n));
        const funded = fundedBy.get(g.key) ?? 0;
        const state: 'full' | 'part' | 'none' | 'blocked' = missing.length
          ? 'blocked'
          : funded === g.facilities
            ? 'full'
            : funded > 0
              ? 'part'
              : 'none';
        const last = i === groups.length - 1;
        return (
          <li key={g.key}>
            <div className="flex gap-2.5">
              <div className="flex w-3.5 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    'mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 transition-colors',
                    state === 'full' && 'border-ready-ink bg-ready-ink',
                    state === 'part' &&
                      'border-ready-ink bg-[linear-gradient(90deg,hsl(var(--ready-ink))_50%,transparent_50%)]',
                    state === 'none' && 'border-ready-ink/50 bg-surface',
                    state === 'blocked' && 'border-border bg-surface',
                  )}
                />
                {!last && <span className="w-px flex-1 bg-border" />}
              </div>

              <div className={cn('min-w-0 flex-1 pb-2.5', state === 'blocked' && 'opacity-70')}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 text-body font-semibold text-foreground">
                    {g.needs.map((n) => {
                      const Icon = FIX_BY_ID[n].icon;
                      return (
                        <Icon
                          key={n}
                          className={cn(
                            'h-3 w-3 shrink-0',
                            chosen.has(n) ? 'text-ready-ink' : 'text-muted-foreground',
                          )}
                          aria-hidden
                        />
                      );
                    })}
                    <span className="truncate">{groupLabel(g.needs)}</span>
                  </span>
                  <span className="mono shrink-0 text-note font-semibold tabular-nums text-foreground">
                    {formatNaira(g.costNGN, true)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 text-[10.5px]">
                  <span className="mono tabular-nums text-muted-foreground">
                    {formatCount(g.facilities)} × {formatNaira(g.costEachNGN, true)}
                  </span>
                  <span className="mono shrink-0 tabular-nums">
                    {state === 'full' && <span className="text-ready-ink">All funded</span>}
                    {state === 'part' && (
                      <span className="text-ready-ink">
                        {formatCount(funded)} of {formatCount(g.facilities)}
                      </span>
                    )}
                    {state === 'none' && <span className="text-muted-foreground">Not reached</span>}
                    {state === 'blocked' && (
                      <button
                        type="button"
                        onClick={() => onAdd(missing)}
                        className="font-semibold uppercase tracking-[0.05em] text-brand-600 hover:underline"
                      >
                        Add {groupLabel(missing)}
                      </button>
                    )}
                  </span>
                </div>
                {state !== 'blocked' && (
                  <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-surface-sunk">
                    <div
                      className="h-full rounded-full bg-ready-ink transition-[width] duration-500 ease-out"
                      style={{ width: `${(funded / g.facilities) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {i === cutAfter && (
              <div className="-mt-0.5 mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6">
                <span
                  className={cn(
                    'mono text-[10px] font-semibold uppercase tracking-[0.07em]',
                    byBudget ? 'text-notready-ink' : 'text-ready-ink',
                  )}
                >
                  {byBudget ? 'Budget runs out here' : 'Target met here'}
                </span>
                <span className="mono text-[10px] text-muted-foreground">
                  {formatNaira(plan.overBudget.costNGN, true)} more reaches{' '}
                  {formatCount(plan.overBudget.facilities)} more
                </span>
                {byBudget && (
                  <button
                    type="button"
                    onClick={onLift}
                    className="mono text-[10px] font-semibold uppercase tracking-[0.07em] text-brand-600 hover:underline"
                  >
                    Lift limit
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Where the newly Ready land
// ---------------------------------------------------------------------------

/** Where one plan's newly Ready facilities are, state by state. */
export function WhereTheyLand({
  paths,
  plan,
}: {
  paths: readonly FacilityPath[];
  plan: ScenarioPlan;
}) {
  const rows = useMemo(() => {
    const m = new Map<string, { state: string; total: number; before: number; added: number }>();
    for (const p of paths) {
      const r = m.get(p.facility.state) ?? {
        state: p.facility.state,
        total: 0,
        before: 0,
        added: 0,
      };
      r.total += 1;
      if (p.baseline === 'ready') r.before += 1;
      if (plan.fundedIds.has(p.facility.uuid)) r.added += 1;
      m.set(p.facility.state, r);
    }
    return [...m.values()].sort((a, b) => b.added - a.added || a.state.localeCompare(b.state));
  }, [paths, plan.fundedIds]);

  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.state} className="flex items-center gap-2 py-1.5">
          <span className="w-20 shrink-0 truncate text-body text-foreground">{r.state}</span>
          <div className="flex h-2 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-[3px] bg-surface-sunk">
            {r.before > 0 && (
              <span
                className={cn('h-full', BAND_CLASSES.ready.bg)}
                style={{ width: `${(r.before / r.total) * 100}%` }}
              />
            )}
            {r.added > 0 && (
              <span
                className="h-full bg-ready-ink transition-[width] duration-500 ease-out"
                style={{ width: `${(r.added / r.total) * 100}%` }}
              />
            )}
          </div>
          <span className="mono w-12 shrink-0 text-right text-note font-semibold tabular-nums text-ready-ink">
            {r.added ? `+${formatCount(r.added)}` : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// The whole plan
// ---------------------------------------------------------------------------

/**
 * The whole plan, and the part of it the builder spends. The readiness fixes
 * — the only part that changes a facility's band — against the other work
 * before go-live, during deployment and after. The first two together are the
 * page's "Before deployment" figure.
 */
export function PlanContext({
  composition: c,
  spendNGN,
}: {
  composition: ReturnType<typeof planComposition>;
  spendNGN: number;
}) {
  const parts = [
    {
      id: 'fixes',
      label: 'Readiness fixes',
      note: 'power and connectivity — what the builder funds',
      value: c.readinessFixesNGN,
      fill: 'bg-ready-ink/30',
      key: 'bg-ready-ink',
    },
    {
      id: 'before',
      label: 'Other before go-live',
      note: 'tablets, backup-power repair',
      value: c.otherBeforeNGN,
      fill: 'bg-foreground/30',
      key: 'bg-foreground/30',
    },
    {
      id: 'during',
      label: 'During deployment',
      note: 'wiring, sockets, furniture',
      value: c.duringNGN,
      fill: 'bg-foreground/15',
      key: 'bg-foreground/15',
    },
    {
      id: 'after',
      label: 'After deployment',
      note: 'grid connections',
      value: c.afterNGN,
      fill: 'bg-foreground/[0.07]',
      key: 'bg-foreground/[0.07]',
    },
  ];
  const pct = (v: number) => (c.totalNGN ? (v / c.totalNGN) * 100 : 0);

  return (
    <div>
      <p className="text-body leading-snug text-muted-foreground">
        Only the readiness fixes change who is Ready. The rest of the{' '}
        <span className="font-semibold text-foreground">{formatNaira(c.totalNGN, true)}</span> plan
        is needed to deploy, but moves no one&rsquo;s band.
      </p>
      <div className="mt-2.5 flex h-3 gap-[2px] overflow-hidden rounded-[3px]">
        {parts.map((p) => (
          <span
            key={p.id}
            className={cn('relative h-full', p.fill)}
            style={{ width: `${pct(p.value)}%` }}
          >
            {p.id === 'fixes' && (
              <span
                className="absolute inset-y-0 left-0 bg-ready-ink transition-[width] duration-500 ease-out"
                style={{
                  width: `${c.readinessFixesNGN ? Math.min(100, (spendNGN / c.readinessFixesNGN) * 100) : 0}%`,
                }}
              />
            )}
          </span>
        ))}
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {parts.map((p) => (
          <li key={p.id} className="flex items-baseline gap-2 text-note">
            <span
              aria-hidden
              className={cn('block h-2 w-2 shrink-0 translate-y-[1px] rounded-[2px]', p.key)}
            />
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{p.label}</span>
              <span className="block text-[10.5px] text-muted-foreground">{p.note}</span>
            </span>
            <span className="mono shrink-0 font-semibold tabular-nums text-foreground">
              {formatNaira(p.value, true)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mono mt-2 border-t border-border pt-1.5 text-[10.5px] text-muted-foreground">
        Readiness fixes + other before go-live ={' '}
        <span className="text-foreground">
          {formatNaira(c.readinessFixesNGN + c.otherBeforeNGN, true)}
        </span>
        , the plan&rsquo;s before-deployment cost. You have spent{' '}
        <span className="text-foreground">{formatNaira(spendNGN, true)}</span>.
      </p>
    </div>
  );
}
