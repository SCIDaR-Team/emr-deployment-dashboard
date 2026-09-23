import { useMemo } from 'react';
import { Maximize2, Plus, X } from 'lucide-react';
import { useTween } from '@/hooks/useTween';
import { BAND_CLASSES } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import type { FacilityPath } from '@/lib/scenarios';
import { FixPicker, StatePicker, TargetControl } from './controls';
import { planSpec, useStateItems, type SpecPlan } from './planning';
import { LETTERS, MAX_COMPARE, type ScenarioSpec } from './scenarioState';

/**
 * Up to four scenarios side by side.
 *
 * Each column is a scenario: its fixes, the states it is limited to, and its
 * target, then what it comes to. The result rows line up across the columns
 * and their bars share one scale per row, so the comparison is read straight
 * across — which makes the most facilities Ready, which spends least, which
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
    newly: Math.max(1, ...plans.map((p) => p.plan.newlyReady)),
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
        ? { ...last, name: `${last.name} (copy)`.slice(0, 40) }
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
      <div
        className="grid min-w-full gap-px bg-border lg:min-h-full"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(232px, 1fr))`,
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
            onChange={(s) => set(i, s)}
            onRemove={
              specs.length > 1 ? () => onChange(specs.filter((_, j) => j !== i)) : undefined
            }
            onOpen={() => onOpen(spec)}
          />
        ))}
        {specs.length < MAX_COMPARE && (
          <div className="flex items-center justify-center bg-surface p-3">
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
  onChange,
  onRemove,
  onOpen,
}: {
  letter: string;
  spec: ScenarioSpec;
  planned: SpecPlan;
  stateItems: { key: string; label: string; count: number }[];
  scale: { newly: number; spend: number; per: number };
  mostReady: boolean;
  bestValue: boolean;
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
    <div className="flex min-w-0 flex-col bg-surface">
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
      <div className="space-y-2 bg-surface-sunk/40 px-3 py-2">
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

      {/* What it comes to — rows that line up across the columns. */}
      <div className="flex flex-1 flex-col gap-2 border-t border-border px-3 py-2">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="mono text-tick uppercase tracking-[0.07em] text-muted-foreground">
              Ready after
            </p>
            {mostReady && <Badge>Most Ready</Badge>}
          </div>
          <p className="mono mt-0.5 text-figure-sm font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {formatCount(Math.round(shownAfter))}
            <span className="ml-1.5 text-note font-normal text-muted-foreground">
              of {formatCount(total)} · {formatShare(readyAfter, total)}
            </span>
          </p>
          <div className="mt-1.5 flex h-2 gap-[2px] overflow-hidden rounded-[3px] bg-surface-sunk">
            <span
              className={cn('h-full', BAND_CLASSES.ready.bg)}
              style={{
                width: `${total ? (plan.readyBefore / total) * 100 : 0}%`,
              }}
            />
            <span
              className="h-full bg-ready-ink transition-[width] duration-500 ease-out"
              style={{
                width: `${total ? (plan.newlyReady / total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        <Row
          label="Newly ready"
          value={`+${formatCount(plan.newlyReady)}`}
          share={plan.newlyReady / scale.newly}
          strong
        />
        <Row
          label="Spend"
          value={formatNaira(plan.spendNGN, true)}
          share={plan.spendNGN / scale.spend}
        />
        <Row
          label="Per facility"
          value={per ? formatNaira(per, true) : '—'}
          share={per / scale.per}
          badge={bestValue ? <Badge>Best value</Badge> : undefined}
        />
        {plan.shortfall > 0 && (
          <p className="text-[10.5px] leading-snug text-notready-ink">
            {formatCount(plan.shortfall)} short of the target — add fixes to reach more.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  share,
  strong,
  badge,
}: {
  label: string;
  value: string;
  share: number;
  strong?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono flex items-center gap-1.5 text-tick uppercase tracking-[0.07em] text-muted-foreground">
          {label}
          {badge}
        </span>
        <span
          className={cn(
            'mono text-body font-semibold tabular-nums',
            strong ? 'text-ready-ink' : 'text-foreground',
          )}
        >
          {value}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunk">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            strong ? 'bg-ready-ink' : 'bg-foreground/40',
          )}
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
