import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const pane = usePaneWidth();
  // Redrawn at its true size as the pane is dragged, not left stretched
  // until the size observer next reports.
  const { measure: measureCurve } = curve;
  useEffect(() => measureCurve(), [pane.width, measureCurve]);

  return (
    <div
      ref={pane.grid}
      className="grid lg:h-full lg:grid-cols-[312px_minmax(0,1fr)_var(--pane-w)]"
      style={{ '--pane-w': `${pane.width}px` } as React.CSSProperties}
    >
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
            gainCaption={
              spec.target.kind === 'budget' ? 'if added' : 'in reach if added'
            }
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
        {/* Takes the height the column has spare, so Before / After sits at
            the foot and the curve gets the room. Measured and drawn at its true
            size — one unit to a pixel — so a taller curve does not mean larger
            text. Placed absolutely on a wide screen so the drawing never
            pushes back on the space it is measured from. */}
        <div ref={curve.ref} className="relative min-h-[210px] flex-1">
          {curve.size.w > 0 && (
            <div className="lg:absolute lg:inset-0">
              <SpendCurve
                plan={plan}
                ghost={ghost}
                maxNGN={ghost.reachable.costNGN}
                handleNGN={plan.spendNGN}
                callout={`${formatNaira(plan.spendNGN, true)} → +${formatCount(plan.newlyReady)} unlocked`}
                onBudget={(ngn) => onChange({ ...spec, target: { kind: 'budget', ngn } })}
                width={curve.size.w}
                height={curve.size.h}
              />
            </div>
          )}
        </div>
        <BeforeAfter plan={plan} total={total} />
      </div>

      {/* The plan written out. Resizable: drag its left edge. */}
      <div className="relative flex min-w-0 flex-col lg:min-h-0">
        <PaneHandle pane={pane} />
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
                Where this plan&rsquo;s unlocked facilities are. Light is Ready before.
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
  /** Read the size now. Also run once on mount, so the chart does not wait on
   *  the observer's first report — which a browser may hold back in a tab
   *  that is not in front, leaving the chart undrawn. */
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next = { w: Math.round(r.width), h: Math.round(r.height) };
    setSize((s) => (s.w === next.w && s.h === next.h ? s : next));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  return { ref, size, measure };
}

function stateNames(ids: readonly string[], paths: readonly FacilityPath[]) {
  const want = new Set(ids);
  return [...new Set(paths.map((p) => p.facility.state))].filter((n) => want.has(stateId(n)));
}

// ---------------------------------------------------------------------------
// The right pane's width
// ---------------------------------------------------------------------------

const PANE = { initial: 300, min: 240, max: 560, chartMin: 360, controls: 312 };
const PANE_KEY = 'emr.scenarioPaneWidth';

/**
 * The Queue / By state / Whole plan pane's width, set by dragging its left
 * edge. Kept between 240 and 560px, and never so wide that the chart column
 * falls under 360px. Remembered in this browser — a convenience, so it is
 * read and written defensively and simply starts at the default without it.
 */
function usePaneWidth() {
  const grid = useRef<HTMLDivElement>(null);
  const [width, setWidthState] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(PANE_KEY));
      return saved >= PANE.min && saved <= PANE.max ? saved : PANE.initial;
    } catch {
      return PANE.initial;
    }
  });
  const clamp = (w: number) => {
    const room = grid.current ? grid.current.clientWidth - PANE.controls - PANE.chartMin : PANE.max;
    return Math.round(Math.max(PANE.min, Math.min(PANE.max, room, w)));
  };
  const setWidth = (w: number) => {
    const next = clamp(w);
    setWidthState(next);
    try {
      localStorage.setItem(PANE_KEY, String(next));
    } catch {
      // Storage unavailable: the width lasts for this visit only.
    }
  };
  return { grid, width, setWidth };
}

/** The drag handle on the pane's left edge; arrow keys resize, double-click resets. */
function PaneHandle({ pane }: { pane: ReturnType<typeof usePaneWidth> }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the queue pane"
      aria-valuenow={pane.width}
      aria-valuemin={PANE.min}
      aria-valuemax={PANE.max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault();
        start.current = { x: e.clientX, w: pane.width };
        try {
          // Keeps the drag when the pointer runs off the thin handle.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture refused: the drag still works while over the handle.
        }
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        // Dragging left widens the pane: it grows into the chart's column.
        pane.setWidth(start.current.w + (start.current.x - e.clientX));
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onDoubleClick={() => pane.setWidth(PANE.initial)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') pane.setWidth(pane.width + 16);
        else if (e.key === 'ArrowRight') pane.setWidth(pane.width - 16);
        else return;
        e.preventDefault();
      }}
      className="group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none select-none focus-visible:outline-none lg:block"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-ready-ink group-focus-visible:bg-ready-ink group-active:bg-ready-ink"
      />
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-surface shadow-sm transition-colors group-hover:border-ready-ink group-focus-visible:border-ready-ink"
      />
    </div>
  );
}
