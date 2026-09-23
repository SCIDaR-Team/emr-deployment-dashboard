import { useMemo, useState } from 'react';
import { BandIcon, SectionCard } from '@/components/ui';
import { BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import {
  BREAKDOWNS,
  readinessCostBy,
  readinessTotals,
  type BreakdownId,
  type ReadinessCostRow,
} from '@/lib/costByReadiness';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import type { Band, FacilitySummary } from '@/lib/types';

/**
 * Where the money goes — the plan's cost split by the readiness of the
 * facilities it is spent on, then cut by category, facility group,
 * functionality, zone or state.
 *
 * - **Three cards first**, Ready → Moderately ready → Not ready, the same
 *   order and fills as the readiness cards across the app: what each group
 *   costs, its share of the plan, and what that comes to per facility. The
 *   per-facility figure is the finding — a Not ready facility costs several
 *   times what a Ready one does, and a reader weighing where to start needs to
 *   see that beside the counts.
 * - **Then the breakdown**, one row per group, each a stacked bar of its own
 *   cost in the same three fills, with the three amounts and the total beside
 *   it. The bars are each row's own split, not a shared scale: the question is
 *   how a category's or a zone's money divides, and the total column carries
 *   the size.
 *
 * Follows the State filter, like everything else on the page.
 */

/** Best first, the readiness cards' order. */
const ORDER: Band[] = ['ready', 'moderately_ready', 'not_ready'];

const SHORT: Record<Band, string> = {
  ready: 'Ready',
  moderately_ready: 'Moderately',
  not_ready: 'Not ready',
};

/** Shared by the column heads and every row so the two cannot drift. */
const ROW_GRID =
  'md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_84px_84px_84px_88px] md:gap-x-4';

export function CostByReadinessSection({ facilities }: { facilities: FacilitySummary[] }) {
  const [breakdown, setBreakdown] = useState<BreakdownId>('category');

  const totals = useMemo(() => readinessTotals(facilities), [facilities]);
  const rows = useMemo(
    () => readinessCostBy(facilities, breakdown),
    [facilities, breakdown],
  );

  return (
    <SectionCard
      id="cost-by-readiness"
      title="Where the money goes"
      subtitle="The plan's cost, by the readiness of the facilities it is spent on"
      action={<BreakdownSwitch value={breakdown} onChange={setBreakdown} />}
      bodyClassName="p-0"
    >
      {!facilities.length ? (
        <p className="px-4 py-6 text-prose italic text-muted-foreground">No facilities in scope.</p>
      ) : (
        <>
          <div className="p-4">
            {/* Rules in `--on-band` at 15%, as `BandCards` has them: a border
                hairline vanishes against the Ready and Moderate fills. */}
            <div className="grid grid-cols-3 gap-px border border-onband/15 bg-onband/15">
              {ORDER.map((band) => {
                const cost = totals.cost[band];
                const count = totals.facilities[band];
                return (
                  <div key={band} className={cn('band-card min-w-0 px-2.5 py-2.5 sm:px-3', BAND_CLASSES[band].bg)}>
                    <p className="mono flex items-start gap-1.5 text-tick font-bold uppercase leading-tight tracking-[0.07em]">
                      <BandIcon band={band} className="h-3.5 w-3.5 shrink-0" />
                      {BAND_LABEL[band]}
                    </p>
                    <p className="mono mt-2 text-title font-semibold leading-none tracking-tight">
                      {formatNaira(cost, true)}
                    </p>
                    <p className="mono mt-1.5 text-note font-semibold text-onband-muted">
                      {formatShare(cost, totals.total)} of the plan
                    </p>
                    <p className="mono mt-1 text-note leading-snug text-onband-muted">
                      {formatCount(count)} {count === 1 ? 'facility' : 'facilities'}
                      {count ? (
                        <>
                          {' · '}
                          <span className="whitespace-nowrap">
                            {formatNaira(Math.round(cost / count), true)} each
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className={cn(
              ROW_GRID,
              'mono hidden border-y border-border px-4 py-2 text-tick uppercase tracking-[0.07em] text-muted-foreground md:grid',
            )}
          >
            <span>{BREAKDOWNS.find((b) => b.id === breakdown)?.label}</span>
            <span>Split</span>
            {ORDER.map((band) => (
              <span key={band} className="text-right">
                {SHORT[band]}
              </span>
            ))}
            <span className="text-right">Total</span>
          </div>
          <ul className="border-t border-border md:border-t-0">
            {rows.map((row) => (
              <BreakdownRow key={row.id} row={row} />
            ))}
          </ul>

          {breakdown === 'category' && (
            <p className="border-t border-border px-3 py-2 text-note text-muted-foreground">
              Every cost in the plan is Technical Infrastructure. Workforce, workflow and
              data-use actions are costed at ₦0 or left unpriced, so they have no category here.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}

/** One group: its split as a bar, the three amounts, and the total. Stacked on
 *  a narrow screen, so nothing scrolls sideways. */
function BreakdownRow({ row }: { row: ReadinessCostRow }) {
  const label = ORDER.map(
    (band) => `${BAND_LABEL[band]} ${formatNaira(row.cost[band])}`,
  ).join(', ');

  const bar = (
    <div
      className="flex h-2.5 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-[3px] bg-surface-sunk"
      role="img"
      aria-label={`${row.label}: ${label}`}
    >
      {row.total > 0 &&
        ORDER.map((band) =>
          row.cost[band] > 0 ? (
            <span
              key={band}
              className={cn('h-full', BAND_CLASSES[band].bg)}
              style={{ width: `${(row.cost[band] / row.total) * 100}%` }}
              title={`${BAND_LABEL[band]}: ${formatNaira(row.cost[band])} (${formatShare(row.cost[band], row.total)})`}
            />
          ) : null,
        )}
    </div>
  );

  return (
    <li className={cn(ROW_GRID, 'items-center border-b border-border px-4 py-2.5 last:border-0 md:grid')}>
      <div className="flex items-baseline justify-between gap-3 md:block">
        <span className="text-prose text-foreground">{row.label}</span>
        <span className="mono shrink-0 text-body font-semibold tabular-nums text-foreground md:hidden">
          {formatNaira(row.total, true)}
        </span>
      </div>

      <div className="mt-1.5 flex md:mt-0">{bar}</div>

      {ORDER.map((band) => (
        <span
          key={band}
          className="mono hidden whitespace-nowrap text-right text-body tabular-nums text-foreground md:block"
        >
          {formatNaira(row.cost[band], true)}
        </span>
      ))}
      <span className="mono hidden whitespace-nowrap text-right text-body font-semibold tabular-nums text-foreground md:block">
        {formatNaira(row.total, true)}
      </span>

      <p className="mono mt-1 flex flex-wrap gap-x-3 text-note tabular-nums text-muted-foreground md:hidden">
        {ORDER.map((band) => (
          <span key={band}>
            {SHORT[band]}{' '}
            <span className="text-foreground">{formatNaira(row.cost[band], true)}</span>
          </span>
        ))}
      </p>
    </li>
  );
}

/** The breakdown switch, in the shape of the schedule's Group by control. */
function BreakdownSwitch({
  value,
  onChange,
}: {
  value: BreakdownId;
  onChange: (b: BreakdownId) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow hidden sm:inline">By</span>
      <div className="flex flex-wrap items-center gap-px rounded-[3px] border border-border bg-border">
        {BREAKDOWNS.map((b) => {
          const active = b.id === value;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(b.id)}
              className={cn(
                'mono px-2.5 py-1 text-tick uppercase tracking-[0.09em] transition-colors first:rounded-l-[2px] last:rounded-r-[2px]',
                active
                  ? 'bg-foreground font-semibold text-surface'
                  : 'bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
