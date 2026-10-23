import { useState } from 'react';
import { SectionCard, TileRow } from '@/components/ui';
import { ExplainFigures } from '@/modules/explain/explain';
import { cn } from '@/lib/cn';
import type { ChartId } from '@/lib/explain/charts';
import type { DeploymentSection, OverviewLine, OverviewPart } from '@/lib/deploymentCost';
import { DEPLOYMENT_COSTS } from '@/lib/deploymentCosts';
import { formatNaira, formatShare, formatUnits } from '@/lib/format';
import { useCountUp } from '@/hooks/useCountUp';

/**
 * The Investment Plan's parts, after the ERA team's costing slides:
 *
 * 1. **Cost overview** — the whole cost in five lines (slide 1).
 * 2. **Fixes** — remediating the gaps the assessment found (slide 2).
 * 3. **Train and deploy** — the state training package and deployment
 *    validation (slide 3).
 * 4. **Operations and TA** — a year of routine operations and state technical
 *    assistance (slide 4).
 *
 * Parts 2–4 each open with their own total, so a reader can take one part's
 * figure out of the room without adding anything up.
 */

const INFLATION = `${(DEPLOYMENT_COSTS.inflationRate * 100).toFixed(2)}%`;

/** The overview's grouping, in the slide's order and words. */
const OVERVIEW_GROUPS: { label: string; part: OverviewPart; ids: string[] }[] = [
  { label: 'Fix gaps', part: 'fixes', ids: ['fixes'] },
  {
    label: 'Training & deployment',
    part: 'train-deploy',
    ids: ['training', 'validation'],
  },
  {
    label: 'Routine operations & TA support',
    part: 'operations',
    ids: ['operations', 'ta'],
  },
];

/**
 * One part of the plan: a heading, the part's own total and its supporting
 * figures, then the cards that itemise it.
 *
 * The wrapper carries the section-tab anchor, so a tab lands on the part's
 * heading rather than on whichever card happens to come first in it.
 */
export function PlanPart({
  id,
  title,
  subtitle,
  tiles,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  tiles: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div id={id} data-section="" className="space-y-4">
      {/* Pinned under the page header for as long as the part is on screen, so
          a reader deep in a long table still knows whose lines they are. Sticky
          is bounded by this wrapper, which is what hands the slot to the next
          part's heading as it arrives. Opaque, or the rows show through it;
          z-20 sits over the panels and under the page header's z-30. */}
      <div className="sticky top-[var(--page-header-h,52px)] z-20 border-b-2 border-foreground bg-page pb-2 pt-2">
        <h2 className="text-title font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-body text-muted-foreground">{subtitle}</p>
      </div>
      <TileRow className="grid-cols-1 sm:grid-cols-3">{tiles}</TileRow>
      {children}
    </div>
  );
}

/** Each part's colour, on the ring and on its swatch in the breakdown. */
const PART_COLOR: Record<OverviewPart, string> = {
  fixes: 'hsl(var(--part-fixes))',
  'train-deploy': 'hsl(var(--part-deploy))',
  operations: 'hsl(var(--part-operations))',
};

/**
 * The whole cost as a ring, the three parts as its segments, the total in the
 * hole — and beneath it the breakdown that names them.
 *
 * Three parts, not the five lines: technical assistance is a fraction of a
 * percent, and a ring cut five ways would give it a sliver nobody could point
 * at. The parts are what the page is built from, so the ring answers "where
 * is the money" at the level the reader then scrolls to; the lines inside each
 * part are listed under it, exact.
 *
 * The two halves share one hover: point at a segment or at a part's column
 * and both light it, and the hole swaps the total for that part's figure and
 * share. That swap is the readout — there is no separate tooltip to chase.
 */
export function CostOverviewSection({ lines }: { lines: OverviewLine[] }) {
  const total = lines.reduce((sum, l) => sum + l.totalNGN, 0);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const parts = OVERVIEW_GROUPS.map((g) => ({
    ...g,
    lines: g.ids.map((id) => byId.get(id)!),
    totalNGN: g.ids.reduce((sum, id) => sum + (byId.get(id)?.totalNGN ?? 0), 0),
  }));
  const [active, setActive] = useState<OverviewPart | null>(null);
  const counted = useCountUp(total);
  const focus = parts.find((p) => p.part === active);

  return (
    <SectionCard
      id="overview"
      title="Cost overview"
      subtitle="What it takes to fix the gaps, deploy the EMR and run it for a year"
      bodyClassName="p-0"
      explain="investment-overview"
    >
      <ExplainFigures
        id="overview"
        build={() => [
          {
            title: 'The whole cost',
            columns: ['Group', 'Component', 'Cost', 'Prices'],
            rows: [
              ...OVERVIEW_GROUPS.flatMap((g) =>
                g.ids.map((id) => {
                  const l = byId.get(id)!;
                  return [
                    g.label,
                    l.label,
                    formatNaira(l.totalNGN, true),
                    l.inflated ? `2027, with ${INFLATION} inflation` : 'Base',
                  ];
                }),
              ),
              ['', 'Total', formatNaira(total, true), ''],
            ],
          },
        ]}
      />
      {/* The ring leads: centred, and the largest thing in the section, since
          the split of the money is what the section is for. The parts sit
          under it as three columns in the ring's own order, left to right. */}
      <div className="flex justify-center px-4 pb-2 pt-6 md:pt-8">
        <div className="relative aspect-square w-[260px] sm:w-[320px]">
          <CostRing parts={parts} total={total} active={active} onActive={setActive} />
          {/* The hole. Not live-announced: the columns below say the same
              thing in words, and a ring narrating every hover would be noise. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-14 text-center">
            <span className="mono text-tick uppercase tracking-[0.11em] text-muted-foreground">
              {focus ? focus.label : 'Total investment'}
            </span>
            <span className="mono mt-1.5 text-figure-sm font-semibold tabular-nums text-foreground sm:text-figure">
              {formatNaira(focus ? focus.totalNGN : counted, true)}
            </span>
            <span className="mt-1 text-body text-muted-foreground">
              {focus ? `${formatShare(focus.totalNGN, total)} of the total` : 'One-time and first year'}
            </span>
          </div>
        </div>
      </div>

      <ol className="grid divide-y divide-border border-t border-border md:mt-4 md:grid-cols-3 md:divide-x md:divide-y-0">
        {parts.map((p) => (
          <li
            key={p.part}
            onMouseEnter={() => setActive(p.part)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              'px-4 py-4 transition-opacity md:px-5',
              active && active !== p.part && 'opacity-45',
            )}
          >
            <a
              href={`#${p.part}`}
              onFocus={() => setActive(p.part)}
              onBlur={() => setActive(null)}
              className="group block rounded-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-[3px]"
                  style={{ background: PART_COLOR[p.part] }}
                />
                <span className="text-prose font-semibold text-foreground group-hover:underline">
                  {p.label}
                </span>
              </span>
              <span className="mt-1.5 flex items-baseline gap-2">
                <span className="mono text-figure-sm font-semibold tabular-nums text-foreground">
                  {formatNaira(p.totalNGN, true)}
                </span>
                <span className="mono text-prose font-bold tabular-nums text-muted-foreground">
                  {formatShare(p.totalNGN, total)}
                </span>
              </span>
            </a>
            <ul className="mt-3 space-y-2">
              {p.lines.map((l) => (
                <li key={l.id}>
                  {/* A lone line is the part — Fix gaps under Fix gaps — so
                      its name and figure would only repeat the heading. */}
                  {p.lines.length > 1 && (
                    <span className="flex items-baseline gap-2">
                      <span className="text-body font-semibold text-foreground">{l.label}</span>
                      <span className="mono ml-auto whitespace-nowrap text-body font-bold tabular-nums text-foreground">
                        {formatNaira(l.totalNGN, true)}
                      </span>
                    </span>
                  )}
                  <p className="text-body leading-snug text-muted-foreground">
                    {l.description}
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="border-t border-border px-4 py-2.5 text-body text-muted-foreground md:px-5">
        Training and operations at 2027 prices, with {INFLATION} inflation. Fixes, validation
        and TA at base prices.
      </p>
    </SectionCard>
  );
}

/** The ring's geometry, in its own 200-unit box. */
const RING = { size: 200, outer: 98, inner: 70 };

function CostRing({
  parts,
  total,
  active,
  onActive,
}: {
  parts: { part: OverviewPart; label: string; totalNGN: number }[];
  total: number;
  active: OverviewPart | null;
  onActive: (part: OverviewPart | null) => void;
}) {
  const c = RING.size / 2;
  const shown = parts.filter((p) => p.totalNGN > 0);
  /** Clockwise from twelve o'clock, in the parts' own order — fixes, then
   *  deploying, then running — so the ring reads in the order the money is
   *  spent. */
  let start = 0;

  return (
    <svg
      viewBox={`0 0 ${RING.size} ${RING.size}`}
      className="h-full w-full"
      role="img"
      aria-label={`Total ${formatNaira(total, true)}: ${shown
        .map((p) => `${p.label} ${formatShare(p.totalNGN, total)}`)
        .join(', ')}`}
    >
      <circle
        cx={c}
        cy={c}
        r={(RING.outer + RING.inner) / 2}
        fill="none"
        className="stroke-surface-sunk"
        strokeWidth={RING.outer - RING.inner}
      />
      {total > 0 &&
        shown.map((p) => {
          const from = start;
          const to = start + p.totalNGN / total;
          start = to;
          return (
            <path
              key={p.part}
              d={shown.length === 1 ? fullRing(c) : segment(c, from, to)}
              fill={PART_COLOR[p.part]}
              fillRule="evenodd"
              // The 2px gap between segments is the surface showing through
              // a stroke, not a trimmed angle, so a thin segment keeps its
              // full share of the ring.
              className="stroke-surface transition-opacity"
              strokeWidth={2}
              strokeLinejoin="round"
              opacity={active && active !== p.part ? 0.3 : 1}
              onMouseEnter={() => onActive(p.part)}
              onMouseLeave={() => onActive(null)}
            />
          );
        })}
    </svg>
  );
}

/** A point on the circle of radius `r`, `t` of the way round from twelve
 *  o'clock. */
function at(c: number, r: number, t: number) {
  const a = 2 * Math.PI * t - Math.PI / 2;
  return `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`;
}

/** The band of the ring from `from` to `to`, both fractions of a turn. */
function segment(c: number, from: number, to: number) {
  const large = to - from > 0.5 ? 1 : 0;
  const { outer: R, inner: r } = RING;
  return [
    `M${at(c, R, from)}`,
    `A${R},${R} 0 ${large} 1 ${at(c, R, to)}`,
    `L${at(c, r, to)}`,
    `A${r},${r} 0 ${large} 0 ${at(c, r, from)}`,
    'Z',
  ].join(' ');
}

/** The whole band, for a scope where one part is all of it — an arc cannot
 *  close on itself, so it is drawn as two circles and the even-odd hole. */
function fullRing(c: number) {
  const { outer: R, inner: r } = RING;
  const circle = (rad: number) =>
    `M${c - rad},${c} a${rad},${rad} 0 1 0 ${rad * 2},0 a${rad},${rad} 0 1 0 ${-rad * 2},0`;
  return `${circle(R)} ${circle(r)}`;
}

/**
 * A part's itemised costs, set out as the slides set them out: focus, item,
 * unit cost, quantity, total, who pays and what it covers, with a subtotal
 * under each focus and the total at the foot.
 */
export function DeploymentCostSection({
  id,
  title,
  subtitle,
  explain,
  section,
}: {
  id: string;
  title: string;
  subtitle: string;
  explain: ChartId;
  section: DeploymentSection;
}) {
  return (
    <SectionCard id={id} title={title} subtitle={subtitle} bodyClassName="p-0" explain={explain}>
      <ExplainFigures
        id={id}
        build={() => [
          {
            title,
            columns: ['Focus', 'Item', 'Unit cost', 'Quantity', 'Total', 'Responsible'],
            rows: [
              ...section.groups.flatMap((g) => [
                ...g.lines.map((l) => [
                  g.label,
                  l.label,
                  formatNaira(l.unitCostNGN),
                  formatUnits(l.quantity, l.unit),
                  formatNaira(l.totalNGN, true),
                  l.payer,
                ]),
                [g.label, 'Subtotal', '', '', formatNaira(g.totalNGN, true), ''],
              ]),
              ['', 'Total', '', '', formatNaira(section.totalNGN, true), ''],
            ],
          },
        ]}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-prose">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="th">Item</th>
              <th className="th text-right">Unit cost</th>
              <th className="th text-right">Quantity</th>
              <th className="th text-right">Total</th>
              <th className="th">Responsible</th>
              <th className="th">Remarks</th>
            </tr>
          </thead>
          {section.groups.map((g) => (
            <tbody key={g.id}>
              <tr className="border-b border-border bg-muted/40">
                <td
                  colSpan={6}
                  className="mono td text-note font-bold uppercase tracking-[0.07em] text-foreground"
                >
                  {g.label}
                  <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
                    {g.lines.length} {g.lines.length === 1 ? 'line' : 'lines'} ·{' '}
                    {formatShare(g.totalNGN, section.totalNGN)} of the part
                  </span>
                </td>
              </tr>
              {g.lines.map((l) => (
                <tr key={l.id} className="border-b border-border">
                  <td className="td text-foreground">{l.label}</td>
                  <td className="mono td whitespace-nowrap text-right">
                    {formatNaira(l.unitCostNGN)}
                  </td>
                  <td className="mono td whitespace-nowrap text-right">
                    {formatUnits(l.quantity, l.unit)}
                  </td>
                  <td className="mono td whitespace-nowrap text-right text-foreground">
                    {formatNaira(l.totalNGN)}
                  </td>
                  <td className="td whitespace-nowrap">{l.payer}</td>
                  <td className="td min-w-[16rem] text-muted-foreground">{l.remark}</td>
                </tr>
              ))}
              {/* Only where the focus has more than one line: a subtotal of
                  one line repeats the figure beside it. */}
              {g.lines.length > 1 && (
                <tr className="border-b border-border">
                  <td className="td" colSpan={3}>
                    <span className="font-semibold text-foreground">{g.label} subtotal</span>
                  </td>
                  <td className="mono td whitespace-nowrap text-right font-semibold text-foreground">
                    {formatNaira(g.totalNGN)}
                  </td>
                  <td className="td" colSpan={2} />
                </tr>
              )}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t-2 border-border">
              <td
                className="mono td py-3 text-note font-bold uppercase tracking-[0.09em] text-foreground"
                colSpan={3}
              >
                Total
              </td>
              <td className="mono td whitespace-nowrap py-3 text-right font-bold text-foreground">
                {formatNaira(section.totalNGN)}
              </td>
              <td className="td" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </SectionCard>
  );
}
