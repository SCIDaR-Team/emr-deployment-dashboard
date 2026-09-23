import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCount, formatNaira } from '@/lib/format';
import { needGroups, planComposition, planScenario, type FacilityPath } from '@/lib/scenarios';
import type { ScenarioComponentId } from '@/lib/types';
import {
  FixActions,
  FixPicker,
  PanelLabel,
  Segmented,
  TextButton,
  TargetControl,
} from './controls';
import { ALL_FIXES, planSpec, useGains } from './planning';
import { BeforeAfter, Figures, PlanContext, SpendingQueue, WhereTheyLand } from './results';
import { stateId, type ScenarioSpec } from './scenarioState';
import { SpendCurve } from './SpendCurve';

/**
 * One scenario, read in full.
 *
 * Three columns, each scrolling on its own so the whole view stays on a
 * laptop screen: the controls (the six fixes, the target); the result (the
 * figures, the spend curve — which takes whatever height is left — and the
 * before/after bar); and the plan written out (the spending queue, where the
 * newly Ready land, and where this money sits in the whole plan).
 */
export function SingleView({
  paths: allPaths,
  spec,
  onChange,
}: {
  paths: readonly FacilityPath[];
  spec: ScenarioSpec;
  onChange: (spec: ScenarioSpec) => void;
}) {
  const [tab, setTab] = useState<'queue' | 'states' | 'plan'>('queue');
  const { plan, chosen, paths } = useMemo(() => planSpec(allPaths, spec), [allPaths, spec]);
  const groups = useMemo(() => needGroups(paths), [paths]);
  const ghost = useMemo(() => planScenario(paths, ALL_FIXES, null), [paths]);
  const composition = useMemo(() => planComposition(paths.map((p) => p.facility)), [paths]);
  const gains = useGains(paths, chosen, spec.target);
  const total = paths.length;

  const setFixes = (fixes: ScenarioComponentId[]) => onChange({ ...spec, fixes });
  const curve = useSize<HTMLDivElement>();
  const curveH = curve.size.w ? Math.max(150, (curve.size.h * 420) / curve.size.w) : 200;

  return (
    <div className="grid lg:h-full lg:grid-cols-[312px_minmax(0,1fr)_minmax(0,300px)]">
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
            bought={plan.bought}
            limited={spec.target.kind !== 'budget' || spec.target.ngn !== null}
            className="mt-2 flex-1"
          />
        </section>

        <section>
          <PanelLabel
            aside={<span className="text-[10.5px] text-muted-foreground">cheapest first</span>}
          >
            Target
          </PanelLabel>
          <div className="mt-1.5">
            <TargetControl
              target={spec.target}
              onChange={(target) => onChange({ ...spec, target })}
              plan={plan}
              total={total}
            />
          </div>
        </section>

        {/* A scenario opened from Compare can be limited to some states; the
            page's own State filter is the usual way to narrow the view. */}
        {spec.states.length > 0 && (
          <p className="flex items-baseline justify-between gap-2 border-t border-border pt-2 text-note text-muted-foreground">
            <span className="min-w-0">
              Limited to{' '}
              <span className="font-semibold text-foreground">
                {stateNames(spec.states, paths).join(', ')}
              </span>
            </span>
            <TextButton onClick={() => onChange({ ...spec, states: [] })}>All states</TextButton>
          </p>
        )}
      </div>

      {/* The result. */}
      <div className="flex min-w-0 flex-col gap-3 border-b border-border p-3.5 lg:min-h-0 lg:border-b-0 lg:border-r">
        <Figures plan={plan} total={total} />
        {/* Measured, and the curve drawn to its shape; absolutely placed on a
            wide screen so the drawing never pushes back on the space it is
            measured from. */}
        <div ref={curve.ref} className="relative min-h-[170px] flex-1">
          <div className="lg:absolute lg:inset-0">
            <SpendCurve
              plan={plan}
              ghost={ghost}
              maxNGN={ghost.reachable.costNGN}
              handleNGN={plan.spendNGN}
              callout={`${formatNaira(plan.spendNGN, true)} → +${formatCount(plan.newlyReady)} Ready`}
              onBudget={(ngn) => onChange({ ...spec, target: { kind: 'budget', ngn } })}
              height={curveH}
            />
          </div>
        </div>
        <BeforeAfter plan={plan} total={total} />
      </div>

      {/* The plan written out. */}
      <div className="flex min-w-0 flex-col lg:min-h-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { id: 'queue', label: 'Queue' },
              { id: 'states', label: 'By state' },
              { id: 'plan', label: 'Whole plan' },
            ]}
          />
        </div>
        <div className="p-3.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {tab === 'queue' && (
            <>
              <p className="mb-2.5 text-note text-muted-foreground">
                Facilities not yet Ready, grouped by the fixes they need, in the order the money
                reaches them.
              </p>
              <SpendingQueue
                groups={groups}
                plan={plan}
                chosen={chosen}
                onAdd={(ids) => setFixes([...new Set([...spec.fixes, ...ids])])}
                onLift={() => onChange({ ...spec, target: { kind: 'budget', ngn: null } })}
              />
            </>
          )}
          {tab === 'states' && (
            <>
              <p className="mb-1.5 text-note text-muted-foreground">
                Where this plan&rsquo;s newly Ready facilities are. Light is Ready already.
              </p>
              <WhereTheyLand paths={paths} plan={plan} />
            </>
          )}
          {tab === 'plan' && (
            <>
              <PlanContext composition={composition} spendNGN={plan.spendNGN} />
              <p className="mt-3 text-[10.5px] leading-snug text-muted-foreground">
                With no budget limit these agree with the workbook&rsquo;s own packages, except the
                four whose scenario columns disagree with its readiness rule — see data query F.
                Costs are the fixes at the facilities they make Ready.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** An element's rendered size, kept current as the layout changes. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

function stateNames(ids: readonly string[], paths: readonly FacilityPath[]) {
  const want = new Set(ids);
  return [...new Set(paths.map((p) => p.facility.state))].filter((n) => want.has(stateId(n)));
}
