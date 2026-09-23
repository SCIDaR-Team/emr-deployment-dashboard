import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PencilLine } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, parseNaira } from '@/lib/format';
import type { ScenarioPlan } from '@/lib/scenarios';

/**
 * The budget control.
 *
 * The budget is the headline of this step, so it is set in figure type and is
 * itself the input: click it and type "250m" or "1.2bn". Under it, what the
 * budget buys and how much of it is spent. Under that, the curve — facilities
 * made Ready against money spent, for the fixes chosen — with the budget as a
 * point the reader drags along it and a callout saying what that point buys.
 *
 * The curve's shape is the finding: it climbs almost vertically at the start —
 * ₦45m of routers makes over a thousand facilities Ready — and flattens into
 * the long, costly tail of solar systems and satellite links.
 *
 * - **Square-root spend axis.** On a linear axis the router step is a pixel
 *   wide; a root scale gives the cheap end room. The slider uses the same
 *   scale, so dragging either feels the same.
 * - **A grey curve for every fix**, behind the chosen one: what the fixes left
 *   out would add at each budget.
 * - **What the budget buys is filled and drawn solid**; the rest of the curve,
 *   what more money would buy, is faint.
 */

const W = 360;
const H = 200;
const PAD = { left: 38, right: 10, top: 34, bottom: 24 };
const STEPS = 1000;

export interface BudgetControlProps {
  plan: ScenarioPlan;
  /** The plan with every fix allowed and no budget — the grey curve, and the
   *  scale of both axes. */
  ghost: ScenarioPlan;
  /** The right end of the spend axis: every facility Ready. */
  maxNGN: number;
  budgetNGN: number | null;
  onBudget: (budget: number | null) => void;
}

const QUICK = [50_000_000, 250_000_000, 1_000_000_000];

export function BudgetControl({ plan, ghost, maxNGN, budgetNGN, onBudget }: BudgetControlProps) {
  const unspent = budgetNGN === null ? null : Math.max(0, budgetNGN - plan.spendNGN);
  const meter =
    budgetNGN === null
      ? plan.reachable.costNGN
        ? plan.spendNGN / plan.reachable.costNGN
        : 0
      : budgetNGN
        ? plan.spendNGN / budgetNGN
        : 0;

  return (
    <div>
      <div className="rounded-[8px] border border-border bg-surface p-3.5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mono text-tick uppercase tracking-[0.08em] text-muted-foreground">
              Budget
            </p>
            <BudgetInput budgetNGN={budgetNGN} onBudget={onBudget} />
          </div>
          <div className="shrink-0 text-right">
            <p className="mono text-tick uppercase tracking-[0.08em] text-muted-foreground">
              Buys
            </p>
            <p className="mono mt-1 text-figure-sm font-semibold leading-none tabular-nums text-ready-ink">
              +{formatCount(plan.newlyReady)}
            </p>
            <p className="mt-1 text-note text-muted-foreground">made Ready</p>
          </div>
        </div>

        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunk"
          role="img"
          aria-label={`${formatNaira(plan.spendNGN)} spent`}
        >
          <div
            className="h-full rounded-full bg-ready-ink transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, meter * 100)}%` }}
          />
        </div>
        <p className="mono mt-1.5 flex flex-wrap justify-between gap-x-3 text-note tabular-nums text-muted-foreground">
          <span>
            Spent <span className="font-semibold text-foreground">{formatNaira(plan.spendNGN, true)}</span>
          </span>
          <span>
            {unspent === null ? (
              <>
                The chosen fixes top out at{' '}
                <span className="text-foreground">{formatNaira(plan.reachable.costNGN, true)}</span>
              </>
            ) : (
              <>
                <span className="text-foreground">{formatNaira(unspent, true)}</span> left over
              </>
            )}
          </span>
        </p>
      </div>

      <Curve plan={plan} ghost={ghost} maxNGN={maxNGN} budgetNGN={budgetNGN} onBudget={onBudget} />

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {QUICK.filter((q) => q < maxNGN).map((q) => (
          <Chip key={q} active={budgetNGN === q} onClick={() => onBudget(q)}>
            {formatNaira(q, true)}
          </Chip>
        ))}
        <Chip active={budgetNGN === null} onClick={() => onBudget(null)}>
          No limit
        </Chip>
      </div>
    </div>
  );
}

/** The budget, in figure type, as the input itself. */
function BudgetInput({
  budgetNGN,
  onBudget,
}: {
  budgetNGN: number | null;
  onBudget: (b: number | null) => void;
}) {
  const shown = budgetNGN === null ? 'No limit' : formatNaira(budgetNGN, true);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => setInvalid(false), [budgetNGN]);

  const commit = () => {
    if (draft === null) return;
    const v = parseNaira(draft);
    if (v === undefined) {
      setInvalid(true);
      return;
    }
    onBudget(v);
    setDraft(null);
  };

  return (
    <label className="group mt-1 flex items-center gap-2">
      <input
        value={draft ?? shown}
        onFocus={(e) => {
          setDraft(budgetNGN === null ? '' : formatNaira(budgetNGN, true));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="e.g. 250m"
        aria-label="Budget, in naira. Type an amount like 250m or 1.2bn, or leave empty for no limit."
        aria-invalid={invalid}
        className={cn(
          'mono w-full min-w-0 rounded-[4px] bg-transparent text-figure font-semibold leading-none tracking-tight text-foreground outline-none transition-colors',
          'hover:bg-surface-sunk/60 focus:bg-surface-sunk focus:px-1.5',
          invalid && 'text-notready-ink',
        )}
      />
      <PencilLine
        className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </label>
  );
}

function Curve({ plan, ghost, maxNGN, budgetNGN, onBudget }: BudgetControlProps) {
  const svg = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, '');
  const maxReady = Math.max(1, ghost.reachable.facilities);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (spend: number) =>
    PAD.left + (maxNGN > 0 ? Math.sqrt(Math.min(1, spend / maxNGN)) : 0) * innerW;
  const y = (ready: number) => PAD.top + innerH - (ready / maxReady) * innerH;

  /** Straight within a need group (every facility in it costs the same), so the
   *  joins are exact; sampled so the root axis bends it; flat after the end. */
  const pathOf = (curve: ScenarioPlan['curve']) => {
    const pts: [number, number][] = [[x(0), y(0)]];
    for (let i = 1; i < curve.length; i += 1) {
      const a = curve[i - 1]!;
      const b = curve[i]!;
      for (let k = 1; k <= 12; k += 1) {
        const t = k / 12;
        pts.push([x(a.spendNGN + (b.spendNGN - a.spendNGN) * t), y(a.ready + (b.ready - a.ready) * t)]);
      }
    }
    pts.push([x(maxNGN), y(curve[curve.length - 1]!.ready)]);
    return pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(2)},${b.toFixed(2)}`).join(' ');
  };

  const line = pathOf(plan.curve);
  const ghostLine = pathOf(ghost.curve);
  const area = `${line} L${x(maxNGN).toFixed(2)},${y(0).toFixed(2)} L${x(0).toFixed(2)},${y(0).toFixed(2)} Z`;

  const atBudget = budgetNGN === null ? maxNGN : Math.min(budgetNGN, maxNGN);
  const hx = x(atBudget);
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

  // The callout: what the budget point buys, kept inside the frame.
  const label = `${budgetNGN === null ? 'No limit' : formatNaira(budgetNGN, true)} · +${formatCount(plan.newlyReady)}`;
  const lw = label.length * 6.2 + 14;
  const lx = Math.min(Math.max(hx - lw / 2, PAD.left), W - PAD.right - lw);
  const ly = Math.max(4, hy - 30);

  const slider = budgetNGN === null ? STEPS : Math.round(Math.sqrt(atBudget / maxNGN) * STEPS);

  return (
    <div className="mt-4">
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
        aria-hidden
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

        {/* Facilities axis: gridlines and counts. */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={t ? 0.6 : 1} />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
              {formatCount(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left - 6} y={12} textAnchor="start" className="fill-muted-foreground text-[9px] uppercase tracking-[0.06em]">
          Facilities made Ready
        </text>

        {/* Spend axis. */}
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
        <path d={line} fill="none" className="stroke-ready-ink/30" strokeWidth={2.5} strokeLinejoin="round" />
        <path
          d={line}
          fill="none"
          className="stroke-ready-ink"
          strokeWidth={2.5}
          strokeLinejoin="round"
          clipPath={`url(#${id}-c)`}
        />

        {/* The budget point: a rule, a dot, and what it buys. */}
        <line x1={hx} x2={hx} y1={hy} y2={y(0)} className="stroke-ready-ink/60" strokeWidth={1} strokeDasharray="0" />
        <circle cx={hx} cy={hy} r={6.5} className="fill-ready-ink stroke-surface" strokeWidth={3} />
        <g>
          <rect x={lx} y={ly} width={lw} height={20} rx={10} className="fill-foreground" />
          <text x={lx + lw / 2} y={ly + 13.5} textAnchor="middle" className="fill-surface text-[10.5px] font-semibold tabular-nums">
            {label}
          </text>
        </g>
      </svg>

      <input
        type="range"
        min={0}
        max={STEPS}
        value={slider}
        onChange={(e) => fromPosition(Number(e.target.value) / STEPS)}
        className="mt-1 w-full accent-[hsl(var(--ready-ink))]"
        aria-label="Budget"
        aria-valuetext={budgetNGN === null ? 'No limit' : `${formatNaira(budgetNGN, true)} budget`}
      />
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
