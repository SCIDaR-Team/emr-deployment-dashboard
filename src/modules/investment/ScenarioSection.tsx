import { useMemo, useState } from 'react';
import { SectionCard } from '@/components/ui';
import { BAND_CLASSES } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import { SCENARIO_PACKAGES } from '@/lib/gapCatalogue';
import { scenarioFor, type ScenarioResult } from '@/lib/scenarios';
import type { FacilitySummary } from '@/lib/types';

/**
 * What unlocks readiness — the workbook's fourteen power and connectivity
 * packages, each as "fund this, and this many more facilities are Ready, for
 * this much".
 *
 * The question the costed schedule below cannot answer. That table says what
 * everything costs; this says which part of it moves the readiness count, and
 * how cheaply. The answer is lopsided — routers alone, at ₦40,000 each, make
 * over a thousand facilities Ready — and a reader deciding what to fund first
 * needs to see that before the full ₦7bn.
 *
 * - **One row per package**, ranked by facilities made Ready, or by cost per
 *   facility made Ready. The two orders answer "what does the most" and "what
 *   is the best value", and they are not the same list.
 * - **The bar is the whole population in scope.** Ready today is the pale
 *   Ready fill the cards above use, newly Ready the deeper Ready green after
 *   it, so the bar reads as the Ready count growing and the growth is what
 *   stands out.
 * - **Cost is what buys the facilities made Ready**, not the fixes funded
 *   everywhere they are needed. A router at a facility that also needs a solar
 *   system leaves it not ready; that spend is in the hover, not the figure.
 *
 * Follows the State filter: the packages re-run over the facilities in scope.
 */

type SortMode = 'unlocked' | 'value';

/** The row's columns on a wide screen. Shared by the heads and every row so
 *  the two cannot drift. */
const ROW_GRID =
  'md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_88px_88px_96px] md:gap-x-4';

/**
 * Ready today is the pale Ready fill; newly Ready is the Ready ink, the deeper
 * step of the same green. The client's band fills are pastel by design, and
 * two pastels on a 10px bar do not separate — the step that matters, what the
 * package adds, has to be the one that stands out.
 */
const TODAY_FILL = BAND_CLASSES.ready.bg;
const NEW_FILL = 'bg-ready-ink';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'unlocked', label: 'Most unlocked' },
  { id: 'value', label: 'Best value' },
];

function sortResults(results: ScenarioResult[], mode: SortMode): ScenarioResult[] {
  return [...results].sort((a, b) => {
    if (mode === 'value') {
      // Packages that unlock nothing have no cost per facility, and go last.
      const av = a.costPerUnlockedNGN ?? Infinity;
      const bv = b.costPerUnlockedNGN ?? Infinity;
      if (av !== bv) return av - bv;
    }
    return b.unlocked - a.unlocked || a.costNGN - b.costNGN;
  });
}

export function ScenarioSection({ facilities }: { facilities: FacilitySummary[] }) {
  const [sort, setSort] = useState<SortMode>('unlocked');

  const results = useMemo(
    () => SCENARIO_PACKAGES.map((pkg) => scenarioFor(facilities, pkg)),
    [facilities],
  );
  const rows = useMemo(() => sortResults(results, sort), [results, sort]);

  const total = facilities.length;
  const readyToday = results[0]?.readyToday ?? 0;

  return (
    <SectionCard
      id="scenarios"
      title="What unlocks readiness"
      subtitle="Ready facilities if only these power and connectivity fixes are funded"
      action={<SortSwitch value={sort} onChange={setSort} />}
      bodyClassName="p-0"
    >
      {!total ? (
        <p className="px-4 py-6 text-prose italic text-muted-foreground">
          No facilities in scope.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border px-4 py-3">
            <p className="text-body leading-snug text-muted-foreground">
              <span className="mono font-semibold text-foreground">{formatCount(readyToday)}</span>{' '}
              of {formatCount(total)} facilities are Ready today (
              {formatShare(readyToday, total)}). Power and connectivity are the only gaps that
              decide readiness, so these fixes are the only ones that change it.
            </p>
            <Legend />
          </div>

          {/* Column heads, on screens wide enough for the row to be a row. */}
          <div
            className={cn(
              ROW_GRID,
              'mono hidden border-b border-border px-4 py-2 text-tick uppercase tracking-[0.07em] text-muted-foreground md:grid',
            )}
          >
            <span>Package</span>
            <span>Ready after</span>
            <span className="text-right">Newly ready</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Per facility</span>
          </div>
          <ul>
            {rows.map((r) => (
              <ScenarioRow key={r.pkg.id} result={r} total={total} />
            ))}
          </ul>

          <p className="border-t border-border px-3 py-2 text-note text-muted-foreground">
            Cost is what the package&rsquo;s fixes cost at the facilities it makes Ready; hover a
            figure for the cost of funding them everywhere they are needed. Four of the
            workbook&rsquo;s own scenario columns disagree with its readiness rule, so Router only,
            FibreX only, Full solar system only and Solar top-up + Network extension differ from
            its Cost summary — see the data queries.
          </p>
        </>
      )}
    </SectionCard>
  );
}

/**
 * One package. A grid row on a wide screen; stacked on a narrow one — name and
 * the newly-ready count, then the bar, then the money — so nothing scrolls
 * sideways in a phone's width.
 */
function ScenarioRow({ result: r, total }: { result: ScenarioResult; total: number }) {
  const ready = r.distribution.ready;
  const todayPct = (r.readyToday / total) * 100;
  const newPct = (r.unlocked / total) * 100;
  const everywhere = `Funded everywhere it is needed: ${formatNaira(r.costEverywhereNGN)}`;

  const newly = r.unlocked ? (
    <span className="font-semibold text-foreground">+{formatCount(r.unlocked)}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
  const cost = r.unlocked ? formatNaira(r.costNGN, true) : '—';
  const per =
    r.costPerUnlockedNGN != null ? formatNaira(Math.round(r.costPerUnlockedNGN), true) : '—';

  return (
    <li className={cn(ROW_GRID, 'items-center border-b border-border px-4 py-2.5 last:border-0 md:grid')}>
      <div className="flex items-baseline justify-between gap-3 md:block">
        <span className="text-prose text-foreground">{r.pkg.label}</span>
        <span className="mono shrink-0 text-body tabular-nums md:hidden">{newly}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-2.5 md:mt-0">
        {/* The whole population in scope: Ready today, then newly Ready. */}
        <div
          className="flex h-2.5 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-[3px] bg-surface-sunk"
          role="img"
          aria-label={`${formatCount(ready)} of ${formatCount(total)} Ready: ${formatCount(r.readyToday)} today and ${formatCount(r.unlocked)} newly Ready`}
        >
          {r.readyToday > 0 && (
            <span className={cn('h-full shrink-0', TODAY_FILL)} style={{ width: `${todayPct}%` }} />
          )}
          {r.unlocked > 0 && (
            <span className={cn('h-full shrink-0', NEW_FILL)} style={{ width: `${newPct}%` }} />
          )}
        </div>
        <span className="mono w-[76px] shrink-0 text-right text-body tabular-nums text-foreground">
          {formatCount(ready)}{' '}
          <span className="text-muted-foreground">{formatShare(ready, total)}</span>
        </span>
      </div>

      <span className="mono hidden text-right text-body tabular-nums md:block">{newly}</span>
      <span
        className="mono hidden whitespace-nowrap text-right text-body tabular-nums text-foreground md:block"
        title={everywhere}
      >
        {cost}
      </span>
      <span className="mono hidden whitespace-nowrap text-right text-body tabular-nums text-muted-foreground md:block">
        {per}
      </span>

      {/* The money, on one line under the bar on a narrow screen. */}
      <p className="mono mt-1 text-note tabular-nums text-muted-foreground md:hidden" title={everywhere}>
        {r.unlocked ? (
          <>
            <span className="text-foreground">{cost}</span> · {per} per facility
          </>
        ) : (
          'Unlocks no facility on its own'
        )}
      </p>
    </li>
  );
}

function Legend() {
  return (
    <ul className="flex shrink-0 items-center gap-4 text-note text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn('block h-2.5 w-2.5 rounded-[2px]', TODAY_FILL)} />
        Ready today
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn('block h-2.5 w-2.5 rounded-[2px]', NEW_FILL)} />
        Newly ready
      </li>
    </ul>
  );
}

/** Ranking switch, in the same shape as the schedule's Group by control. */
function SortSwitch({ value, onChange }: { value: SortMode; onChange: (m: SortMode) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow hidden sm:inline">Rank by</span>
      <div className="flex items-center gap-px rounded-[3px] border border-border bg-border">
        {SORTS.map((mode) => {
          const active = mode.id === value;
          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(mode.id)}
              className={cn(
                'mono px-2.5 py-1 text-tick uppercase tracking-[0.09em] transition-colors first:rounded-l-[2px] last:rounded-r-[2px]',
                active
                  ? 'bg-foreground font-semibold text-surface'
                  : 'bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
