import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { BAND_CLASSES } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import { planForTarget, type FacilityPath, type TargetPlan } from '@/lib/scenarios';
import type { ScenarioComponentId } from '@/lib/types';
import { FixActions, FixPicker, PanelLabel, Segmented, TargetControl } from './controls';
import { useGains } from './planning';
import { stateId, type ScenarioSpec } from './scenarioState';

/**
 * The same scenario, run in each state on its own — "I have ₦20m: where does
 * it make the most facilities Ready?"
 *
 * The controls are the single scenario's. On the right, every state in view,
 * ranked, with what the scenario comes to there: Ready before, Unlocked,
 * Total Ready, spend, cost per facility and the share Ready after. Above the ranking, the answer
 * in a sentence, and the same scenario run across every state at once, for
 * the difference between concentrating money and spreading it. A state can be
 * sent to Compare as a scenario of its own.
 */

type SortKey = 'newly' | 'per' | 'share';

interface StateRow {
  state: string;
  total: number;
  plan: TargetPlan;
  per: number;
  shareAfter: number;
}

export function StatesView({
  paths,
  spec,
  onChange,
  onCompare,
  compareFull,
}: {
  paths: readonly FacilityPath[];
  spec: ScenarioSpec;
  onChange: (spec: ScenarioSpec) => void;
  /** Send a state's scenario to Compare. */
  onCompare: (spec: ScenarioSpec) => void;
  compareFull: boolean;
}) {
  const [sort, setSort] = useState<SortKey>('newly');
  const chosen = useMemo(() => new Set(spec.fixes), [spec.fixes]);

  const national = useMemo(
    () => planForTarget(paths, chosen, spec.target),
    [paths, chosen, spec.target],
  );
  const gains = useGains(paths, chosen, spec.target);

  const rows = useMemo<StateRow[]>(() => {
    const byState = new Map<string, FacilityPath[]>();
    for (const p of paths) {
      const list = byState.get(p.facility.state) ?? [];
      list.push(p);
      byState.set(p.facility.state, list);
    }
    return [...byState].map(([state, list]) => {
      const plan = planForTarget(list, chosen, spec.target);
      return {
        state,
        total: list.length,
        plan,
        per: plan.newlyReady ? plan.spendNGN / plan.newlyReady : 0,
        shareAfter: (plan.readyBefore + plan.newlyReady) / list.length,
      };
    });
  }, [paths, chosen, spec.target]);

  const sorted = useMemo(() => {
    const by: Record<SortKey, (a: StateRow, b: StateRow) => number> = {
      newly: (a, b) => b.plan.newlyReady - a.plan.newlyReady || a.per - b.per,
      // Cheapest per facility first; states the scenario makes no one Ready in last.
      per: (a, b) =>
        (a.per || Infinity) - (b.per || Infinity) || b.plan.newlyReady - a.plan.newlyReady,
      share: (a, b) => b.shareAfter - a.shareAfter || b.plan.newlyReady - a.plan.newlyReady,
    };
    return [...rows].sort((a, b) => by[sort](a, b) || a.state.localeCompare(b.state));
  }, [rows, sort]);

  const maxNewly = Math.max(1, ...rows.map((r) => r.plan.newlyReady));
  const byMoney = spec.target.kind === 'budget';
  const top = [...rows].sort((a, b) => b.plan.newlyReady - a.plan.newlyReady || a.per - b.per)[0];
  /** Under a count or a share, the question is where the target costs least. */
  const cheapest = [...rows]
    .filter((r) => r.plan.newlyReady > 0 && r.plan.shortfall === 0)
    .sort((a, b) => a.plan.spendNGN - b.plan.spendNGN)[0];
  const setFixes = (fixes: ScenarioComponentId[]) => onChange({ ...spec, fixes });

  const t = spec.target;
  const inEach =
    t.kind === 'budget'
      ? t.ngn === null
        ? 'With no budget limit'
        : `With ${formatNaira(t.ngn, true)} in one state`
      : t.kind === 'facilities'
        ? `To make ${formatCount(t.n)} more Ready in one state`
        : `To reach ${t.pct}% Ready in one state`;

  return (
    <div className="grid lg:h-full lg:grid-cols-[312px_minmax(0,1fr)]">
      {/* The controls. */}
      <div className="flex flex-col gap-3 border-b border-border bg-surface-sunk/40 p-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <section className="flex flex-1 flex-col">
          <PanelLabel aside={<FixActions chosen={chosen} onChange={setFixes} />}>
            Fixes to fund
          </PanelLabel>
          <FixPicker
            chosen={chosen}
            onChange={setFixes}
            gains={gains}
            bought={national.bought}
            limited={t.kind !== 'budget' || t.ngn !== null}
            className="mt-2 flex-1"
          />
        </section>
        <section>
          <PanelLabel
            aside={<span className="text-[10.5px] text-muted-foreground">figures: all states</span>}
          >
            Target, in each state
          </PanelLabel>
          <div className="mt-1.5">
            <TargetControl
              target={t}
              onChange={(target) => onChange({ ...spec, target })}
              plan={national}
              total={paths.length}
            />
          </div>
        </section>
      </div>

      {/* The ranking. */}
      <div className="flex min-w-0 flex-col lg:min-h-0">
        <div className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-2">
          <div className="min-w-0">
            {!chosen.size ? (
              <p className="text-body text-muted-foreground">Choose a fix to fund.</p>
            ) : byMoney && top && top.plan.newlyReady > 0 ? (
              <p className="text-body leading-snug text-foreground">
                {inEach}, <span className="font-semibold">{top.state}</span> unlocks the most:{' '}
                <span className="mono font-semibold text-ready-ink">
                  +{formatCount(top.plan.newlyReady)}
                </span>{' '}
                for {formatNaira(top.plan.spendNGN, true)}, {formatNaira(top.per, true)} each.
              </p>
            ) : !byMoney && cheapest ? (
              <p className="text-body leading-snug text-foreground">
                {inEach}, <span className="font-semibold">{cheapest.state}</span> costs least:{' '}
                <span className="mono font-semibold text-foreground">
                  {formatNaira(cheapest.plan.spendNGN, true)}
                </span>{' '}
                for +{formatCount(cheapest.plan.newlyReady)}, {formatNaira(cheapest.per, true)}{' '}
                each.
              </p>
            ) : (
              <p className="text-body text-muted-foreground">
                {inEach}, no state gets there with these fixes
                {top && top.plan.newlyReady > 0
                  ? ` — ${top.state} comes closest, +${formatCount(top.plan.newlyReady)}.`
                  : '.'}
              </p>
            )}
            <p className="mt-0.5 text-note text-muted-foreground">
              Spread across every state in view instead, the same target unlocks{' '}
              <span className="mono font-semibold text-foreground">
                +{formatCount(national.newlyReady)}
              </span>{' '}
              for {formatNaira(national.spendNGN, true)}.
            </p>
          </div>
          <Segmented
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { id: 'newly', label: 'Most unlocked' },
              { id: 'per', label: 'Best value' },
              { id: 'share', label: '% After' },
            ]}
          />
        </div>

        <div className="px-3.5 pb-2 pt-0.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {/* Full height on a wide screen, so the rows share the space the
              panel has rather than bunching at the top. */}
          <table className="w-full border-collapse text-note lg:h-full">
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="mono h-8 text-left text-tick uppercase tracking-[0.07em] text-muted-foreground">
                <th className="w-6 py-1 font-normal">#</th>
                <th className="py-1 font-normal">State</th>
                <th className="hidden w-[30%] py-1 font-normal sm:table-cell">Readiness</th>
                <th className="py-1 pr-3 text-right font-normal">Ready before</th>
                <th className="py-1 text-right font-normal">Unlocked</th>
                <th className="py-1 pl-3 text-right font-normal">Total Ready</th>
                <th className="py-1 text-right font-normal">Spend</th>
                <th className="py-1 text-right font-normal">Per facility</th>
                <th className="hidden py-1 text-right font-normal md:table-cell">% After</th>
                <th className="w-7" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.state} className="border-t border-border">
                  <td className="mono py-[2px] text-tick tabular-nums text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="py-[2px] pr-2 font-semibold text-foreground">{r.state}</td>
                  <td className="hidden py-[2px] pr-3 sm:table-cell">
                    <div className="flex h-5 min-w-[140px] gap-[2px] overflow-hidden rounded-[4px] bg-surface-sunk">
                      <span
                        className={cn('h-full', BAND_CLASSES.ready.bg)}
                        style={{
                          width: `${(r.plan.readyBefore / r.total) * 100}%`,
                        }}
                      />
                      <span
                        className="h-full bg-ready-ink transition-[width] duration-500 ease-out"
                        style={{
                          width: `${(r.plan.newlyReady / r.total) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td
                    className="mono py-[2px] pr-3 text-right tabular-nums text-foreground"
                    title={`${formatCount(r.plan.readyBefore)} of ${formatCount(r.total)} facilities Ready before any gap is closed`}
                  >
                    {formatCount(r.plan.readyBefore)}
                  </td>
                  <td className="py-[2px] text-right">
                    <span className="mono inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums text-ready-ink">
                      <span
                        aria-hidden
                        className="hidden h-1 rounded-full bg-ready-ink/40 lg:block"
                        style={{
                          width: `${(r.plan.newlyReady / maxNewly) * 36}px`,
                        }}
                      />
                      {r.plan.newlyReady ? `+${formatCount(r.plan.newlyReady)}` : '—'}
                    </span>
                  </td>
                  <td className="mono py-[2px] pl-3 text-right font-semibold tabular-nums text-foreground">
                    {formatCount(r.plan.readyBefore + r.plan.newlyReady)}
                  </td>
                  <td className="mono py-[2px] text-right tabular-nums text-foreground">
                    {formatNaira(r.plan.spendNGN, true)}
                  </td>
                  <td className="mono py-[2px] text-right tabular-nums text-foreground">
                    {r.per ? formatNaira(r.per, true) : '—'}
                  </td>
                  <td className="mono hidden py-[2px] text-right tabular-nums text-muted-foreground md:table-cell">
                    {formatShare(r.plan.readyBefore + r.plan.newlyReady, r.total)}
                  </td>
                  <td className="py-[2px] text-right">
                    <button
                      type="button"
                      disabled={compareFull}
                      onClick={() =>
                        onCompare({
                          ...spec,
                          name: `${r.state}`,
                          states: [stateId(r.state)],
                        })
                      }
                      title={compareFull ? 'Compare holds four scenarios' : `Compare ${r.state}`}
                      aria-label={`Add ${r.state} to Compare`}
                      className="-my-1 rounded-[4px] p-0.5 text-muted-foreground hover:bg-surface-sunk hover:text-foreground disabled:opacity-30"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
