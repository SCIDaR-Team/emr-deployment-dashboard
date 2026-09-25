import { useMemo } from 'react';
import { Maximize2, Plus, X } from 'lucide-react';
import { useTween } from '@/hooks/useTween';
import { BAND_CLASSES } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import type { FacilityPath } from '@/lib/scenarios';
import { FixPicker, StatePicker, TargetControl } from './controls';
import { FIXES } from './fixes';
import { planSpec, useStateItems, type SpecPlan } from './planning';
import { Readiness } from './results';
import { LETTERS, MAX_COMPARE, type ScenarioSpec } from './scenarioState';

/**
 * Up to four scenarios side by side.
 *
 * Each column is a scenario: its fixes, the states it is limited to, and its
 * target, then what it comes to. The result rows line up across the columns
 * and their bars share one scale per row, so the comparison is read straight
 * across — which unlocks the most facilities, which spends least, which
 * gets the most for each naira. Scenarios are named by letter, A to D, rather
 * than by colour: the readiness and urgency colours are already spoken for on
 * this page.
 */
export function CompareView({
  paths,
  specs,
  onChange,
  onOpen,
}: {
  paths: readonly FacilityPath[];
  specs: ScenarioSpec[];
  onChange: (specs: ScenarioSpec[]) => void;
  /** Open one scenario in the single view, to read it in full. */
  onOpen: (spec: ScenarioSpec) => void;
}) {
  const plans = useMemo(() => specs.map((s) => planSpec(paths, s)), [paths, specs]);

  const stateItems = useStateItems(paths);

  const scale = {
    spend: Math.max(1, ...plans.map((p) => p.plan.spendNGN)),
    per: Math.max(1, ...plans.map((p) => perFacility(p))),
  };
  const most = plans.length > 1 ? Math.max(...plans.map((p) => p.plan.newlyReady)) : -1;
  const pers = plans.map(perFacility).filter((v) => v > 0);
  const best = plans.length > 1 && pers.length ? Math.min(...pers) : -1;

  const set = (i: number, spec: ScenarioSpec) =>
    onChange(specs.map((s, j) => (j === i ? spec : s)));
  const add = () => {
    const last = specs[specs.length - 1];
    onChange([
      ...specs,
      last
        ? { ...last, name: `Scenario ${LETTERS[specs.length]}` }
        : {
            name: 'Scenario',
            fixes: ['router'],
            target: { kind: 'budget', ngn: 20_000_000 },
            states: [],
          },
    ]);
  };

  const columns = specs.length + (specs.length < MAX_COMPARE ? 1 : 0);

  return (
    <div className="overflow-x-auto lg:h-full lg:overflow-y-auto">
      {/* Five shared rows — name, the scenario, readiness, spend, per
          facility — that every column is a subgrid of, so each row sits at
          the same height in every column whatever its content. Each row is as
          tall as its content; any height left over goes to the last, under
          its content, rather than opening bands between the results. */}
      <div
        className="grid min-w-full gap-x-px bg-border lg:h-full"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(232px, 1fr))`,
          gridTemplateRows: 'auto auto auto auto minmax(auto, 1fr)',
        }}
      >
        {specs.map((spec, i) => (
          <Column
            key={i}
            letter={LETTERS[i]!}
            spec={spec}
            planned={plans[i]!}
            stateItems={stateItems}
            scale={scale}
            mostReady={plans[i]!.plan.newlyReady === most && most > 0}
            bestValue={perFacility(plans[i]!) === best && best > 0}
            best={best}
            onChange={(s) => set(i, s)}
            onRemove={
              specs.length > 1 ? () => onChange(specs.filter((_, j) => j !== i)) : undefined
            }
            onOpen={() => onOpen(spec)}
          />
        ))}
        {specs.length < MAX_COMPARE && (
          <div className="row-span-5 flex items-center justify-center bg-surface p-3">
            <button
              type="button"
              onClick={add}
              className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus className="h-5 w-5" aria-hidden />
              <span className="mono text-tick font-semibold uppercase tracking-[0.08em]">
                Add scenario {LETTERS[specs.length]}
              </span>
              <span className="text-note">Starts as a copy of the last</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function perFacility({ plan }: SpecPlan) {
  return plan.newlyReady ? plan.spendNGN / plan.newlyReady : 0;
}

function Column({
  letter,
  spec,
  planned,
  stateItems,
  scale,
  mostReady,
  bestValue,
  best,
  onChange,
  onRemove,
  onOpen,
}: {
  letter: string;
  spec: ScenarioSpec;
  planned: SpecPlan;
  stateItems: { key: string; label: string; count: number }[];
  scale: { spend: number; per: number };
  mostReady: boolean;
  bestValue: boolean;
  /** The lowest cost per facility among the columns, or -1 with one column. */
  best: number;
  onChange: (spec: ScenarioSpec) => void;
  onRemove?: () => void;
  onOpen: () => void;
}) {
  const { plan, chosen, paths } = planned;
  const total = paths.length;
  const readyAfter = plan.readyBefore + plan.newlyReady;
  const per = perFacility(planned);
  const shownAfter = useTween(readyAfter);

  return (
    <div className="row-span-5 grid min-w-0 grid-rows-subgrid bg-surface">
      {/* Name. */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span
          aria-hidden
          className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-foreground text-body font-bold text-surface"
        >
          {letter}
        </span>
        <input
          value={spec.name}
          maxLength={40}
          onChange={(e) => onChange({ ...spec, name: e.target.value })}
          onBlur={(e) =>
            !e.target.value.trim() && onChange({ ...spec, name: `Scenario ${letter}` })
          }
          aria-label={`Scenario ${letter} name`}
          className="min-w-0 flex-1 rounded-[4px] bg-transparent px-1 py-0.5 text-body font-semibold text-foreground outline-none hover:bg-surface-sunk focus:bg-surface-sunk"
        />
        <button
          type="button"
          onClick={onOpen}
          title="Open in Single, to read it in full"
          aria-label={`Open scenario ${letter} in Single`}
          className="rounded-[4px] p-1 text-muted-foreground hover:bg-surface-sunk hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove scenario ${letter}`}
            className="rounded-[4px] p-1 text-muted-foreground hover:bg-surface-sunk hover:text-notready-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* The scenario. */}
      <div className="space-y-1.5 bg-surface-sunk/40 px-3 py-1.5 tall:space-y-2 tall:py-2">
        <FixPicker compact chosen={chosen} onChange={(fixes) => onChange({ ...spec, fixes })} />
        <StatePicker
          items={stateItems}
          selected={spec.states}
          onChange={(states) => onChange({ ...spec, states })}
        />
        <TargetControl
          compact
          target={spec.target}
          onChange={(target) => onChange({ ...spec, target })}
          plan={plan}
          total={total}
        />
      </div>

      {/* What it comes to: readiness, then what it spends and on what, then
          what each facility costs. A target the fixes cannot reach says so in
          the target control. */}
      <div className="flex flex-col border-t border-border px-3 py-2.5">
        <Readiness
          before={plan.readyBefore}
          unlocked={plan.newlyReady}
          total={Math.round(shownAfter)}
          of={total}
        />
        <div className="mt-1 flex h-4 items-center justify-between gap-2">
          <p className="truncate text-[10.5px] text-muted-foreground">
            Total Ready is {formatShare(readyAfter, total)} of {formatCount(total)}
          </p>
          {mostReady && <Badge>Most unlocked</Badge>}
        </div>
        <ReadyBar before={plan.readyBefore} added={plan.newlyReady} total={total} />
      </div>
      <div className="border-t border-border px-3 py-2.5">
        <Row
          label="Spend"
          value={formatNaira(plan.spendNGN, true)}
          share={plan.spendNGN / scale.spend}
        />
        <SpendBreakdown plan={plan} />
        {plan.overBudget.facilities > 0 && (
          <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground 2xl:text-note">
            Beyond this target, these fixes could make{' '}
            {formatCount(plan.overBudget.facilities)} more Ready for{' '}
            {formatNaira(plan.overBudget.costNGN, true)} more.
          </p>
        )}
      </div>
      <div className="border-t border-border px-3 py-2.5">
        <Row
          label="Per facility"
          value={per ? formatNaira(per, true) : '—'}
          share={per / scale.per}
          badge={bestValue ? <Badge>Best value</Badge> : undefined}
        />
        {per > 0 && best > 0 && (
          <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground 2xl:text-note">
            {bestValue
              ? 'The lowest cost per facility made Ready here.'
              : `${timesOf(per, best)} the best value here (${formatNaira(best, true)}).`}
          </p>
        )}
      </div>
    </div>
  );
}

/** "1.9×" or "17×": how many times the best cost per facility this is. */
function timesOf(value: number, best: number): string {
  const x = value / best;
  return `${x < 10 ? x.toFixed(1) : Math.round(x)}×`;
}

/**
 * What the spend buys, per fix: the facilities each goes to and its cost, with
 * a bar for its share of this column's spend. The costs add up to the spend; a
 * facility needing two fixes counts under both. This is why two columns that
 * unlock similar numbers can spend very different amounts.
 */
function SpendBreakdown({ plan }: { plan: SpecPlan['plan'] }) {
  const rows = FIXES.filter((f) => plan.bought[f.id].facilities);
  if (!rows.length) return null;
  return (
    <ul className="mt-2.5 space-y-1.5">
      {rows.map((f) => {
        const b = plan.bought[f.id];
        const Icon = f.icon;
        return (
          <li key={f.id}>
            <div className="flex items-baseline gap-1.5 text-note">
              <Icon className="h-3 w-3 shrink-0 self-center text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-foreground">{f.short}</span>
              <span className="mono shrink-0 tabular-nums text-muted-foreground">
                {formatCount(b.facilities)} ×
              </span>
              <span className="mono w-[58px] shrink-0 text-right font-semibold tabular-nums text-foreground">
                {formatNaira(b.costNGN, true)}
              </span>
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-sunk">
              <div
                className="h-full rounded-full bg-foreground/30 transition-[width] duration-500 ease-out"
                style={{ width: `${plan.spendNGN ? (b.costNGN / plan.spendNGN) * 100 : 0}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Ready before and Unlocked, of every facility in the scenario's scope,
 *  thick enough to carry the counts. */
function ReadyBar({ before, added, total }: { before: number; added: number; total: number }) {
  const segs = [
    {
      key: 'before',
      n: before,
      cls: cn(BAND_CLASSES.ready.bg, 'text-onband'),
      name: 'Ready before',
    },
    { key: 'added', n: added, cls: 'bg-ready-ink text-surface', name: 'Unlocked' },
  ];
  return (
    <div className="mt-1.5 flex h-5 gap-[2px] overflow-hidden rounded-[4px] bg-surface-sunk tall:mt-2 tall:h-7">
      {segs.map((s) =>
        s.n && total ? (
          <span
            key={s.key}
            title={`${s.name}: ${formatCount(s.n)}`}
            className={cn(
              'mono flex h-full items-center justify-center overflow-hidden whitespace-nowrap text-note font-semibold transition-[width] duration-500 ease-out',
              s.cls,
            )}
            style={{ width: `${(s.n / total) * 100}%` }}
          >
            {s.n / total > 0.12 ? `${s.key === 'added' ? '+' : ''}${formatCount(s.n)}` : ''}
          </span>
        ) : null,
      )}
    </div>
  );
}

function Row({
  label,
  value,
  share,
  badge,
}: {
  label: string;
  value: string;
  share: number;
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono flex items-center gap-1.5 text-tick uppercase tracking-[0.07em] text-muted-foreground">
          {label}
          {badge}
        </span>
        {/* The same size as the readiness figures above, so the three
            results read as one set. */}
        <span className="mono text-lead font-semibold leading-none tracking-tight tabular-nums text-foreground tall:text-[19px]">
          {value}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunk tall:mt-2 tall:h-3">
        <div
          className={
            'h-full rounded-full bg-foreground/40 transition-[width] duration-500 ease-out'
          }
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono rounded-full bg-ready-wash px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.07em] text-ready-ink">
      {children}
    </span>
  );
}
