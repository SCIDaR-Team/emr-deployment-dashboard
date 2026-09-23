import { useCallback, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Plus } from 'lucide-react';
import { SectionCard } from '@/components/ui';
import { useTween } from '@/hooks/useTween';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import { facilityPaths, fieldOrder, planScenario, type ScenarioPlan } from '@/lib/scenarios';
import type { FacilitySummary, ScenarioComponentId } from '@/lib/types';
import { FacilityField } from './FacilityField';
import { FIXES, FIX_BY_ID, PRESETS, type FixDef } from './fixes';
import { Chip, SpendCurve } from './SpendCurve';

/**
 * Build a scenario — pick the power and connectivity fixes to fund, set a
 * budget, and watch the facilities it reaches turn Ready.
 *
 * Replaces the table of the workbook's fourteen fixed packages. Those were
 * fourteen answers to a question a reader wants to ask themselves, in any
 * combination and within a budget; the presets keep the workbook's headline
 * packages one tap away.
 *
 * Three moves, in the order a reader makes them:
 *
 *   1. **Choose the fixes.** Six tiles. An unchosen tile says how many more
 *      facilities it would make Ready *on top of what is chosen*; a chosen one
 *      says what it is buying. The hints re-run on every change, so the reader
 *      can build the best mix a tile at a time.
 *   2. **Set a budget** on the spending curve (see `SpendCurve`). Money goes to
 *      the cheapest facility to make Ready first, which — every facility
 *      counting the same — is the most facilities for the money.
 *   3. **Read the outcome**: the figures across the top, the field of every
 *      facility, and what is keeping the rest from Ready, each one a button
 *      that acts on it.
 *
 * Money only goes where it makes a facility Ready, so a facility a fix would
 * only partly help keeps its colour. Follows the State filter.
 */

const ALL = new Set<ScenarioComponentId>(FIXES.map((f) => f.id));

export function ScenarioBuilder({ facilities }: { facilities: FacilitySummary[] }) {
  const [chosen, setChosen] = useState<Set<ScenarioComponentId>>(() => new Set(['router']));
  const [budget, setBudget] = useState<number | null>(null);

  const paths = useMemo(() => facilityPaths(facilities), [facilities]);
  const order = useMemo(() => fieldOrder(paths), [paths]);
  const ghost = useMemo(() => planScenario(paths, ALL, null), [paths]);
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

  const presetActive = (fixes: ScenarioComponentId[]) =>
    fixes.length === chosen.size && fixes.every((f) => chosen.has(f));

  const total = facilities.length;

  return (
    <SectionCard
      id="scenarios"
      title="Build a scenario"
      subtitle="Fund a mix of power and connectivity fixes, set a budget, and watch facilities become Ready"
      bodyClassName="p-0"
    >
      {!total ? (
        <p className="px-4 py-6 text-prose italic text-muted-foreground">No facilities in scope.</p>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          {/* The controls. */}
          <div className="space-y-6 border-b border-border bg-surface-sunk/40 p-4 lg:border-b-0 lg:border-r">
            <section>
              <Step n={1} title="Choose the fixes" />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Chip
                    key={p.label}
                    active={presetActive(p.fixes)}
                    onClick={() => setChosen(new Set(p.fixes))}
                  >
                    {p.label}
                  </Chip>
                ))}
                <Chip active={chosen.size === 0} onClick={() => setChosen(new Set())}>
                  Clear
                </Chip>
              </div>

              {(['power', 'connectivity'] as const).map((group) => (
                <div key={group} className="mt-3.5">
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
            </section>

            <section>
              <Step n={2} title="Set a budget" />
              <p className="mt-1 text-body leading-snug text-muted-foreground">
                Drag along the curve. Money goes to the cheapest facilities to make Ready first.
              </p>
              <div className="mt-3">
                <SpendCurve
                  plan={plan}
                  ghost={ghost}
                  maxNGN={maxNGN}
                  budgetNGN={budget}
                  onBudget={setBudget}
                />
              </div>
            </section>
          </div>

          {/* The outcome. */}
          <div className="min-w-0 p-4">
            <Outcome plan={plan} total={total} budget={budget} />

            <div className="mt-5">
              <FacilityField order={order} funded={plan.fundedIds} />
            </div>

            <Blockers
              plan={plan}
              onAdd={(id) => toggle(id)}
              onLift={() => setBudget(null)}
            />
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

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-prose font-semibold text-foreground">
      <span className="mono flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-tick font-bold text-surface">
        {n}
      </span>
      {title}
    </h3>
  );
}

/**
 * One fix, as a tile the reader switches on and off.
 *
 * Off, it states its price and what adding it would do *now* — a number that
 * changes as the other tiles do, which is what makes the tiles a way of
 * building a mix rather than a row of checkboxes. On, it states what the plan
 * is buying with it.
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
            on ? 'bg-ready-ink text-surface' : 'bg-surface-sunk text-muted-foreground group-hover:text-foreground',
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

/** The four figures the plan comes to, gliding between values as it changes. */
function Outcome({
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
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-border bg-border sm:grid-cols-4">
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
 * Why the rest are not Ready, as things to do about it: add the fix they are
 * waiting on, or lift the budget. Each is a button that does it.
 */
function Blockers({
  plan,
  onAdd,
  onLift,
}: {
  plan: ScenarioPlan;
  onAdd: (id: ScenarioComponentId) => void;
  onLift: () => void;
}) {
  const waiting = FIXES.map((f) => ({ fix: f, n: plan.waitingOn[f.id] }))
    .filter((w) => w.n > 0)
    .sort((a, b) => b.n - a.n);
  const over = plan.overBudget;
  if (!waiting.length && !over.facilities) {
    return (
      <p className="mt-4 text-body text-muted-foreground">
        Every facility the chosen fixes can reach is Ready.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <p className="eyebrow">What keeps the rest from Ready</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {over.facilities > 0 && (
          <button
            type="button"
            onClick={onLift}
            className="group flex items-center gap-2 rounded-[6px] border border-border bg-surface px-2.5 py-1.5 text-left text-body transition-colors hover:border-foreground/30"
          >
            <span className="mono font-semibold tabular-nums text-foreground">
              {formatCount(over.facilities)}
            </span>
            <span className="text-muted-foreground">
              out of budget · {formatNaira(over.costNGN, true)} more
            </span>
            <span className="mono text-tick uppercase tracking-[0.07em] text-brand-600 group-hover:underline">
              Lift limit
            </span>
          </button>
        )}
        {waiting.map(({ fix, n }) => (
          <button
            key={fix.id}
            type="button"
            onClick={() => onAdd(fix.id)}
            className="group flex items-center gap-2 rounded-[6px] border border-border bg-surface px-2.5 py-1.5 text-left text-body transition-colors hover:border-ready-ink/60"
          >
            <fix.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="mono font-semibold tabular-nums text-foreground">{formatCount(n)}</span>
            <span className="text-muted-foreground">waiting on {FIX_BY_ID[fix.id].label}</span>
            <span className="mono text-tick uppercase tracking-[0.07em] text-ready-ink group-hover:underline">
              Add
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
