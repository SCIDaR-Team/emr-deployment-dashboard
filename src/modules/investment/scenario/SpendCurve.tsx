import { useCallback, useId, useRef } from 'react';
import { formatCount, formatNaira } from '@/lib/format';
import type { ScenarioPlan } from '@/lib/scenarios';

/**
 * Facilities made Ready against money spent, for the fixes chosen, with the
 * plan as a point on the curve the reader can drag.
 *
 * The shape is the finding: it climbs almost vertically at the start — ₦45m
 * of routers makes over a thousand facilities Ready — and flattens into the
 * long, costly tail of solar systems and satellite links.
 *
 * - **Square-root spend axis**, so the cheap end has room to set a budget in.
 * - **A grey curve for every fix**, behind the chosen one.
 * - **What the plan buys is filled and drawn solid**; the rest is faint.
 * - **The point sits at what the plan spends.** Dragging it sets a budget —
 *   whatever the target was, the reader is now choosing an amount of money.
 *
 * Drawn to fill the height it is given, so it can take whatever room the
 * panel has left on a laptop screen.
 */

const W = 420;
const PAD = { left: 40, right: 12, top: 30, bottom: 22 };

export function SpendCurve({
  plan,
  ghost,
  maxNGN,
  handleNGN,
  callout,
  onBudget,
  height = 200,
}: {
  plan: ScenarioPlan;
  ghost: ScenarioPlan;
  maxNGN: number;
  /** Where the point sits on the spend axis. */
  handleNGN: number;
  callout: string;
  onBudget: (budget: number | null) => void;
  height?: number;
}) {
  const H = height;
  const svg = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, '');
  const maxReady = Math.max(1, ghost.reachable.facilities);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (spend: number) =>
    PAD.left + (maxNGN > 0 ? Math.sqrt(Math.min(1, Math.max(0, spend) / maxNGN)) : 0) * innerW;
  const y = (ready: number) => PAD.top + innerH - (ready / maxReady) * innerH;

  const pathOf = (curve: ScenarioPlan['curve']) => {
    const pts: [number, number][] = [[x(0), y(0)]];
    for (let i = 1; i < curve.length; i += 1) {
      const a = curve[i - 1]!;
      const b = curve[i]!;
      for (let k = 1; k <= 12; k += 1) {
        const t = k / 12;
        pts.push([
          x(a.spendNGN + (b.spendNGN - a.spendNGN) * t),
          y(a.ready + (b.ready - a.ready) * t),
        ]);
      }
    }
    pts.push([x(maxNGN), y(curve[curve.length - 1]!.ready)]);
    return pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(2)},${b.toFixed(2)}`).join(' ');
  };

  const line = pathOf(plan.curve);
  const ghostLine = pathOf(ghost.curve);
  const area = `${line} L${x(maxNGN).toFixed(2)},${y(0).toFixed(2)} L${x(0).toFixed(2)},${y(0).toFixed(2)} Z`;

  const hx = x(handleNGN);
  const hy = y(plan.newlyReady);

  const fromPosition = useCallback(
    (p: number) => {
      const c = Math.min(1, Math.max(0, p));
      if (c >= 0.995) onBudget(null);
      else onBudget(Math.round((c * c * maxNGN) / 1e6) * 1e6);
    },
    [maxNGN, onBudget],
  );
  const drag = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    fromPosition((((e.clientX - r.left) / r.width) * W - PAD.left) / innerW);
  };

  const xTicks = [
    { at: 0, label: '₦0' },
    { at: 100_000_000, label: '₦100m' },
    { at: 1_000_000_000, label: '₦1bn' },
    { at: maxNGN, label: formatNaira(maxNGN, true) },
  ].filter((t) => t.at === 0 || t.at === maxNGN || t.at < maxNGN * 0.7);
  const yTicks = [0, Math.round(maxReady / 2), maxReady];

  const lw = callout.length * 6.2 + 16;
  const lx = Math.min(Math.max(hx - lw / 2, PAD.left), W - PAD.right - lw);
  const ly = Math.max(2, hy - 30);

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full cursor-crosshair touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e);
      }}
      role="img"
      aria-label={`Facilities made Ready against spend. ${callout}.`}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" className="[stop-color:hsl(var(--ready-ink))]" stopOpacity={0.3} />
          <stop offset="100%" className="[stop-color:hsl(var(--ready-ink))]" stopOpacity={0.02} />
        </linearGradient>
        <clipPath id={`${id}-c`}>
          <rect x={0} y={0} width={hx} height={H} />
        </clipPath>
      </defs>

      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            className="stroke-border"
            strokeWidth={t ? 0.6 : 1}
          />
          <text
            x={PAD.left - 6}
            y={y(t) + 3.5}
            textAnchor="end"
            className="fill-muted-foreground text-[10px] tabular-nums"
          >
            {formatCount(t)}
          </text>
        </g>
      ))}
      <text
        x={PAD.left - 6}
        y={11}
        className="fill-muted-foreground text-[9px] uppercase tracking-[0.06em]"
      >
        Facilities made Ready
      </text>
      {xTicks.map((t) => (
        <text
          key={t.label}
          x={x(t.at)}
          y={H - 6}
          textAnchor={t.at === 0 ? 'start' : t.at === maxNGN ? 'end' : 'middle'}
          className="fill-muted-foreground text-[10px] tabular-nums"
        >
          {t.label}
        </text>
      ))}

      <path d={ghostLine} fill="none" className="stroke-foreground/15" strokeWidth={1.5} />
      <path d={area} fill={`url(#${id}-g)`} clipPath={`url(#${id}-c)`} />
      <path
        d={line}
        fill="none"
        className="stroke-ready-ink/30"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d={line}
        fill="none"
        className="stroke-ready-ink"
        strokeWidth={2.5}
        strokeLinejoin="round"
        clipPath={`url(#${id}-c)`}
      />

      <line x1={hx} x2={hx} y1={hy} y2={y(0)} className="stroke-ready-ink/60" strokeWidth={1} />
      <circle cx={hx} cy={hy} r={6.5} className="fill-ready-ink stroke-surface" strokeWidth={3} />
      <rect x={lx} y={ly} width={lw} height={20} rx={10} className="fill-foreground" />
      <text
        x={lx + lw / 2}
        y={ly + 13.5}
        textAnchor="middle"
        className="fill-surface text-[10.5px] font-semibold tabular-nums"
      >
        {callout}
      </text>
    </svg>
  );
}
