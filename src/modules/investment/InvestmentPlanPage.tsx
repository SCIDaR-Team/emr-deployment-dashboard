import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/filters/FilterBar';
import {
  Badge,
  DistributionBar,
  EmptyState,
  LoadError,
  SectionCard,
  Tile,
  TileRow,
} from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilterStore } from '@/store/filterStore';
import { aggregateAreaProfiles } from '@/lib/areaProfile';
import { formatCount, formatNaira } from '@/lib/format';
import { THEME_BY_ID } from '@/lib/themes';
import type { AreaProfile, InvestmentItem, WaveId } from '@/lib/types';

/**
 * Investment Plan — what deploying will take, itemised.
 *
 * Every line here is triggered by a *failed* reading, not by a wish list: an
 * item appears because some number of facilities were banded at or below its
 * trigger, and the quantity is that count. That is the discipline the page has
 * to keep — a costed plan whose quantities are not traceable to a finding is a
 * budget, not a plan.
 *
 * Costs are synthetic, like everything else in this dashboard. They are plain
 * naira rather than the sibling dashboard's deliberate blanks, because a page
 * about money with no money on it demonstrates nothing.
 *
 * NOTE: the editorial direction for this page is still open — in particular
 * whether it leads with the itemised schedule or with the rollout waves. Both
 * are here; the ordering is the open question.
 */

const SECTIONS = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'waves', label: 'Rollout waves' },
];

const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const;

const WAVE_NOTE: Record<WaveId, string> = {
  1: 'States with the readiest facilities. Deploy while the plan is still being written for the rest.',
  2: 'Targeted intervention first — the gaps are real but not foundational.',
  3: 'Foundational investment before any deployment date is meaningful.',
};

export default function InvestmentPlanPage() {
  const { states, facilities, national } = useDataContext();
  const selectedStates = useFilterStore((s) => s.states);

  /** Scope: the selected states, or the whole country when nothing is picked.
   *  The national profile is used verbatim for "everywhere" rather than
   *  re-summed from the states, so the unfiltered page and the dataset agree by
   *  construction. */
  const scope = useMemo(() => {
    if (!selectedStates.length) {
      return {
        name: 'All 12 assessed states',
        facilityCount: national.data?.facilityCount ?? 0,
        distribution: national.data?.archetypeDistribution ?? {
          not_ready: 0,
          moderately_ready: 0,
          ready: 0,
        },
        investments: national.data?.investments ?? [],
      };
    }
    const picked = states.data.filter((s) => selectedStates.includes(s.name));
    const agg = aggregateAreaProfiles(picked);
    return {
      name: picked.map((s) => s.name).join(', '),
      facilityCount: agg.facilityCount,
      distribution: agg.archetypeDistribution,
      investments: agg.investments,
    };
  }, [selectedStates, states.data, national.data]);

  const totalCost = scope.investments.reduce((sum, i) => sum + (i.totalCostNGN ?? 0), 0);
  const highPriority = scope.investments.filter((i) => i.priority === 'high');
  const highPriorityCost = highPriority.reduce((sum, i) => sum + (i.totalCostNGN ?? 0), 0);

  const waves = useMemo(() => {
    const byWave = new Map<WaveId, AreaProfile[]>();
    for (const s of states.data) {
      if (!s.deployment) continue;
      if (selectedStates.length && !selectedStates.includes(s.name)) continue;
      const list = byWave.get(s.deployment.wave) ?? [];
      list.push(s);
      byWave.set(s.deployment.wave, list);
    }
    return [1, 2, 3]
      .map((w) => ({ wave: w as WaveId, states: byWave.get(w as WaveId) ?? [] }))
      .filter((entry) => entry.states.length);
  }, [states.data, selectedStates]);

  if (states.error) {
    return <LoadError what="the investment data" error={states.error} onRetry={states.refetch} />;
  }

  return (
    <>
      <PageHeader
        title="Investment Plan"
        subtitle={scope.name}
        sections={SECTIONS}
      >
        <FilterBar facilities={facilities.data} show={['state']} />
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-5">
        <TileRow className="sm:grid-cols-2 lg:grid-cols-4">
          {/* Compact in the tiles, exact in the table below. A ten-digit naira
              figure set at tile size is unreadable and, worse, unmemorable —
              nobody carries ₦9,442,810,000 out of the room, but they carry
              ₦9.4bn. The schedule is where the exact number belongs. */}
          <Tile label="Total investment" value={formatNaira(totalCost, true)} />
          <Tile
            label="High priority"
            value={formatNaira(highPriorityCost, true)}
            note={`${highPriority.length} of ${scope.investments.length} line items`}
          />
          <Tile label="Facilities in scope" value={formatCount(scope.facilityCount)} />
          <Tile
            label="Per facility, average"
            value={
              scope.facilityCount
                ? formatNaira(Math.round(totalCost / scope.facilityCount))
                : '—'
            }
          />
        </TileRow>

        <SectionCard
          title="What is being invested against"
          subtitle="Quantities below are counts of facilities that failed the reading behind each line"
        >
          <DistributionBar
            distribution={scope.distribution}
            scored={scope.facilityCount}
          />
        </SectionCard>

        <SectionCard
          id="schedule"
          title="Itemised schedule"
          subtitle="Ordered by total cost"
          bodyClassName="p-0"
        >
          {scope.investments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="th">Item</th>
                    <th className="th">Domain</th>
                    <th className="th">Priority</th>
                    <th className="th text-right">Facilities</th>
                    <th className="th text-right">Unit</th>
                    <th className="th text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {scope.investments.map((item) => (
                    <InvestmentRow key={item.id} item={item} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="td font-semibold text-foreground" colSpan={5}>
                      Total
                    </td>
                    <td className="mono td text-right font-semibold text-foreground">
                      {formatNaira(totalCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Nothing to cost"
              message="No facilities in this scope triggered an investment line."
            />
          )}
        </SectionCard>

        <SectionCard
          id="waves"
          title="Rollout waves"
          subtitle="Which states go first, and why"
        >
          <div className="grid gap-px border border-border bg-border md:grid-cols-3">
            {waves.map(({ wave, states: waveStates }) => {
              const facilityCount = waveStates.reduce((sum, s) => sum + s.facilityCount, 0);
              const cost = waveStates.reduce((sum, s) => sum + (s.deployment?.costNGN ?? 0), 0);
              return (
                <div key={wave} className="bg-surface p-4">
                  <p className="eyebrow">
                    Wave {wave} · {waveStates[0]?.deployment?.startQuarter}
                  </p>
                  <p className="mono mt-2 text-[25px] font-semibold leading-none tracking-tight text-foreground">
                    {formatCount(facilityCount)}
                    <span className="ml-1.5 text-xs font-medium tracking-normal text-muted-foreground">
                      facilities
                    </span>
                  </p>
                  <p className="mono mt-1.5 text-[11px] text-muted-foreground">
                    {formatNaira(cost, true)}
                  </p>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                    {WAVE_NOTE[wave]}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {waveStates.map((s) => (
                      <li
                        key={s.id}
                        className="mono rounded-[2px] border border-border px-1.5 py-0.5 text-[10.5px] text-foreground"
                      >
                        {s.name}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function InvestmentRow({ item }: { item: InvestmentItem }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="td text-foreground">{item.label}</td>
      <td className="td">{THEME_BY_ID[item.themeId]?.shortLabel ?? item.themeId}</td>
      <td className="td">
        <Badge tone={PRIORITY_TONE[item.priority]}>{item.priority}</Badge>
      </td>
      <td className="mono td text-right">{formatCount(item.quantity)}</td>
      <td className="mono td text-right">
        {item.unitCostNGN != null ? formatNaira(item.unitCostNGN) : '—'}
      </td>
      <td className="mono td text-right text-foreground">
        {item.totalCostNGN != null ? formatNaira(item.totalCostNGN) : '—'}
      </td>
    </tr>
  );
}
