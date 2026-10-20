import { SectionCard, Tile, TileRow } from '@/components/ui';
import { ExplainFigures } from '@/modules/explain/explain';
import { cn } from '@/lib/cn';
import type { ChartId } from '@/lib/explain/charts';
import type { DeploymentSection, OverviewLine, OverviewPart } from '@/lib/deploymentCost';
import { DEPLOYMENT_COSTS } from '@/lib/deploymentCosts';
import { formatNaira, formatShare, formatUnits } from '@/lib/format';

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
    <div id={id} data-section="" className="space-y-4 pt-2">
      <div className="border-b-2 border-foreground pb-2">
        <h2 className="text-title font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-body text-muted-foreground">{subtitle}</p>
      </div>
      <TileRow className="grid-cols-1 sm:grid-cols-3">{tiles}</TileRow>
      {children}
    </div>
  );
}

/** Shared by the column heads and every row so the two cannot drift. */
const OVERVIEW_GRID =
  'md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_88px_minmax(0,1.7fr)] md:gap-x-4';

export function CostOverviewSection({ lines }: { lines: OverviewLine[] }) {
  const total = lines.reduce((sum, l) => sum + l.totalNGN, 0);
  const byId = new Map(lines.map((l) => [l.id, l]));
  /** Each bar starts where the one before it ended, so the bars read as the
   *  total being built up, as the slide draws it. */
  let start = 0;

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
      <div className="p-4">
        <TileRow>
          <Tile
            lead
            label="Total investment"
            value={formatNaira(total, true)}
            count={{ to: total, format: (n) => formatNaira(n, true) }}
            note={`Training and operations at 2027 prices, with ${INFLATION} inflation, as the five-year roadmap costs them`}
          />
        </TileRow>
      </div>

      <div
        className={cn(
          OVERVIEW_GRID,
          'mono hidden border-y border-border px-4 py-2 text-tick uppercase tracking-[0.07em] text-muted-foreground md:grid',
        )}
      >
        <span>Component</span>
        <span>Share of the total</span>
        <span className="text-right">Cost</span>
        <span>Description</span>
      </div>
      {OVERVIEW_GROUPS.map((g) => (
        <div key={g.label} className="border-b border-border last:border-0">
          <a
            href={`#${g.part}`}
            className="mono flex items-center gap-2 bg-muted/40 px-4 py-1.5 text-note font-bold uppercase tracking-[0.07em] text-foreground transition-colors hover:bg-muted/60"
          >
            {g.label}
            <span className="font-normal normal-case tracking-normal text-muted-foreground">
              — itemised below
            </span>
          </a>
          <ul>
            {g.ids.map((id) => {
              const l = byId.get(id)!;
              const left = total > 0 ? (start / total) * 100 : 0;
              const width = total > 0 ? (l.totalNGN / total) * 100 : 0;
              start += l.totalNGN;
              return (
                <li
                  key={id}
                  className={cn(
                    OVERVIEW_GRID,
                    'items-center border-t border-border px-4 py-2.5 md:grid',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3 md:block">
                    <span className="text-prose text-foreground">{l.label}</span>
                    <span className="mono shrink-0 text-body font-semibold tabular-nums text-foreground md:hidden">
                      {formatNaira(l.totalNGN, true)}
                    </span>
                  </div>
                  <div
                    className="relative mt-1.5 h-2.5 rounded-[3px] bg-surface-sunk md:mt-0"
                    role="img"
                    aria-label={`${l.label}: ${formatShare(l.totalNGN, total)} of the total`}
                  >
                    <span
                      className="absolute inset-y-0 rounded-[2px] bg-foreground/70"
                      style={{ left: `${left}%`, width: `max(${width}%, 2px)` }}
                      title={`${formatNaira(l.totalNGN)} (${formatShare(l.totalNGN, total)})`}
                    />
                  </div>
                  <span className="mono hidden whitespace-nowrap text-right text-body font-semibold tabular-nums text-foreground md:block">
                    {formatNaira(l.totalNGN, true)}
                  </span>
                  <p className="mt-1 text-body leading-snug text-muted-foreground md:mt-0">
                    {l.description}
                    {l.inflated && (
                      <span className="mono ml-1.5 whitespace-nowrap text-tick font-semibold uppercase tracking-[0.06em] text-foreground">
                        2027 prices
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </SectionCard>
  );
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
                  <td className="td text-right" colSpan={3}>
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
                className="mono td py-3 text-right text-note font-bold uppercase tracking-[0.09em] text-foreground"
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
