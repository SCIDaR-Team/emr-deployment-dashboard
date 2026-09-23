import { useCallback, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira } from '@/lib/format';
import type { ScenarioPlan } from '@/lib/scenarios';

/**
 * The budget control, drawn as what a budget buys.
 *
 * A curve of facilities made Ready against money spent, for the fixes chosen,
 * with the budget as a point the reader drags along it. The shape is the
 * finding: it climbs almost vertically at the start — ₦45m of routers makes
 * over a thousand facilities Ready — and then flattens into the long, costly
 * tail of solar systems and satellite links. A reader sees diminishing returns
 * before reading a number.
 *
 * - **Square-root spend axis.** On a linear axis the router step would be a
 *   pixel wide at the left edge and impossible to set a budget inside; a root
 *   scale gives the cheap end room while keeping the order of magnitude
 *   legible. The slider moves on the same scale, so dragging either feels the
 *   same.
 * - **A ghost curve for every fix**, behind the chosen one, so the reader sees
 *   what the fixes they left out would add at each budget.
 * - **The right end is "No limit"**: every facility the chosen fixes can reach.
 *
 * The slider under the curve is the keyboard and screen-reader way to set the
 * same value; the chips are quick amounts.
 */

const W = 320;
const H = 128;
const PAD = { left: 4, right: 6, top: 10, bottom: 18 };
const STEPS = 1000;

export interface SpendCurveProps {
  plan: ScenarioPlan;
  /** The curve with every fix allowed — the ghost, and the vertical scale. */
  ghost: ScenarioPlan;
  /** The top of the spend axis: everything reachable with every fix. */
  maxNGN: number;
  budgetNGN: number | null;
  onBudget: (budget: number | null) => void;
}

const QUICK = [50_000_000, 250_000_000, 1_000_000_000];

export function SpendCurve({ plan, ghost, maxNGN, budgetNGN, onBudget }: SpendCurveProps) {
  const svg = useRef<SVGSVGElement>(null);
  const gradient = useId().replace(/:/g, '');
  const maxReady = Math.max(1, ghost.reachable.facilities);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (spend: number) =>
    PAD.left + (maxNGN > 0 ? Math.sqrt(Math.min(1, spend / maxNGN)) : 0) * innerW;
  const y = (ready: number) => PAD.top + innerH - (ready / maxReady) * innerH;

  /** A curve as a path: straight within a need group (every facility in it
   *  costs the same), so the joins are exact, and flat after its last point. */
  const pathOf = (curve: ScenarioPlan['curve']) => {
    const pts: [number, number][] = [];
    curve.forEach((p, i) => {
      if (i === 0) {
        pts.push([x(0), y(0)]);
        return;
      }
      // Sample along the segment so the root axis bends it as it should.
      const prev = curve[i - 1]!;
      const n = 12;
      for (let k = 1; k <= n; k += 1) {
        const t = k / n;
        pts.push([
          x(prev.spendNGN + (p.spendNGN - prev.spendNGN) * t),
          y(prev.ready + (p.ready - prev.ready) * t),
        ]);
      }
    });
    const last = curve[curve.length - 1]!;
    pts.push([x(maxNGN), y(last.ready)]);
    return pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(2)},${b.toFixed(2)}`).join(' ');
  };

  const line = pathOf(plan.curve);
  const ghostLine = pathOf(ghost.curve);
  const area = `${line} L${x(maxNGN).toFixed(2)},${y(0).toFixed(2)} L${x(0).toFixed(2)},${y(0).toFixed(2)} Z`;

  const atBudget = budgetNGN === null ? maxNGN : Math.min(budgetNGN, maxNGN);
  const handleX = x(atBudget);
  const handleY = y(plan.newlyReady);

  const fromPosition = useCallback(
    (p: number) => {
      const clamped = Math.min(1, Math.max(0, p));
      if (clamped >= 0.995) onBudget(null);
      else onBudget(Math.round((clamped * clamped * maxNGN) / 1e5) * 1e5);
    },
    [maxNGN, onBudget],
  );

  const drag = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    fromPosition((px - PAD.left) / innerW);
  };

  const slider = budgetNGN === null ? STEPS : Math.round(Math.sqrt(atBudget / maxNGN) * STEPS);
  // Round, short labels, and only where they cannot collide: on the root axis
  // ₦10m and ₦100m sit a few pixels apart.
  const ticks = [
    { at: 100_000_000, label: '₦100m' },
    { at: 1_000_000_000, label: '₦1bn' },
  ].filter((t) => t.at < maxNGN * 0.7);
  const clip = `${gradient}-clip`;

  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) drag(e);
        }}
        aria-hidden
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="[stop-color:hsl(var(--ready-ink))]" stopOpacity={0.28} />
            <stop offset="100%" className="[stop-color:hsl(var(--ready-ink))]" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Baseline and budget ticks. */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(0)}
          y2={y(0)}
          className="stroke-border"
          strokeWidth={1}
        />
        {ticks.map((t) => (
          <g key={t.at}>
            <line x1={x(t.at)} x2={x(t.at)} y1={y(0)} y2={y(0) + 3} className="stroke-border" />
            <text
              x={x(t.at)}
              y={H - 4}
              textAnchor="middle"
              className="fill-muted-foreground text-[8px] font-medium"
            >
              {t.label}
            </text>
          </g>
        ))}
        <text
          x={PAD.left}
          y={H - 4}
          textAnchor="start"
          className="fill-muted-foreground text-[8px] font-medium"
        >
          ₦0
        </text>
        <text
          x={W - PAD.right}
          y={H - 4}
          textAnchor="end"
          className="fill-muted-foreground text-[8px] font-medium"
        >
          {formatNaira(maxNGN, true)}
        </text>

        {/* What the budget buys is filled and drawn solid, up to the budget;
            the rest of the curve — what more money would buy — is faint. */}
        <clipPath id={clip}>
          <rect x={0} y={0} width={handleX} height={H} />
        </clipPath>
        <path d={ghostLine} fill="none" className="stroke-border" strokeWidth={1.5} />
        <path d={area} fill={`url(#${gradient})`} clipPath={`url(#${clip})`} />
        <path
          d={line}
          fill="none"
          className="stroke-ready-ink/35"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={line}
          fill="none"
          className="stroke-ready-ink"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${clip})`}
        />

        {/* The budget: a rule down to the axis and a dot on the curve. */}
        <line
          x1={handleX}
          x2={handleX}
          y1={PAD.top - 4}
          y2={y(0)}
          className="stroke-foreground/40"
          strokeWidth={1}
        />
        <circle
          cx={handleX}
          cy={handleY}
          r={5.5}
          className="fill-ready-ink stroke-surface cursor-grab"
          strokeWidth={2.5}
        />
      </svg>

      <input
        type="range"
        min={0}
        max={STEPS}
        value={slider}
        onChange={(e) => fromPosition(Number(e.target.value) / STEPS)}
        className="budget-range mt-1 w-full accent-[hsl(var(--ready-ink))]"
        aria-label="Budget"
        aria-valuetext={
          budgetNGN === null ? 'No limit' : `${formatNaira(budgetNGN, true)} budget`
        }
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {QUICK.filter((q) => q < maxNGN).map((q) => (
          <Chip key={q} active={budgetNGN === q} onClick={() => onBudget(q)}>
            {formatNaira(q, true)}
          </Chip>
        ))}
        <Chip active={budgetNGN === null} onClick={() => onBudget(null)}>
          No limit
        </Chip>
        <span className="mono ml-auto text-note tabular-nums text-muted-foreground">
          {plan.newlyReady ? `+${formatCount(plan.newlyReady)} for ` : ''}
          <span className="text-foreground">{formatNaira(plan.spendNGN, true)}</span>
        </span>
      </div>
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
        'mono rounded-full border px-2.5 py-1 text-tick uppercase tracking-[0.07em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active
          ? 'border-foreground bg-foreground font-semibold text-surface'
          : 'border-border bg-surface text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
