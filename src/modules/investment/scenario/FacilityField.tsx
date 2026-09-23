import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira } from '@/lib/format';
import type { FacilityPath } from '@/lib/scenarios';
import { groupLabel } from './fixes';

/**
 * Every facility in scope, one square each, in the readiness colours.
 *
 * The field is the scenario's result made literal: 2,806 clinics, and the ones
 * the chosen fixes and budget reach turn deep green. Squares hold a fixed
 * place — Ready already first, then everyone else cheapest to make Ready first
 * — so funding more sweeps a green front across the field rather than
 * scattering colour, and a budget reads as how far along the field the money
 * gets.
 *
 * Colour changes run as a short diagonal wave, staggered by position, so a
 * change of plan is something the reader watches happen. The global
 * reduced-motion rule flattens it.
 *
 * Hovering a square names the facility, what it needs and what that costs, and
 * dims every square outside its need group, so the reader can see how big a
 * group is and where it sits. Clicking opens the facility on Assessed States.
 */

type SquareStatus = 'before' | 'new' | 'moderate' | 'not';

const STATUS_FILL: Record<SquareStatus, string> = {
  before: 'fill-ready',
  new: 'fill-ready-ink',
  moderate: 'fill-moderate',
  not: 'fill-notready',
};

/** The same four colours as HTML swatches. Spelled out rather than derived
 *  from `STATUS_FILL`, so Tailwind can see every class it has to generate. */
const STATUS_SWATCH: Record<SquareStatus, string> = {
  before: 'bg-ready',
  new: 'bg-ready-ink',
  moderate: 'bg-moderate',
  not: 'bg-notready',
};

const STATUS_LABEL: Record<SquareStatus, string> = {
  before: 'Ready before',
  new: 'Newly ready',
  moderate: 'Moderately ready',
  not: 'Not ready',
};

const CELL = 10;
const GAP = 2;

/** Columns for a field of `n` squares: a little wider than it is tall. */
function columnsFor(n: number): number {
  return Math.max(16, Math.min(72, Math.round(Math.sqrt(n * 1.6))));
}

function statusOf(p: FacilityPath, funded: ReadonlySet<string>): SquareStatus {
  if (p.baseline === 'ready') return 'before';
  if (funded.has(p.facility.uuid)) return 'new';
  return p.baseline === 'moderately_ready' ? 'moderate' : 'not';
}

/** The squares themselves — memoised on the plan, so hovering never re-renders
 *  2,806 elements. */
const Squares = memo(function Squares({
  order,
  funded,
  cols,
}: {
  order: FacilityPath[];
  funded: ReadonlySet<string>;
  cols: number;
}) {
  return (
    <>
      {order.map((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return (
          <rect
            key={p.facility.uuid}
            data-g={p.groupKey}
            x={col * CELL}
            y={row * CELL}
            width={CELL - GAP}
            height={CELL - GAP}
            rx={1.6}
            className={cn(
              'transition-[fill,opacity] duration-500 ease-out',
              STATUS_FILL[statusOf(p, funded)],
            )}
            style={{ transitionDelay: `${Math.min(650, col * 5 + row * 7)}ms` }}
          />
        );
      })}
    </>
  );
});

export function FacilityField({
  order,
  funded,
}: {
  order: FacilityPath[];
  funded: ReadonlySet<string>;
}) {
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  const cols = columnsFor(order.length);
  const rows = Math.ceil(order.length / cols);
  const width = cols * CELL - GAP;
  const height = rows * CELL - GAP;

  const groupSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of order) m.set(p.groupKey, (m.get(p.groupKey) ?? 0) + 1);
    return m;
  }, [order]);

  const locate = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = e.currentTarget.getBoundingClientRect();
      const box = wrap.current?.getBoundingClientRect();
      const col = Math.floor(((e.clientX - svg.left) / svg.width) * (width + GAP) / CELL);
      const row = Math.floor(((e.clientY - svg.top) / svg.height) * (height + GAP) / CELL);
      const index = row * cols + col;
      if (col < 0 || col >= cols || row < 0 || index >= order.length || !box) {
        setHover(null);
        return;
      }
      setHover({ index, x: e.clientX - box.left, y: e.clientY - box.top });
    },
    [cols, width, height, order.length],
  );

  const hovered = hover ? order[hover.index] : null;
  const counts = useMemo(() => {
    const c: Record<SquareStatus, number> = { before: 0, new: 0, moderate: 0, not: 0 };
    for (const p of order) c[statusOf(p, funded)] += 1;
    return c;
  }, [order, funded]);

  return (
    <div>
      <div ref={wrap} className="relative">
        {/* The group highlight is a rule rather than a prop on every square, so
            moving the pointer never re-renders the field. */}
        {hovered && hovered.baseline !== 'ready' && (
          <style>{`.facility-field rect:not([data-g="${hovered.groupKey}"]){opacity:.28}`}</style>
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="facility-field block h-auto w-full cursor-pointer select-none"
          role="img"
          aria-label={`${formatCount(order.length)} facilities: ${(
            Object.keys(counts) as SquareStatus[]
          )
            .map((s) => `${STATUS_LABEL[s]} ${formatCount(counts[s])}`)
            .join(', ')}`}
          onPointerMove={locate}
          onPointerLeave={() => setHover(null)}
          onClick={() => {
            if (!hovered) return;
            const f = hovered.facility;
            navigate(`/assessment/${f.stateId}/${f.lgaId}/${f.uuid}`);
          }}
        >
          <Squares order={order} funded={funded} cols={cols} />
        </svg>

        {hover && hovered && (
          <div
            className="pointer-events-none absolute z-10 w-[240px] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-body shadow-pop"
            style={{
              left: Math.min(Math.max(hover.x, 124), (wrap.current?.clientWidth ?? 0) - 124),
              top: hover.y - 12,
            }}
          >
            <p className="truncate font-semibold text-foreground">{hovered.facility.name}</p>
            <p className="truncate text-note text-muted-foreground">
              {hovered.facility.lga}, {hovered.facility.state}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-note">
              <span
                aria-hidden
                className={cn(
                  'inline-block h-2 w-2 rounded-[2px]',
                  STATUS_SWATCH[statusOf(hovered, funded)],
                )}
              />
              <span className="text-foreground">{STATUS_LABEL[statusOf(hovered, funded)]}</span>
            </p>
            {hovered.baseline !== 'ready' && (
              <p className="mono mt-1 text-note text-muted-foreground">
                Needs {groupLabel(hovered.needs)} · {formatNaira(hovered.costNGN, true)}
                <br />
                {formatCount(groupSize.get(hovered.groupKey) ?? 0)} facilities need the same
              </p>
            )}
            <p className="mt-1 text-tick uppercase tracking-[0.07em] text-brand-600">
              Click to open
            </p>
          </div>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-note text-muted-foreground">
        {(Object.keys(STATUS_LABEL) as SquareStatus[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn('block h-2.5 w-2.5 rounded-[2px]', STATUS_SWATCH[s])}
            />
            {STATUS_LABEL[s]}
            <span className="mono font-semibold tabular-nums text-foreground">
              {formatCount(counts[s])}
            </span>
          </li>
        ))}
        <li className="ml-auto text-tick uppercase tracking-[0.07em]">1 square = 1 facility</li>
      </ul>
    </div>
  );
}
