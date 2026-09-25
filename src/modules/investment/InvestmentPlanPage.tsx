import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PAGE_GUIDES } from '@/content/pageGuides';
import { FilterBar } from '@/components/filters/FilterBar';
import {
  EmptyState,
  LoadError,
  SectionCard,
  Tile,
  TileRow,
} from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilterStore } from '@/store/filterStore';
import { aggregateAreaProfiles } from '@/lib/areaProfile';
import {
  HORIZON_CLASSES,
  HORIZON_PHASES,
  HORIZON_WHEN,
  PHASE_LABEL,
  URGENCY_MARKER,
} from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, formatShare, formatUnits } from '@/lib/format';
import { HORIZONS, HORIZON_SHORT } from '@/lib/gapCatalogue';
import { THEME_BY_ID } from '@/lib/themes';
import type { AreaProfile, Horizon, InvestmentItem, ThemeId, WaveId } from '@/lib/types';
import { ExplainScope } from '@/modules/explain/context';
import { ExplainFigures } from '@/modules/explain/explain';
import { CostByReadinessSection } from './CostByReadinessSection';
import { ScenarioSection } from './scenario/ScenarioSection';

/**
 * Investment Plan — what deploying will take, itemised.
 *
 * Every line here is triggered by a *failed* reading, not by a wish list: an
 * item appears because some number of facilities were banded at or below its
 * trigger, and the quantity is that count. That is the discipline the page has
 * to keep — a costed plan whose quantities are not traceable to a finding is a
 * budget, not a plan.
 *
 * Costs come from the assessment's own indicative pricing. They are plain
 * naira rather than the sibling dashboard's deliberate blanks, because a page
 * about money with no money on it demonstrates nothing.
 *
 * NOTE: the editorial direction for this page is still open — in particular
 * whether it leads with the costed interventions or with the rollout waves. Both
 * are here; the ordering is the open question.
 */

/**
 * "Schedule" is gone from both of these on purpose. In cost practice it does
 * mean an itemised priced list — a schedule of rates, a schedule of quantities
 * — but this section sits directly above Rollout waves, which is a real
 * calendar with real quarters in it. Two neighbours, one called Schedule and
 * one made of dates, and the reader guesses wrong every time. So the section
 * is named for its unit instead: interventions, which is also the source's own
 * word for them.
 */
const SECTIONS = [
  { id: 'cost-by-readiness', label: 'By readiness' },
  { id: 'interventions', label: 'Interventions' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'waves', label: 'Rollout waves' },
];

/**
 * The axes a costed plan is read along, plus the flat list.
 *
 * Phase and Urgency are related axes, and both are here on purpose.
 * **Phase** is the budgeting question — Before deployment is one cheque,
 * whatever separates Major from Minor inside it, and it is the figure that
 * decides whether a go-live date is real. **Urgency** is the assessment's own
 * four levels, which is what you need once the phase total has been argued
 * about. They do not nest: Minor spans two phases, tablets before go-live and
 * sockets during it. Phase leads because it answers the first question.
 *
 * **Domain** is a genuinely different axis: not when the money is spent but
 * who spends it. It does not nest inside either of the others — nationally
 * every priced line is Technical Infrastructure, and the other three domains'
 * lines are all ₦0 or unpriced — so a two-level tree would spend most of its
 * depth on one branch whichever way it were built. Hence a switch.
 */
type GroupMode = 'phase' | 'urgency' | 'domain' | 'cost';

const GROUP_MODES: { id: GroupMode; label: string }[] = [
  { id: 'phase', label: 'Phase' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'domain', label: 'Domain' },
  { id: 'cost', label: 'Cost' },
];

/**
 * The subtitle is fixed, and it states provenance rather than grouping.
 *
 * It used to restate the grouping — "Grouped by deployment phase" sitting an
 * inch from a pressed button reading PHASE, which is the same sentence twice
 * and the less precise of the two. The claim worth spending the line on is the
 * one a reader cannot see from the controls: every quantity in this table is a
 * count of facilities that failed a reading, so no line here is a wish.
 */
const INTERVENTIONS_SUBTITLE =
  'Every line is an action the assessment prescribes \u2014 the quantity is what the facilities that triggered it need';

type ColumnId = 'item' | 'domain' | 'urgency' | 'facilities' | 'quantity' | 'unit' | 'total';

/** The grouping key leaves the row: it is stated once on the group header
 *  instead of repeated down a column that cannot vary within the group. */
const COLUMNS: Record<GroupMode, ColumnId[]> = {
  // Urgency *stays* a column under Phase, and that is the point of the view:
  // a phase is a merge of urgencies, so the reader has to be able to see which
  // ones the subtotal is made of without switching away.
  phase: ['item', 'domain', 'urgency', 'facilities', 'quantity', 'unit', 'total'],
  urgency: ['item', 'domain', 'facilities', 'quantity', 'unit', 'total'],
  domain: ['item', 'urgency', 'facilities', 'quantity', 'unit', 'total'],
  cost: ['item', 'domain', 'urgency', 'facilities', 'quantity', 'unit', 'total'],
};

const COLUMN_LABEL: Record<ColumnId, string> = {
  item: 'Item',
  domain: 'Domain',
  urgency: 'Urgency',
  facilities: 'Facilities',
  quantity: 'Quantity',
  unit: 'Unit cost',
  total: 'Total',
};

const NUMERIC: ReadonlySet<ColumnId> = new Set<ColumnId>([
  'facilities',
  'quantity',
  'unit',
  'total',
]);

const WAVE_NOTE: Record<WaveId, string> = {
  1: 'States with the readiest facilities. Deploy while the plan is still being written for the rest.',
  2: 'Targeted intervention first — the gaps are real but not foundational.',
  3: 'Foundational investment before any deployment date is meaningful.',
};

interface Group {
  key: string;
  /** What the group is. Null for the flat view, which is one unlabelled group
   *  and therefore gets neither a header nor a subtotal. */
  heading: { marker?: string; label: string; note: string; className?: string } | null;
  items: InvestmentItem[];
  /** Summed below the lines, not stated above them — see `GroupSubtotal`. The
   *  group's *share* of the plan stays up on the heading: it sizes the group
   *  before the reader commits to reading it, which is a header's job. */
  cost: number;
  /** Lines in this group the sheet does not price. The subtotal is silent
   *  about them, so the subtotal row says how many it is silent about. */
  unpriced: number;
}

/** Cost-descending, unpriced lines last, ties broken by label so the order is
 *  stable across scopes. Applied inside every group and to the flat view, so
 *  "the expensive thing is at the top" holds wherever the reader is. */
function byCost(a: InvestmentItem, b: InvestmentItem) {
  return (b.totalCostNGN ?? -1) - (a.totalCostNGN ?? -1) || a.label.localeCompare(b.label);
}

function summarise(items: InvestmentItem[]) {
  return {
    cost: items.reduce((sum, i) => sum + (i.totalCostNGN ?? 0), 0),
    unpriced: items.filter((i) => i.totalCostNGN == null).length,
  };
}

function buildGroups(items: InvestmentItem[], mode: GroupMode, total: number): Group[] {
  if (mode === 'cost') {
    const { cost, unpriced } = summarise(items);
    return [
      {
        key: 'all',
        heading: null,
        items: [...items].sort(byCost),
        cost,
        unpriced,
      },
    ];
  }

  if (mode === 'phase') {
    // Chronological, and every phase that has lines is shown. No marker on the
    // heading: the urgency markers are per-urgency, and putting one on a group
    // that merges several would claim the whole phase was Major.
    return HORIZON_PHASES.map((phase) => {
      const inGroup = items.filter((i) => i.phase === phase).sort(byCost);
      const { cost, unpriced } = summarise(inGroup);
      // Which urgencies are actually in here, worst-first. Named so a reader
      // sees that Before deployment is Major, Moderate *and* Minor before they
      // go looking for the split.
      const made = HORIZONS.filter((h) => inGroup.some((i) => i.horizon === h)).map(
        (h) => HORIZON_SHORT[h],
      );
      const named =
        made.length > 1 ? `${made.slice(0, -1).join(', ')} and ${made[made.length - 1]}` : made[0];
      return {
        key: phase,
        heading: {
          label: PHASE_LABEL[phase],
          note: `${named} · ${inGroup.length} ${inGroup.length === 1 ? 'line' : 'lines'} · ${formatShare(cost, total)} of the plan`,
        },
        items: inGroup,
        cost,
        unpriced,
      };
    }).filter((g) => g.items.length);
  }

  if (mode === 'urgency') {
    // Fixed worst-first order, not cost order. The sequence *is* the reading:
    // a group that falls empty under a filter drops out, but the ones that
    // remain stay in the order the work has to be done in.
    return HORIZONS.map((h) => {
      const inGroup = items.filter((i) => i.horizon === h).sort(byCost);
      const { cost, unpriced } = summarise(inGroup);
      return {
        key: h,
        heading: {
          marker: URGENCY_MARKER[h],
          label: HORIZON_SHORT[h],
          note: `${HORIZON_WHEN[h]} · ${inGroup.length} ${inGroup.length === 1 ? 'line' : 'lines'} · ${formatShare(cost, total)} of the plan`,
          className: HORIZON_CLASSES[h].text,
        },
        items: inGroup,
        cost,
        unpriced,
      };
    }).filter((g) => g.items.length);
  }

  // Domain, biggest spend first. Unlike urgency there is no inherent order to
  // preserve here — the question this view answers is which domain the money
  // is in, so the answer leads.
  const ids = [...new Set(items.map((i) => i.themeId))];
  return ids
    .map((id) => {
      const inGroup = items.filter((i) => i.themeId === id).sort(byCost);
      const { cost, unpriced } = summarise(inGroup);
      return {
        key: id,
        heading: {
          label: THEME_BY_ID[id as ThemeId]?.label ?? id,
          note: `${inGroup.length} ${inGroup.length === 1 ? 'line' : 'lines'} · ${formatShare(cost, total)} of the plan`,
        },
        items: inGroup,
        cost,
        unpriced,
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

export default function InvestmentPlanPage() {
  const { states, facilities, national } = useDataContext();
  const selectedStates = useFilterStore((s) => s.states);
  const [groupMode, setGroupMode] = useState<GroupMode>('phase');

  /** Scope: the selected states, or the whole country when nothing is picked.
   *  The national profile is used verbatim for "everywhere" rather than
   *  re-summed from the states, so the unfiltered page and the dataset agree by
   *  construction. */
  const scope = useMemo(() => {
    if (!selectedStates.length) {
      return {
        name: 'All 12 assessed states',
        facilityCount: national.data?.facilityCount ?? 0,
        distribution: national.data?.deploymentDistribution ?? {
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
      distribution: agg.deploymentDistribution,
      investments: agg.investments,
    };
  }, [selectedStates, states.data, national.data]);

  /** Where the reader is, for "Explain" on the sections. */
  const explainScope = useMemo(() => [`Area: ${scope.name}`], [scope.name]);

  /** The facilities the scenarios re-run over: the selected states, or all. */
  const scopedFacilities = useMemo(
    () =>
      selectedStates.length
        ? facilities.data.filter((f) => selectedStates.includes(f.state))
        : facilities.data,
    [facilities.data, selectedStates],
  );

  const totalCost = scope.investments.reduce((sum, i) => sum + (i.totalCostNGN ?? 0), 0);
  const unpriced = scope.investments.filter((i) => i.totalCostNGN == null);
  const unpricedLines = unpriced.length;
  /**
   * Facilities, not lines — because one line can be thousands of them.
   *
   * Routine device maintenance alone is unpriced at over two thousand
   * facilities, and every one of them rolls up into a single line. "One line
   * carries no indicative price" is true and reads like a rounding note; the
   * facilities behind it are what say how much of the plan the total is silent
   * about.
   */
  const unpricedActions = unpriced.reduce((sum, i) => sum + i.facilityCount, 0);
  /**
   * Lines the source prices at a real ₦0, which is a different claim from an
   * unpriced one and now a common one: workforce, workflow and data-use actions
   * cost nothing at facility level in the revised model. Said out loud so a
   * column of ₦0s reads as a decision rather than as missing data.
   */
  const freeLines = scope.investments.filter((i) => i.totalCostNGN === 0).length;

  const groups = useMemo(
    () => buildGroups(scope.investments, groupMode, totalCost),
    [scope.investments, groupMode, totalCost],
  );

  const columns = COLUMNS[groupMode];

  const waves = useMemo(() => {
    const byWave = new Map<WaveId, AreaProfile[]>();
    for (const s of states.data) {
      // A wave is a state's alone. Every area now carries a deployment plan —
      // LGAs and the nation included — so the plan being present no longer
      // implies a wave to file it under.
      const wave = s.deployment?.wave;
      if (!wave) continue;
      if (selectedStates.length && !selectedStates.includes(s.name)) continue;
      const list = byWave.get(wave) ?? [];
      list.push(s);
      byWave.set(wave, list);
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
        guide={PAGE_GUIDES.investment}
        subtitle={scope.name}
        sections={SECTIONS}
      >
        <FilterBar facilities={facilities.data} show={['state']} />
      </PageHeader>

      <ExplainScope value={explainScope}>
        <div className="space-y-4 p-4 sm:p-5">
          {/* The page's answer, on its own: what deploying will cost. The
            sections below divide it up — by readiness, by line, by what it
            buys — so the header does not repeat them. Compact here, exact in
            the schedule: nobody carries ₦9,442,810,000 out of the room, but
            they carry ₦9.4bn. */}
          <TileRow>
            <Tile
              lead
              label="Total investment"
              value={formatNaira(totalCost, true)}
              count={{ to: totalCost, format: (n) => formatNaira(n, true) }}
            />
          </TileRow>

          <CostByReadinessSection facilities={scopedFacilities} />

          <SectionCard
            id="interventions"
            title="Costed interventions"
            subtitle={INTERVENTIONS_SUBTITLE}
            action={<GroupSwitch value={groupMode} onChange={setGroupMode} />}
            bodyClassName="p-0"
            explain="investment-interventions"
          >
            <ExplainFigures
              id="interventions"
              build={() =>
                scope.investments.length
                  ? [
                      {
                        title: `Lines grouped by ${GROUP_MODES.find((m) => m.id === groupMode)?.label.toLowerCase()}, costliest first in each group`,
                        columns: ['Group', 'Item', 'Urgency', 'Facilities', 'Total cost'],
                        rows: groups.flatMap((g) => [
                          ...g.items.map((i) => [
                            g.heading?.label ?? 'All lines',
                            i.label,
                            HORIZON_SHORT[i.horizon],
                            formatCount(i.facilityCount),
                            i.totalCostNGN == null ? 'unpriced' : formatNaira(i.totalCostNGN, true),
                          ]),
                          ...(g.heading
                            ? [
                                [
                                  g.heading.label,
                                  'Subtotal',
                                  '',
                                  '',
                                  `${formatNaira(g.cost, true)} (${formatShare(g.cost, totalCost)} of the plan)`,
                                ],
                              ]
                            : []),
                        ]),
                      },
                      {
                        title: 'Plan',
                        columns: ['Measure', 'Value'],
                        rows: [
                          ['Total', formatNaira(totalCost, true)],
                          ['Lines', formatCount(scope.investments.length)],
                          ['Unpriced lines (left out of the total)', formatCount(unpricedLines)],
                          ['Facilities on unpriced lines', formatCount(unpricedActions)],
                          ['Lines costed at ₦0', formatCount(freeLines)],
                        ],
                      },
                    ]
                  : null
              }
            />
            {scope.investments.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-prose">
                    <thead>
                      <tr className="border-b border-border text-left">
                        {columns.map((c) => (
                          <th key={c} className={cn('th', NUMERIC.has(c) && 'text-right')}>
                            {COLUMN_LABEL[c]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {groups.map((group) => (
                      <tbody key={group.key}>
                        {group.heading && (
                          <GroupHeader heading={group.heading} span={columns.length} />
                        )}
                        {group.items.map((item) => (
                          <InvestmentRow key={item.id} item={item} columns={columns} />
                        ))}
                        {group.heading && (
                          <GroupSubtotal
                            label={group.heading.label}
                            cost={group.cost}
                            unpriced={group.unpriced}
                            span={columns.length - 1}
                          />
                        )}
                      </tbody>
                    ))}
                    {/* The closing sum.
                      Right-aligned against its figure, like every group
                      subtotal above it — it used to sit flush left at the far
                      edge of the table, which left the one row that sums all
                      the others as the only one whose label was nowhere near
                      its number.
                      Ranked above the subtotals by a double rule and by the
                      mono caps, which mirror the column heads: the foot reads
                      as the head's counterpart rather than as one more
                      subtotal in a longer stack. */}
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td
                          className="mono td py-3 text-right text-note font-bold uppercase tracking-[0.09em] text-foreground"
                          colSpan={columns.length - 1}
                        >
                          {/* "Grand total" only where there are subtotals for it
                            to be grand *of*. The flat Cost view has none, and
                            calling its single sum grand would imply a
                            hierarchy the reader cannot see. */}
                          {groupMode === 'cost' ? 'Total' : 'Grand total'}
                        </td>
                        <td className="mono td py-3 text-right font-bold text-foreground">
                          {formatNaira(totalCost)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {unpricedLines > 0 && (
                  /* The total is not the whole plan, and says so where the total
                   is. `formatNaira` renders an unpriced line as an em dash in
                   its own row, but a reader adding the column up has no way to
                   know the sum is short without being told here. */
                  <p className="border-t border-border px-3 py-2 text-note text-muted-foreground">
                    {unpricedLines === 1 ? 'One line carries' : `${formatCount(unpricedLines)} lines carry`}{' '}
                    no indicative price in the source, across {formatCount(unpricedActions)}{' '}
                    {unpricedActions === 1 ? 'facility' : 'facilities'}. The totals above
                    exclude {unpricedLines === 1 ? 'it' : 'them'}.
                  </p>
                )}
                {freeLines > 0 && (
                  /* Distinct from the note above it, and the distinction is the
                   point: those lines have no price, these have a price of
                   nothing. Under the revised costing model that is two whole
                   domains, so a reader scanning a column of ₦0s needs to know
                   the source put them there. */
                  <p className="border-t border-border px-3 py-2 text-note text-muted-foreground">
                    {formatCount(freeLines)} of {formatCount(scope.investments.length)} lines are
                    costed at ₦0 in the source — recorded work that carries no facility-level
                    cost, not missing data.
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                title="Nothing to cost"
                message="No facilities in this scope triggered an investment line."
              />
            )}
          </SectionCard>

          <ScenarioSection facilities={scopedFacilities} />

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
                    <p className="mono mt-2 text-figure-sm font-semibold leading-none tracking-tight text-foreground">
                      {formatCount(facilityCount)}
                      <span className="ml-1.5 text-body font-medium tracking-normal text-muted-foreground">
                        facilities
                      </span>
                    </p>
                    <p className="mono mt-1.5 text-note text-muted-foreground">
                      {formatNaira(cost, true)}
                    </p>
                    <p className="mt-3 text-body leading-relaxed text-muted-foreground">
                      {WAVE_NOTE[wave]}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {waveStates.map((s) => (
                        <li
                          key={s.id}
                          className="mono rounded-[2px] border border-border px-1.5 py-0.5 text-note text-foreground"
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
      </ExplainScope>
    </>
  );
}

/**
 * Grouping switch. Grouping only — sorting inside a group is always
 * cost-descending, so changing the view never changes which line is at the top
 * of the one you are looking at.
 *
 * Buttons rather than a `<select>`: three options that a reader is meant to
 * flip between and compare, where the cost of a click is the whole point.
 * `aria-pressed` rather than a tablist, for the same reason `SectionTabs` is
 * not one — nothing is being shown and hidden, the same rows are being
 * re-ordered.
 */
function GroupSwitch({
  value,
  onChange,
}: {
  value: GroupMode;
  onChange: (mode: GroupMode) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow hidden sm:inline">Group by</span>
      <div className="flex items-center gap-px rounded-[3px] border border-border bg-border">
        {GROUP_MODES.map((mode) => {
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

/**
 * A group's opening band: what the group is, and how many lines are under it.
 *
 * No money here. A subtotal stated above the lines it sums is an assertion the
 * reader has to take on trust and then verify downwards; stated after them it
 * is the arithmetic closing, which is how every costed schedule on paper is
 * read and how the grand total in the `tfoot` already works. So the header
 * names the group and `GroupSubtotal` adds it up.
 */
function GroupHeader({
  heading,
  span,
}: {
  heading: NonNullable<Group['heading']>;
  span: number;
}) {
  return (
    <tr className="border-b border-border bg-muted/40">
      <td className="td" colSpan={span}>
        <span
          className={cn(
            'mono text-note font-bold uppercase tracking-[0.07em]',
            heading.className ?? 'text-foreground',
          )}
        >
          {heading.marker && (
            <span aria-hidden className="mr-1">
              {heading.marker}
            </span>
          )}
          {heading.label}
        </span>
        <span className="ml-2 text-note text-muted-foreground">{heading.note}</span>
      </td>
    </tr>
  );
}

/**
 * The group's arithmetic, closing the group.
 *
 * Set in full naira rather than compacted, in the Total column: it is summing
 * the exact figures immediately above it, and a ₦6.1bn sitting under a stack
 * of ten-digit numbers cannot be checked against them.
 *
 * The row carries the sum and nothing else. The group's share of the plan is
 * up on the heading with the line count, where it sizes the group before the
 * reader starts on it; repeating it here would put a second number in the
 * money column that is not money.
 *
 * Ruled above and not below — the rule is the sum bar, and the next group's
 * filled header is what ends the block.
 */
function GroupSubtotal({
  label,
  cost,
  unpriced,
  span,
}: {
  label: string;
  cost: number;
  unpriced: number;
  span: number;
}) {
  return (
    <tr className="border-t border-border">
      <td className="td text-right" colSpan={span}>
        <span className="font-semibold text-foreground">{label} subtotal</span>
      </td>
      <td className="mono td text-right font-semibold text-foreground">
        {formatNaira(cost)}
        {unpriced > 0 && (
          <span
            className="font-normal text-muted-foreground"
            title={`${unpriced} unpriced ${unpriced === 1 ? 'line' : 'lines'} excluded`}
          >
            +
          </span>
        )}
      </td>
    </tr>
  );
}

function InvestmentRow({ item, columns }: { item: InvestmentItem; columns: ColumnId[] }) {
  return (
    <tr className="border-b border-border last:border-0">
      {columns.map((c) => {
        switch (c) {
          case 'item':
            return (
              <td key={c} className="td text-foreground">
                {item.label}
              </td>
            );
          case 'domain':
            return (
              <td key={c} className="td">
                {THEME_BY_ID[item.themeId]?.shortLabel ?? item.themeId}
              </td>
            );
          case 'urgency':
            return (
              <td key={c} className="td">
                <UrgencyChip horizon={item.horizon} />
              </td>
            );
          case 'facilities':
            return (
              <td key={c} className="mono td text-right">
                {formatCount(item.facilityCount)}
              </td>
            );
          case 'quantity':
            return (
              /* Units where the action is bought by the unit — "5,920 tablets" —
                 and the facility count again where it is one per facility, so
                 Quantity × Unit cost = Total holds on every row. */
              <td key={c} className="mono td whitespace-nowrap text-right">
                {formatUnits(item.quantity, item.unit ?? 'facility')}
              </td>
            );
          case 'unit':
            return (
              <td key={c} className="mono td whitespace-nowrap text-right">
                {item.unitCostNGN != null ? formatNaira(item.unitCostNGN) : '—'}
              </td>
            );
          case 'total':
            return (
              /* A dash was unambiguous while every priced line carried a
                 figure. The revised model fills this column with real ₦0s, so a
                 dash beside them now reads as another kind of zero. The word
                 cannot be misread. */
              <td key={c} className="mono td text-right text-foreground">
                {item.totalCostNGN != null ? (
                  formatNaira(item.totalCostNGN)
                ) : (
                  <span className="text-muted-foreground">unpriced</span>
                )}
              </td>
            );
        }
      })}
    </tr>
  );
}

/** Shape, then word, then colour — the same three carriers the gap tree uses,
 *  so a reader who has learned the urgency scale on Assessed States meets it
 *  unchanged here. */
function UrgencyChip({ horizon }: { horizon: Horizon }) {
  return (
    <span
      className={cn(
        'mono whitespace-nowrap text-tick font-semibold uppercase tracking-[0.06em]',
        HORIZON_CLASSES[horizon].text,
      )}
    >
      <span aria-hidden className="mr-1">
        {URGENCY_MARKER[horizon]}
      </span>
      {HORIZON_SHORT[horizon]}
    </span>
  );
}
