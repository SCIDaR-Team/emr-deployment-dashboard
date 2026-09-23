import { useCallback, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Plus } from 'lucide-react';
import { SectionCard } from '@/components/ui';
import { useTween } from '@/hooks/useTween';
import { BAND_CLASSES } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import {
  facilityPaths,
  needGroups,
  planComposition,
  planScenario,
  type FacilityPath,
  type NeedGroup,
  type ScenarioPlan,
} from '@/lib/scenarios';
import type { FacilitySummary, ScenarioComponentId } from '@/lib/types';
import { FIXES, FIX_BY_ID, groupLabel, type FixDef } from './fixes';
import { BudgetControl } from './SpendCurve';

/**
 * Build a scenario — choose the power and connectivity fixes to fund, set a
 * budget, and see which facilities it makes Ready.
 *
 * Two columns: the controls on the left (the six fixes, then the budget), the
 * result on the right. The result is read three ways, each more specific:
 *
 *   1. **The figures** — Ready after, newly Ready, spend, per facility — and a
 *      before/after readiness bar.
 *   2. **The spending queue** — the facilities not yet Ready, grouped by the
 *      fixes they need, in the order the money reaches them. Each group says
 *      how much of it the plan funds; a marker shows where the budget runs
 *      out; a group waiting on a fix that is not chosen offers to add it. It is
 *      the plan written out, so a reader can see *why* the figures are what
 *      they are.
 *   3. **By state** — where the newly Ready facilities are.
 *
 * And under the budget, where this money sits in the whole plan: the builder
 * funds only the fixes that decide readiness, about ₦4.7bn for every facility;
 * the rest of the ₦7.3bn plan — tablets, wiring, furniture, grid — does not
 * change anyone's band. Shown so the three totals a reader meets on the page
 * add up in front of them.
 *
 * Money only goes where it makes a facility Ready. Follows the State filter.
 */

const ALL = new Set<ScenarioComponentId>(FIXES.map((f) => f.id));

export function ScenarioBuilder({ facilities }: { facilities: FacilitySummary[] }) {
  const [chosen, setChosen] = useState<Set<ScenarioComponentId>>(() => new Set(['router']));
  const [budget, setBudget] = useState<number | null>(null);
  const [view, setView] = useState<'queue' | 'state'>('queue');

  const paths = useMemo(() => facilityPaths(facilities), [facilities]);
  const groups = useMemo(() => needGroups(paths), [paths]);
  const ghost = useMemo(() => planScenario(paths, ALL, null), [paths]);
  const composition = useMemo(() => planComposition(facilities), [facilities]);
  const maxNGN = ghost.reachable.costNGN;

  const plan = useMemo(() => planScenario(paths, chosen, budget), [paths, chosen, budget]);

  /** What adding each unchosen fix would make newly Ready, at this budget. */
  const gains = useMemo(() => {
    const out = {} as Record<ScenarioComponentId, number>;
    for (const f of FIXES) {
      if (chosen.has(f.id)) continue;
      const next = new Set(chosen);
      next.add(f.id);
      out[f.id] = planScenario(paths, next, budget).newlyReady - plan.newlyReady;
    }
    return out;
  }, [paths, chosen, budget, plan.newlyReady]);

  const toggle = useCallback((id: ScenarioComponentId) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addAll = useCallback((ids: readonly ScenarioComponentId[]) => {
    setChosen((prev) => new Set([...prev, ...ids]));
  }, []);

  const total = facilities.length;

  return (
    <SectionCard
      id="scenarios"
      title="Build a scenario"
      subtitle="Choose the power and connectivity fixes to fund, set a budget, and see which facilities it makes Ready"
      bodyClassName="p-0"
    >
      {!total ? (
        <p className="px-4 py-6 text-prose italic text-muted-foreground">No facilities in scope.</p>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* The controls. */}
          <div className="space-y-7 border-b border-border bg-surface-sunk/40 p-4 lg:border-b-0 lg:border-r">
            <section>
              <Step n={1} title="Choose the fixes" />
              {(['power', 'connectivity'] as const).map((group) => (
                <div key={group} className="mt-3">
                  <p className="eyebrow">{group === 'power' ? 'Power' : 'Connectivity'}</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {FIXES.filter((f) => f.group === group).map((fix) => (
                      <FixTile
                        key={fix.id}
                        fix={fix}
                        on={chosen.has(fix.id)}
                        gain={gains[fix.id]}
                        bought={plan.bought[fix.id]}
                        limited={budget !== null}
                        onToggle={() => toggle(fix.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="mt-2.5 flex items-center justify-end gap-3">
                <TextButton onClick={() => setChosen(new Set(ALL))} disabled={chosen.size === ALL.size}>
                  Select all
                </TextButton>
                <span aria-hidden className="h-3 w-px bg-border" />
                <TextButton onClick={() => setChosen(new Set())} disabled={chosen.size === 0}>
                  Clear
                </TextButton>
              </div>
            </section>

            <section>
              <Step n={2} title="Set a budget" />
              <p className="mt-1 text-body leading-snug text-muted-foreground">
                Type an amount, or drag along the curve. Money goes to the cheapest facilities to
                make Ready first.
              </p>
              <div className="mt-3">
                <BudgetControl
                  plan={plan}
                  ghost={ghost}
                  maxNGN={maxNGN}
                  budgetNGN={budget}
                  onBudget={setBudget}
                />
              </div>
            </section>

            <PlanContext composition={composition} spendNGN={plan.spendNGN} />
          </div>

          {/* The result. */}
          <div className="min-w-0 p-4">
            <Figures plan={plan} total={total} budget={budget} />
            <BeforeAfter plan={plan} total={total} />

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow">
                {view === 'queue' ? 'Where the money goes, in order' : 'Where the newly Ready are'}
              </p>
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { id: 'queue', label: 'Spending queue' },
                  { id: 'state', label: 'By state' },
                ]}
              />
            </div>
            <div className="mt-3">
              {view === 'queue' ? (
                <SpendingQueue
                  groups={groups}
                  plan={plan}
                  chosen={chosen}
                  budget={budget}
                  onAdd={addAll}
                  onLift={() => setBudget(null)}
                />
              ) : (
                <ByState paths={paths} plan={plan} />
              )}
            </div>
          </div>
        </div>
      )}

      <p className="border-t border-border px-3 py-2 text-note text-muted-foreground">
        With no budget limit these agree with the workbook&rsquo;s own packages, except the four
        whose scenario columns disagree with its readiness rule — see data query F. Costs are the
        fixes at the facilities they make Ready.
      </p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-lead font-semibold text-foreground">
      <span className="mono flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-note font-bold text-surface">
        {n}
      </span>
      {title}
    </h3>
  );
}

function TextButton({
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

/**
 * One fix, as a tile the reader switches on and off. Off, it states its price
 * and what adding it would do *now*; on, what the plan is buying with it.
 */
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
  bought: { facilities: number; costNGN: number };
  /** Whether a budget is set — which decides why a chosen fix buys nothing. */
  limited: boolean;
  onToggle: () => void;
}) {
  const Icon = fix.icon;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={fix.blurb}
      className={cn(
        'group relative flex min-w-0 flex-col rounded-[6px] border p-2.5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        on
          ? 'border-ready-ink bg-ready-wash shadow-[inset_0_0_0_1px_hsl(var(--ready-ink))]'
          : 'border-border bg-surface hover:-translate-y-px hover:border-foreground/30 hover:shadow-sm',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] transition-colors',
            on
              ? 'bg-ready-ink text-surface'
              : 'bg-surface-sunk text-muted-foreground group-hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </span>
        <span
          aria-hidden
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded-full border transition-colors',
            on ? 'border-ready-ink bg-ready-ink text-surface' : 'border-border text-transparent',
          )}
        >
          {on ? <Check className="h-3 w-3" strokeWidth={3} /> : <Plus className="h-3 w-3" />}
        </span>
      </span>

      <span className="mt-2 truncate text-prose font-semibold leading-tight text-foreground">
        {fix.label}
      </span>
      <span className="mono text-note text-muted-foreground">
        {formatNaira(fix.unitCostNGN, true)} each
      </span>

      <span className="mono mt-2 text-note font-semibold tabular-nums">
        {on ? (
          bought.facilities ? (
            <span className="text-ready-ink">
              {formatCount(bought.facilities)} Ready · {formatNaira(bought.costNGN, true)}
            </span>
          ) : (
            <span className="font-normal text-muted-foreground">
              {limited ? 'Budget doesn’t reach it yet' : 'Needs another fix too'}
            </span>
          )
        ) : gain ? (
          <span className="inline-flex items-center gap-0.5 text-ready-ink">
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />+{formatCount(gain)} if added
          </span>
        ) : (
          <span className="font-normal text-muted-foreground">No gain on its own yet</span>
        )}
      </span>
    </button>
  );
}

/**
 * The whole plan, and the part of it this builder spends.
 *
 * One bar, four parts: the readiness fixes (what the builder funds, with the
 * current spend drawn solid inside it), the other work needed before go-live,
 * the work during deployment, and after. The readiness fixes and the other
 * before-go-live work together are the page's "Before deployment" figure.
 */
function PlanContext({
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
      note: 'power and connectivity — what this builder funds',
      value: c.readinessFixesNGN,
      fill: 'bg-ready-ink/30',
      key: 'bg-ready-ink',
    },
    {
      id: 'before',
      label: 'Other work before go-live',
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
    <section className="rounded-[8px] border border-border bg-surface p-3.5">
      <p className="text-prose font-semibold text-foreground">
        In the {formatNaira(c.totalNGN, true)} plan
      </p>
      <p className="mt-0.5 text-body leading-snug text-muted-foreground">
        Only the readiness fixes move a facility&rsquo;s band. The rest is needed to deploy, but
        doesn&rsquo;t change who is Ready.
      </p>

      <div className="mt-3 flex h-3.5 gap-[2px] overflow-hidden rounded-[4px]">
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

      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <li key={p.id} className="flex items-baseline gap-2 text-body">
            <span
              aria-hidden
              className={cn('block h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-[2px]', p.key)}
            />
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{p.label}</span>{' '}
              <span className="text-muted-foreground">· {p.note}</span>
            </span>
            <span className="mono shrink-0 font-semibold tabular-nums text-foreground">
              {formatNaira(p.value, true)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mono mt-2.5 border-t border-border pt-2 text-note text-muted-foreground">
        Readiness fixes + other before go-live ={' '}
        <span className="text-foreground">
          {formatNaira(c.readinessFixesNGN + c.otherBeforeNGN, true)}
        </span>
        , the plan&rsquo;s before-deployment cost.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function Figures({
  plan,
  total,
  budget,
}: {
  plan: ScenarioPlan;
  total: number;
  budget: number | null;
}) {
  const readyAfter = plan.readyBefore + plan.newlyReady;
  const shownAfter = useTween(readyAfter);
  const shownNew = useTween(plan.newlyReady);
  const shownSpend = useTween(plan.spendNGN);
  const per = plan.newlyReady ? plan.spendNGN / plan.newlyReady : 0;
  const shownPer = useTween(per);

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-border bg-border sm:grid-cols-4">
      <Figure label="Ready after" accent>
        <span className="text-figure">{formatCount(Math.round(shownAfter))}</span>
        <span className="mt-1 block text-note text-muted-foreground">
          of {formatCount(total)} · {formatShare(readyAfter, total)}
        </span>
      </Figure>
      <Figure label="Newly ready">
        <span className="text-figure-sm text-ready-ink">+{formatCount(Math.round(shownNew))}</span>
        <span className="mt-1 block text-note text-muted-foreground">
          from {formatCount(plan.readyBefore)} before
        </span>
      </Figure>
      <Figure label="Spend">
        <span className="text-figure-sm">{formatNaira(shownSpend, true)}</span>
        <span className="mt-1 block text-note text-muted-foreground">
          {budget === null ? 'No budget limit' : `of ${formatNaira(budget, true)} budget`}
        </span>
      </Figure>
      <Figure label="Per facility">
        <span className="text-figure-sm">{plan.newlyReady ? formatNaira(shownPer, true) : '—'}</span>
        <span className="mt-1 block text-note text-muted-foreground">made Ready</span>
      </Figure>
    </div>
  );
}

function Figure({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0 px-3 py-3', accent ? 'bg-ready-wash' : 'bg-surface')}>
      <p className="mono text-tick uppercase tracking-[0.07em] text-muted-foreground">{label}</p>
      <p className="mono mt-1.5 font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {children}
      </p>
    </div>
  );
}

/**
 * Readiness before and after, as two bars on one scale. The newly Ready are
 * the deep green run that appears in the second, taken out of the amber and
 * red of the first.
 */
function BeforeAfter({ plan, total }: { plan: ScenarioPlan; total: number }) {
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
        { key: 'x', n: plan.newlyReady, cls: 'bg-ready-ink', name: 'Newly ready' },
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
    <div className="mt-4 space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="mono w-12 shrink-0 text-tick uppercase tracking-[0.07em] text-muted-foreground">
            {row.label}
          </span>
          <div className="flex h-5 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-[4px]">
            {row.segs.map((s) =>
              s.n ? (
                <span
                  key={s.key}
                  title={`${s.name}: ${formatCount(s.n)} (${formatShare(s.n, total)})`}
                  className={cn(
                    'mono flex h-full items-center justify-center overflow-hidden whitespace-nowrap text-tick font-semibold transition-[width] duration-500 ease-out',
                    s.cls,
                    s.key === 'x' ? 'text-surface' : 'text-onband',
                  )}
                  style={{ width: `${(s.n / total) * 100}%` }}
                >
                  {s.n / total > 0.08 ? formatCount(s.n) : ''}
                </span>
              ) : null,
            )}
          </div>
        </div>
      ))}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 pl-[60px] text-note text-muted-foreground">
        {[
          { cls: BAND_CLASSES.ready.bg, name: 'Ready before' },
          { cls: 'bg-ready-ink', name: 'Newly ready' },
          { cls: BAND_CLASSES.moderately_ready.bg, name: 'Moderately ready' },
          { cls: BAND_CLASSES.not_ready.bg, name: 'Not ready' },
        ].map((l) => (
          <li key={l.name} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('block h-2.5 w-2.5 rounded-[2px]', l.cls)} />
            {l.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-px rounded-[3px] border border-border bg-border">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            'mono px-2.5 py-1 text-tick uppercase tracking-[0.09em] transition-colors first:rounded-l-[2px] last:rounded-r-[2px]',
            o.id === value
              ? 'bg-foreground font-semibold text-surface'
              : 'bg-surface text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The plan written out: every group of facilities not yet Ready, in the order
 * money reaches them, with how much of each the plan funds.
 *
 * A dot on a rail marks each group — filled when all of it is funded, half
 * when the budget runs out inside it, hollow when not. Where the budget runs
 * out, the rail says so. A group waiting on a fix the reader has not chosen is
 * greyed and offers to add it.
 */
function SpendingQueue({
  groups,
  plan,
  chosen,
  budget,
  onAdd,
  onLift,
}: {
  groups: NeedGroup[];
  plan: ScenarioPlan;
  chosen: ReadonlySet<ScenarioComponentId>;
  budget: number | null;
  onAdd: (ids: ScenarioComponentId[]) => void;
  onLift: () => void;
}) {
  const fundedBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plan.funded) m.set(p.groupKey, (m.get(p.groupKey) ?? 0) + 1);
    return m;
  }, [plan.funded]);

  // Where the budget runs out: after the last group it reaches at all, when a
  // chosen group is left short.
  let cutAfter = -1;
  if (budget !== null && plan.overBudget.facilities > 0) {
    groups.forEach((g, i) => {
      if ((fundedBy.get(g.key) ?? 0) > 0) cutAfter = i;
    });
  }

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
            <div className="flex gap-3">
              {/* The rail. */}
              <div className="flex w-4 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    'mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors',
                    state === 'full' && 'border-ready-ink bg-ready-ink',
                    state === 'part' &&
                      'border-ready-ink bg-[linear-gradient(90deg,hsl(var(--ready-ink))_50%,transparent_50%)]',
                    state === 'none' && 'border-ready-ink/50 bg-surface',
                    state === 'blocked' && 'border-border bg-surface',
                  )}
                />
                {!last && <span className="w-px flex-1 bg-border" />}
              </div>

              <div className={cn('min-w-0 flex-1 pb-3.5', state === 'blocked' && 'opacity-70')}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 text-prose font-semibold text-foreground">
                    {g.needs.map((n) => {
                      const Icon = FIX_BY_ID[n].icon;
                      return (
                        <Icon
                          key={n}
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            chosen.has(n) ? 'text-ready-ink' : 'text-muted-foreground',
                          )}
                          aria-hidden
                        />
                      );
                    })}
                    <span className="truncate">{groupLabel(g.needs)}</span>
                  </span>
                  <span className="mono shrink-0 text-body font-semibold tabular-nums text-foreground">
                    {formatNaira(g.costNGN, true)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-note">
                  <span className="mono tabular-nums text-muted-foreground">
                    {formatCount(g.facilities)} {g.facilities === 1 ? 'facility' : 'facilities'} ·{' '}
                    {formatNaira(g.costEachNGN, true)} each
                  </span>
                  <span className="mono shrink-0 tabular-nums">
                    {state === 'full' && <span className="text-ready-ink">All funded</span>}
                    {state === 'part' && (
                      <span className="text-ready-ink">
                        {formatCount(funded)} of {formatCount(g.facilities)} funded
                      </span>
                    )}
                    {state === 'none' && <span className="text-muted-foreground">Not reached</span>}
                    {state === 'blocked' && (
                      <button
                        type="button"
                        onClick={() => onAdd(missing)}
                        className="font-semibold uppercase tracking-[0.06em] text-brand-600 hover:underline"
                      >
                        Add {groupLabel(missing)}
                      </button>
                    )}
                  </span>
                </div>
                {state !== 'blocked' && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunk">
                    <div
                      className="h-full rounded-full bg-ready-ink transition-[width] duration-500 ease-out"
                      style={{ width: `${(funded / g.facilities) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {i === cutAfter && (
              <div className="-mt-1 mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-7">
                <span className="mono text-tick font-semibold uppercase tracking-[0.07em] text-notready-ink">
                  Budget runs out here
                </span>
                <span className="mono text-tick text-muted-foreground">
                  {formatNaira(plan.overBudget.costNGN, true)} more reaches{' '}
                  {formatCount(plan.overBudget.facilities)} more
                </span>
                <button
                  type="button"
                  onClick={onLift}
                  className="mono text-tick font-semibold uppercase tracking-[0.07em] text-brand-600 hover:underline"
                >
                  Lift limit
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Where the newly Ready facilities are, state by state. */
function ByState({ paths, plan }: { paths: FacilityPath[]; plan: ScenarioPlan }) {
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
    return [...m.values()].sort(
      (a, b) =>
        b.added - a.added || (b.before + b.added) / b.total - (a.before + a.added) / a.total,
    );
  }, [paths, plan.fundedIds]);

  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.state} className="flex items-center gap-3 py-2">
          <span className="w-24 shrink-0 truncate text-prose text-foreground">{r.state}</span>
          <div className="flex h-2.5 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-[3px] bg-surface-sunk">
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
          <span className="mono w-14 shrink-0 text-right text-body font-semibold tabular-nums text-ready-ink">
            {r.added ? `+${formatCount(r.added)}` : '—'}
          </span>
          <span className="mono w-24 shrink-0 text-right text-note tabular-nums text-muted-foreground">
            {formatShare(r.before + r.added, r.total)} of {formatCount(r.total)}
          </span>
        </li>
      ))}
    </ul>
  );
}
