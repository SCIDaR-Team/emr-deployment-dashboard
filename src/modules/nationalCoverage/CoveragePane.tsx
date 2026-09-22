import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Globe,
  Info,
  Landmark,
  MinusCircle,
  Router,
  Search,
  Smartphone,
  Users,
  Wifi,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCompactCount, formatCount, formatPercent } from '@/lib/format';
import {
  COVERAGE_THEMES,
  INTERNET_GROUPS,
  LEADERSHIP_ANSWER_LABEL,
  LEADERSHIP_ANSWER_ORDER,
  LEADERSHIP_SUB_DOMAINS,
  subDomainsFor,
  type ProviderDef,
} from '@/lib/themes';
import { BandBadge, BandCards, BandIcon } from '@/components/ui';
import type {
  AreaProfile,
  Band,
  CoverageMeasures,
  CoverageThemeId,
  InternetProviderGroup,
  InternetSubscriptions,
  LeadershipBands,
} from '@/lib/types';
import { bandOf, countByBand, countLeadershipBands, totalOf, type Scope } from './coverageScope';

/**
 * The pane — everything the reader is told about whatever the map has selected.
 *
 * Two shapes, one component, because the difference between them is genuinely
 * only the scope:
 *
 *   national   counts. "12 states ready, 14 moderately, 11 not ready", and the
 *              national figures beneath.
 *   state      one band, and that state's own figures — and nothing else. No
 *              counts of LGAs, because an LGA is not a thing this page has a
 *              reading for; and no list of the other states, because the pane
 *              at this level answers "how is this state" and stops there.
 *
 * ## Readiness is stated once, at the top
 *
 * Every domain block used to open with a readiness reading of its own — three
 * band cards nationally, one inside a state. They have come out at the client's
 * direction, and what is left is the block a reader cannot get the finding
 * without: one overall reading, then each domain's *figures* — access rates,
 * staff headcount, the subscription arithmetic, the four governance
 * commitments. Colour on this page now means the country's readiness and
 * nothing else, which is a narrower claim than the pane used to make and a
 * clearer one.
 *
 * The one domain that can render no block at all is Leadership & Governance,
 * whose only content is the governance rows — inside one of the ten unscored
 * states there are none, and a heading over nothing is worse than silence.
 */

interface CoveragePaneProps {
  scope: Scope;
  national: AreaProfile | null;
  states: AreaProfile[];
  /** The rows for the list at the bottom — the 37 states. Read at national
   *  level only; inside a state the pane draws no list. */
  listAreas: AreaProfile[];
  listLabel: string;
  selectedListId: string | null;
  onSelectListItem: (area: AreaProfile) => void;
}

export function CoveragePane({
  scope,
  national,
  states,
  listAreas,
  listLabel,
  selectedListId,
  onSelectListItem,
}: CoveragePaneProps) {
  const area = scope.level === 'state' ? scope.state : national;
  const isNational = scope.level === 'national';

  if (!area) return null;

  const measures = area.coverage.measures;

  /*
   * Every domain gets a block, with one exception.
   *
   * Leadership & Governance is the only domain with no rows in `SUB_DOMAINS` —
   * its whole content is the governance rows, and those exist only where the
   * source scored the area. Nationally that is 27 states, so the block shows;
   * inside one of the ten unscored states it would be a heading over nothing,
   * so it is dropped.
   *
   * The other two always show. Note that `staffCount` is null throughout the
   * workbook as it stands, so Workforce Capacity's one figure reads as an em
   * dash — which is a measurement nobody has taken, said out loud, and is not
   * a reason to hide the domain.
   */
  const hasGovernance = isNational
    ? states.some((st) => st.coverage.leadership)
    : Boolean(area.coverage.leadership);
  const themes = COVERAGE_THEMES.filter(
    (t) => t.id !== 'leadership_governance' || hasGovernance,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeader scope={scope} national={national} />

      {/* The header stays put; everything under it scrolls as one column. The
          alternative — scrolling the list alone inside a fixed stats block —
          gives a reader on a laptop two scroll regions in 370px and neither one
          enough room. */}
      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto">
        {/* The reading — what the map is painted from, and now the only band
            claim in the pane. It was conditional while the Domain control could
            reduce it to a restatement of the single block below it; with the
            domain blocks no longer carrying a band of their own, it is the
            reader's one answer to "how does the country stand" and always
            shows. */}
        <Block title="Overall readiness">
          {isNational ? (
            <CountRows counts={countByBand(states)} unit="states" of={states.length} />
          ) : (
            <Reading band={bandOf(area)} />
          )}
        </Block>

        {themes.map((theme) => (
          <Block key={theme.id} title={theme.label}>
            <SubDomains themeId={theme.id} measures={measures} />
            {/* The counts behind the internet rate, directly beneath it: Access
                rates is the only sub-domain this domain has, so appending here
                lands the block under the two figures it is the arithmetic for.
                Renders nothing below a state, where the workbook has no rows. */}
            {theme.id === 'technical_infrastructure' && (
              <InternetProviders internet={area.coverage.internet} />
            )}
            {/* Leadership's whole content: the four commitments the source
                records, answered Yes / Partial / No inside a state and counted
                per answer nationally. This domain has no rows in
                `SUB_DOMAINS`, so these are the only figures under it. */}
            {theme.id === 'leadership_governance' &&
              (isNational ? (
                <LeadershipSpread states={states} />
              ) : (
                <LeadershipBandRows bands={area.coverage.leadership} />
              ))}
          </Block>
        ))}

        {/* The list is the national view's, and only its own.
            
            Nationally it is the other half of the map: 37 rows, worst first,
            saying in names what the polygons say in colour. Inside a state
            there is one area on screen and the pane is already about it, so a
            list of the other 36 is a second navigation control sitting under
            the answer the reader drilled in for — and the filter row's State
            dropdown, the map's locator and the breadcrumb are all still there
            to move with. */}
        {isNational && (
          <AreaList
            label={listLabel}
            areas={listAreas}
            selectedId={selectedListId}
            onSelect={onSelectListItem}
          />
        )}
      </div>
    </div>
  );
}

/** Scope identity: what you are looking at, and at what level. */
function PaneHeader({
  scope,
  national,
}: {
  scope: Scope;
  national: AreaProfile | null;
}) {
  const area = scope.level === 'state' ? scope.state : national;
  const name = scope.level === 'national' ? 'Nigeria' : (area?.name ?? '');
  // The eyebrow used to count the state's LGAs. They are not a level this page
  // has any more, and the count was the last place one appeared in the pane —
  // the zone is what a reader actually places a state by, and it is the same
  // hint the State dropdown shows beside the name.
  const level =
    scope.level === 'national'
      ? `${formatCount(37)} states & FCT`
      : `State · ${scope.state.zone ?? 'Nigeria'}`;

  return (
    <div className="shrink-0 border-b border-border px-4 py-3">
      <p className="eyebrow">{level}</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h2 className="text-title font-semibold tracking-tight text-foreground">{name}</h2>
        {/* The national scope shows counts rather than a badge: a single band
            for the whole country would flatten 37 readings into one word. */}
        {scope.level !== 'national' && area && <BandBadge band={bandOf(area)} size="sm" />}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3.5">
      <h3 className="mono mb-2.5 text-note font-bold uppercase tracking-[0.11em] text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The national shape: a count and its share per band, best first, over the
 * denominator both are taken on.
 *
 * The same three cards Assessed States uses, and deliberately identical to
 * them: a reader moving between the two pages is comparing 37 states against
 * 2,806 facilities, and the comparison is hard enough without the tiles also
 * being laid out differently.
 *
 * The share is the point of adding it. "24 states not ready" is a figure the
 * reader has to divide by 37 before it says anything, and that nearly two
 * thirds of the country is not ready *is* the finding — so the card states it
 * instead of leaving it to be worked out. It sits at the right edge rather than
 * beside the count, where it read as more digits; out there the three shares
 * stack into a column of their own.
 *
 * `unit` names the count in the line below and nowhere else — which is what
 * `BandCards` asks for when the surrounding block has already said what is
 * being counted. On the card it cost more than it explained: "states" between
 * the figure and the share left a two-digit count no room, so 64.9% wrapped
 * below its own card and that one card grew taller than the two beside it.
 * Said once underneath, it covers all three.
 */
function CountRows({
  counts,
  unit,
  of,
}: {
  counts: Record<Band, number>;
  unit: string;
  /** The population the counts were taken over, where it is larger than the
   *  classified total — see below. */
  of?: number;
}) {
  const total = totalOf(counts);
  const unclassified = of != null && of > total ? of - total : 0;

  return (
    <div>
      <BandCards counts={counts} showPercent />
      <p className="mono mt-2.5 text-note text-muted-foreground">
        {formatCount(total)} {unit} classified
        {/*
          The remainder, named rather than left to subtraction.

          Newly load-bearing. Every domain used to be classified on all 37
          states or on none, so "37 states classified" was the only line this
          ever printed and the shares beside it were shares of the country.
          Leadership covers 27, and three shares adding to 100% of a figure the
          reader has not been given the denominator for is precisely how a
          two-thirds finding gets read as a national one. Ten states are grey on
          the map for the same reason, and this is the sentence that explains
          them.
        */}
        {unclassified > 0 && (
          <span className="text-muted-foreground">
            {' · '}
            {formatCount(unclassified)} not yet assessed
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * The state shape: one band, stated plainly.
 *
 * A filled card rather than a swatch beside a line of coloured type, so that
 * dropping from national into a state does not drop the colour out of the
 * pane: `CountRows` above hands the reader three filled cards, and this is the
 * same block answering the same question one level down. Same fill, same ink,
 * same icon — one card instead of three, because there is one reading.
 */
function Reading({ band }: { band: Band | null }) {
  if (!band) {
    return (
      <div className="border border-border bg-surface-sunk px-2.5 py-2.5">
        <p className="text-prose text-muted-foreground">Not assessed.</p>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'band-card flex items-center gap-2 border border-onband/15 px-2.5 py-2.5',
        BAND_CLASSES[band].bg,
      )}
    >
      <BandIcon band={band} className="h-4 w-4 shrink-0" />
      <span className="text-lead font-bold tracking-tight">{BAND_LABEL[band]}</span>
    </div>
  );
}

/* Measure and access-technology icons. Names live in the tables in themes.ts,
   the components they resolve to live here — the same split Sidebar.tsx uses,
   so a data table never imports from the icon library. */
const MEASURE_ICONS: Record<string, LucideIcon> = { Zap, Globe, Users };
const GROUP_ICONS: Record<InternetProviderGroup, LucideIcon> = {
  mobile: Smartphone,
  fixed: Router,
  wifi: Wifi,
};

/**
 * The figures under a domain, as cards.
 *
 * Set in plain ink with no band colour anywhere near them, and that is a rule
 * rather than a style choice: sub-domains carry no readiness level, in this
 * dataset or the real one, so tinting 53.3% with a readiness hue would invent a
 * judgement the data does not make. Colour on this page means band, and the
 * only band left in the pane is the overall reading at the top. The card gives
 * the figure its own frame, an icon and a denominator — everything the number
 * needs to be read — without giving it a hue.
 *
 * No leading rule: with the domain's readiness card gone this is the first
 * thing under the block's heading, and a border between a heading and the only
 * content it has would divide the block from itself.
 *
 * Two across, or one full-width where a sub-domain has a single measure. The
 * pane is 420px, so two is the most that can hold a 20px figure and still say
 * what it is a share of.
 */
function SubDomains({
  themeId,
  measures,
}: {
  themeId: CoverageThemeId;
  measures: CoverageMeasures;
}) {
  const subs = subDomainsFor(themeId);
  if (!subs.length) return null;

  return (
    <div className="mt-2.5 space-y-4">
      {subs.map((sub) => (
        <section key={sub.id}>
          <p className="eyebrow">{sub.label}</p>
          {/* The note is promoted from a grey gloss to the block's own
              headline. It is the sentence that says what the figures are, and
              at 11.5px grey it was read as boilerplate and skipped. */}
          <h4 className="mt-1 text-prose font-semibold leading-snug tracking-tight text-foreground">
            {sub.note}
          </h4>
          <div
            className={cn(
              'mt-2.5 grid gap-2',
              sub.measures.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
            )}
          >
            {sub.measures.map((measure) => (
              <MeasureCard
                key={measure.key}
                icon={MEASURE_ICONS[measure.icon] ?? Globe}
                label={measure.label}
                caption={measure.caption}
                format={measure.format}
                value={measures[measure.key]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * One figure, framed.
 *
 * ## The bar is capped and the caption is not
 *
 * `internetSubscriptionPct` legitimately exceeds 100 — subscriptions are
 * counted per SIM and Ogun holds 120.5 per hundred people. A bar cannot draw
 * that, and drawing it at 100% while the caption still reads "of population
 * with access" would state something false twice over. So the track fills and
 * the caption says what actually happened: more than one subscription a head.
 * The figure itself is never clamped.
 */
function MeasureCard({
  icon: Icon,
  label,
  caption,
  format,
  value,
}: {
  icon: LucideIcon;
  label: string;
  caption: string;
  format: 'percent' | 'count';
  value: number | null;
}) {
  const isPercent = format === 'percent';
  const over = isPercent && value != null && value > 100;

  return (
    <div className="rounded-card border border-border bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunk"
        >
          <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mono truncate text-tick uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          {/* One decimal always: these are read as a pair, and an exact 45
              printed as "45%" beside "50.5%" breaks the alignment. */}
          <p className="mono mt-0.5 text-title font-semibold leading-none tracking-tight text-foreground">
            {value == null ? (
              '—'
            ) : isPercent ? (
              <>
                {value.toFixed(1)}
                <span className="text-body font-medium text-muted-foreground">%</span>
              </>
            ) : (
              formatCount(value)
            )}
          </p>
        </div>
      </div>

      {/* No track where there is no figure. An empty bar beside a dash reads
          as a measured zero, and null here means nobody measured. */}
      {isPercent && value != null && (
        <span className="mt-2 block h-1.5 rounded-full bg-surface-sunk">
          {/* A magnitude, not a judgement — no threshold, no colour change. */}
          <span
            className="block h-full rounded-full bg-foreground/65"
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
        </span>
      )}

      <p className="mt-1.5 text-note leading-snug text-muted-foreground">
        {over ? 'more than one per head' : caption}
      </p>
    </div>
  );
}

/**
 * Internet subscriptions, by access technology and operator.
 *
 * This is the arithmetic behind the rate above it: `total / population` is
 * `internetSubscriptionPct`, so a reader who wants to know what "53.3%" is
 * made of can read down and find out. Grouped by technology because that is
 * the finding — mobile carries 99.8% of subscriptions and fixed broadband
 * 0.02%, which for an EMR deployment is the difference between a clinic that
 * can hold a connection and one that cannot.
 *
 * Plain ink throughout. These are counts, not readiness, and the rule on this
 * page is that band colour means band — see `SubDomains`.
 *
 * ## Null and zero are different rows
 *
 * Four operators are blank in every row of the source. They are listed by name
 * as *not reported* rather than printed as `0`, because zero subscriptions is a
 * claim the workbook never makes. Read out of the data rather than hardcoded,
 * so an operator that gains figures later simply appears.
 */
/**
 * A subscription share, to one decimal.
 *
 * `formatShare`'s whole percentages round mobile's 99.83% to "100%", which
 * reads as "mobile is everything" — and that fixed broadband and wi-fi are
 * *small but not nothing* is the whole reason this block is grouped. One
 * decimal keeps 99.8% honest and keeps EMTS at 0.8% rather than 1%.
 *
 * A `<0.1%` floor is kept, for the reason `formatShare` has its own: 175
 * subscriptions for 21st Century is a real figure, and "0.0%" printed beside
 * the count reads as a contradiction rather than as a small number.
 */
function shareOfSubs(part: number, total: number): string {
  if (!total) return '—';
  const share = (part / total) * 100;
  return part > 0 && share < 0.05 ? '<0.1%' : formatPercent(share, 1);
}

/**
 * An operator's mark, beside its name.
 *
 * The operator's own artwork where `ProviderDef.logo` names a file that has
 * been supplied, and a monogram tile everywhere else. The real marks are
 * trademarked artwork this repository does not hold, and inventing a wordmark
 * for an operator is worse than not drawing one — so the fallback tile carries
 * the brand's colour where that colour is a known fact (see
 * `ProviderDef.brand`) and a neutral surface where it is not.
 *
 * A supplied logo sits on a light tile in both schemes. Brand artwork is drawn
 * for paper and most of it is dark ink on transparency, which vanishes on a
 * dark background; a constant light tile is the standard lockup and the only
 * one that cannot swallow a mark.
 *
 * ## Why brand colour is allowed here, when band colour is not
 *
 * The rule on this page is that hue means readiness. This tile is the one
 * exception, and it holds because the tile answers "who", never "how ready":
 * it is 18px, it never touches a figure, a bar or a row, and it always sits
 * immediately left of the name it belongs to. The chip is read as a logo, in
 * the place a logo goes. Nothing else in the pane may take a brand colour.
 */
function ProviderMark({ provider }: { provider: ProviderDef }) {
  if (provider.logo) {
    return (
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-white">
        <img src={provider.logo} alt="" className="h-[14px] w-[14px] object-contain" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'mono flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-tick font-bold leading-none',
        !provider.brand && 'bg-surface-sunk text-muted-foreground',
      )}
      style={
        provider.brand
          ? { backgroundColor: provider.brand.bg, color: provider.brand.fg }
          : undefined
      }
    >
      {provider.monogram}
    </span>
  );
}

function InternetProviders({ internet }: { internet: InternetSubscriptions | null }) {
  if (!internet) return null;
  const { total, population, byProvider } = internet;

  const groups = INTERNET_GROUPS.map((group) => {
    const reporting = group.providers
      .filter((p) => byProvider[p.id] != null)
      .sort((a, b) => (byProvider[b.id] ?? 0) - (byProvider[a.id] ?? 0));
    return {
      ...group,
      reporting,
      // Null when the whole group is unmeasured, so it reads "—" rather than
      // claiming the technology has no subscribers.
      subtotal: reporting.length
        ? reporting.reduce((sum, p) => sum + (byProvider[p.id] ?? 0), 0)
        : null,
      /*
       * The bar scale for the rows below: the group's own largest operator.
       *
       * Within the group, not across the page. Mobile is 99.8% of everything,
       * so a bar drawn against the national total would leave fixed broadband
       * and wi-fi as empty tracks and say nothing about who leads inside them.
       * The SHARE column beside each bar, and the group's own share above it,
       * carry the true proportion — the bar only ranks.
       *
       * Null where a group has one reporting operator, and no bar is drawn.
       * Scaled against itself it would fill the track, which on a technology
       * holding under 0.1% of subscriptions is the one impression the block
       * exists to correct. With nothing to rank there is nothing to draw.
       */
      leader: reporting.length > 1 ? (byProvider[reporting[0]!.id] ?? 0) : null,
    };
  });

  const unreported = INTERNET_GROUPS.flatMap((g) =>
    g.providers.filter((p) => byProvider[p.id] == null),
  );

  return (
    <section className="mt-4 border-t border-border pt-3.5">
      <p className="eyebrow">Internet subscriptions</p>
      <h4 className="mt-1 text-lead font-semibold leading-tight tracking-tight text-foreground">
        {formatCompactCount(total)} active subscriptions
      </h4>
      <p className="mt-0.5 text-body leading-snug text-muted-foreground">
        across a population of {formatCompactCount(population)} (NBS 2025).
      </p>

      {/* The three technologies at a glance, before the operator detail. The
          finding is the shape of this row — mobile carries all of it — and a
          reader who stops here has still been told the thing that matters. */}
      <div className="mt-2.5 rounded-card border border-border bg-surface-sunk/45 px-2.5 py-2">
        <p className="text-note font-medium text-muted-foreground">
          Total subscriptions by category
        </p>
        <div className="mt-2 grid grid-cols-3 divide-x divide-border">
          {groups.map((group) => {
            const Icon = GROUP_ICONS[group.id];
            return (
              <div key={group.id} className="px-2 first:pl-0 last:pr-0">
                <Icon
                  aria-hidden
                  className="h-3.5 w-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <p className="mono mt-1 text-prose font-semibold leading-none tracking-tight text-foreground">
                  {group.subtotal == null ? '—' : formatCompactCount(group.subtotal)}
                </p>
                <p className="mt-1 truncate text-note leading-none text-muted-foreground">
                  {group.label}
                </p>
                <p className="mono mt-1 text-note leading-none text-muted-foreground">
                  {group.subtotal == null ? '—' : shareOfSubs(group.subtotal, total)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Then the operators, one table per technology. */}
      {groups.map((group) => {
        const Icon = GROUP_ICONS[group.id];
        return (
          <div key={group.id} className="mt-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-card bg-surface-sunk"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="mono truncate text-note font-bold uppercase tracking-[0.09em] text-foreground">
                  {group.label}
                </p>
                <p className="mono truncate text-note leading-tight text-muted-foreground">
                  {group.subtotal == null ? '—' : formatCount(group.subtotal)} subscriptions
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="mono text-prose font-semibold leading-none tracking-tight text-foreground">
                  {group.subtotal == null ? '—' : shareOfSubs(group.subtotal, total)}
                </p>
                <p className="mt-1 text-tick leading-none text-muted-foreground">
                  of total subscriptions
                </p>
              </div>
            </div>

            {group.reporting.length > 0 && (
              <table className="mt-2 w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="mono pb-1 text-left text-tick font-normal uppercase tracking-[0.1em] text-muted-foreground"
                    >
                      Provider
                    </th>
                    <th
                      scope="col"
                      className="mono w-[92px] pb-1 text-right text-tick font-normal uppercase tracking-[0.1em] text-muted-foreground"
                    >
                      Subscriptions
                    </th>
                    <th
                      scope="col"
                      className="mono w-[46px] pb-1 text-right text-tick font-normal uppercase tracking-[0.1em] text-muted-foreground"
                    >
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.reporting.map((provider) => {
                    const count = byProvider[provider.id] ?? 0;
                    return (
                      <tr key={provider.id} className="border-b border-border/60 last:border-0">
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-2">
                            <ProviderMark provider={provider} />
                            <span className="w-[78px] shrink-0 truncate text-body text-foreground">
                              {provider.label}
                            </span>
                            {group.leader != null && (
                              <span className="h-1.5 min-w-0 flex-1 rounded-full bg-surface-sunk">
                                <span
                                  className="block h-full rounded-full bg-foreground/55"
                                  style={{ width: `${(count / group.leader) * 100}%` }}
                                />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="mono py-1.5 text-right text-body text-foreground">
                          {formatCount(count)}
                        </td>
                        <td className="mono py-1.5 text-right text-note text-muted-foreground">
                          {shareOfSubs(count, total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {unreported.length > 0 && (
        <p className="mt-3 text-note leading-snug text-muted-foreground">
          Not reported here:{' '}
          <span className="text-foreground">{unreported.map((p) => p.label).join(', ')}</span>. The
          source leaves these blank, which is not the same as none.
        </p>
      )}

      {/* The two denominators, said once at the foot rather than argued with
          in every caption above. */}
      <div className="mt-2.5 flex gap-2 rounded-card bg-surface-sunk/60 px-2.5 py-2">
        <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-note leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Access rates are per head</span> (population
          level). Subscription counts may exceed the population, as some people hold more than one.
        </p>
      </div>
    </section>
  );
}

/**
 * The answers, as a card row states them: a word and a mark.
 *
 * `ink` is the band token for the same value, so Yes is the green the map
 * paints Ready in and No the red it paints Not ready in. The hue is reused
 * because a reader has already learnt it; the *word* is not, because "how ready
 * is this state" and "does this state have a data policy" are different
 * questions and only one of them has a band for an answer.
 *
 * The mark is the non-colour carrier and it carries on shape alone — a tick, a
 * dash, a cross — so the row survives a greyscale print-out and a colour-vision
 * deficiency without the word beside it. The word is there anyway, because no
 * glyph says "Partial" on its own.
 */
const ANSWERS: Record<Band, { label: string; icon: LucideIcon; ink: string }> = {
  ready: {
    label: LEADERSHIP_ANSWER_LABEL.ready,
    icon: CheckCircle2,
    ink: BAND_CLASSES.ready.text,
  },
  moderately_ready: {
    label: LEADERSHIP_ANSWER_LABEL.moderately_ready,
    icon: MinusCircle,
    ink: BAND_CLASSES.moderately_ready.text,
  },
  not_ready: {
    label: LEADERSHIP_ANSWER_LABEL.not_ready,
    icon: XCircle,
    ink: BAND_CLASSES.not_ready.text,
  },
};

/** The card both leadership blocks are drawn in: an icon, a title, an optional
 *  figure at the right, and hairline-divided rows beneath. Built from the
 *  page's own border and surface tokens rather than a drop shadow — hierarchy
 *  on this dashboard is hairlines and vertical rhythm. */
function CommitmentCard({
  aside,
  children,
}: {
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2.5 overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-surface-sunk/40 px-3 py-2.5">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface"
        >
          <Landmark className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        </span>
        <h4 className="min-w-0 flex-1 truncate text-lead font-semibold tracking-tight text-foreground">
          Governance commitments
        </h4>
        {aside}
      </div>
      {children}
    </div>
  );
}

/**
 * A state's four governance commitments: the thing, and whether the state has
 * it.
 *
 * Yes / Partial / No, not a readiness band. The three-way readiness scale is
 * the right vocabulary for "can this state take a deployment" and the wrong one
 * for "does this state have a data governance policy" — a policy is not
 * moderately ready, it either exists, half exists, or does not. The bands came
 * off these rows at the client's direction; `LEADERSHIP_ANSWER_LABEL` is where
 * the two vocabularies meet.
 *
 * Source order, top to bottom, matching the national table below — the two are
 * the same four rows at two scopes, and a reader moving between a state and the
 * country should meet them in the same order.
 */
function LeadershipBandRows({ bands }: { bands: LeadershipBands | null }) {
  if (!bands) return null;

  return (
    <CommitmentCard>
      <ul className="divide-y divide-border">
        {LEADERSHIP_SUB_DOMAINS.map((sub) => {
          const answer = ANSWERS[bands[sub.id]];
          const Mark = answer.icon;
          return (
            <li key={sub.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1 text-prose leading-snug text-foreground">
                {sub.label}
              </span>
              <span className={cn('flex shrink-0 items-center gap-1.5', answer.ink)}>
                <span className="mono text-tick font-bold uppercase tracking-[0.09em]">
                  {answer.label}
                </span>
                <Mark className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </span>
            </li>
          );
        })}
      </ul>
    </CommitmentCard>
  );
}

/**
 * The four commitments across the country: how many states answered each way,
 * and what that looks like.
 *
 * The national shape of `LeadershipBandRows`, and the block that makes this
 * domain worth a national reading at all. A state's four rows say what *it* is
 * missing; these say what the country is missing, and the two halves of the
 * finding are nothing like each other:
 *
 *   governance structure                   16 yes                a body owns it
 *   financial commitment for EMR            2 yes, 13 partial    money against it
 *   state-specific digital health strategy  5 yes                a strategy to sit under
 *   state-specific data governance policy   1 yes                a policy for the record
 *
 * Roughly half the scored states have built the institution; almost none have
 * written down what it is for, and the money is committed in part far more
 * often than in full. That is a different intervention from "leadership is
 * weak", and it is invisible at any single rollup.
 *
 * ## One square is one state
 *
 * This was a table of bare counts, and a table made the reader divide by 27
 * before it said anything — "22 no" is a figure, "almost the whole country" is
 * the finding. It was four proportional bars before that, which showed the
 * shape and took the figures away.
 *
 * Twenty-seven squares give both, and they do it without a rounding rule:
 * the population is small enough to draw a state at a time, so a square is a
 * state rather than a percentage point, the three counts are still printed on
 * the row, and a reader who distrusts the drawing can count it. Note the
 * contrast with the landing page's waffle, which apportions a hundred tiles by
 * largest remainder because it is drawing 2,806 facilities into 100 squares —
 * there a tile is a per cent and the rounding has to be argued about. Here
 * there is nothing to round.
 *
 * The squares are grouped in answer order with a wider gap between groups, so
 * the three runs read as three quantities rather than one dashed line.
 *
 * `scored` is the denominator, stated once in the header rather than on every
 * row — ten of the 37 states carry no leadership reading at all, so this is
 * never "of 37".
 */
function LeadershipSpread({ states }: { states: AreaProfile[] }) {
  const { scored, bySubDomain } = useMemo(() => countLeadershipBands(states), [states]);

  if (!scored) return null;

  return (
    <CommitmentCard
      aside={
        <span className="mono shrink-0 text-tick uppercase tracking-[0.09em] text-muted-foreground">
          of {formatCount(scored)} states
        </span>
      }
    >
      <ul className="divide-y divide-border">
        {LEADERSHIP_SUB_DOMAINS.map((sub) => {
          const counts = bySubDomain[sub.id] ?? {
            not_ready: 0,
            moderately_ready: 0,
            ready: 0,
          };
          return (
            <li key={sub.id} className="px-3 py-2.5">
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 text-prose leading-snug text-foreground">
                  {sub.label}
                </span>
                {/* The figures, in each answer's own ink and in the same order
                    as the squares below them, so the count and the run it
                    describes line up left to right. A zero keeps its place and
                    takes muted ink: no state answering Partial on governance
                    structure is a reading, and a gap in the row would read as
                    an unasked question. */}
                <span className="mono flex shrink-0 items-baseline gap-2.5">
                  {LEADERSHIP_ANSWER_ORDER.map((band) => (
                    <span
                      key={band}
                      className={cn(
                        'text-tick uppercase tracking-[0.06em]',
                        counts[band] ? ANSWERS[band].ink : 'text-muted-foreground',
                      )}
                    >
                      <span className="text-lead font-bold tabular-nums">{counts[band]}</span>{' '}
                      {ANSWERS[band].label}
                    </span>
                  ))}
                </span>
              </div>

              <AnswerSquares counts={counts} total={scored} label={sub.label} />
            </li>
          );
        })}
      </ul>

      {/* The key, and the sentence that makes the squares countable rather than
          decorative. Both belong to all four rows, so they are said once. */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-border bg-surface-sunk/40 px-3 py-2">
        {LEADERSHIP_ANSWER_ORDER.map((band) => (
          <span key={band} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn('block h-2.5 w-2.5 rounded-[1px]', BAND_CLASSES[band].bg)}
            />
            <span className="text-note leading-none text-muted-foreground">
              {ANSWERS[band].label}
            </span>
          </span>
        ))}
        <span className="mono ml-auto text-tick uppercase tracking-[0.06em] text-muted-foreground">
          1 square = 1 state
        </span>
      </div>
    </CommitmentCard>
  );
}

/**
 * One row's answers as `total` squares, grouped in answer order.
 *
 * Every square is the same width at any pane width, which is what makes the
 * four rows comparable down the column: each group takes `flexGrow` equal to
 * its own count, and the squares inside it share that space equally. Sizing the
 * groups by count and the squares by group would let a wide group draw wide
 * squares, and the block would stop being a count of states.
 *
 * A group with no states draws nothing — not a zero-width sliver, which is a
 * hairline that reads as one state. Its `0` is printed on the row above and
 * named in the key below, so the absence is still said out loud.
 *
 * `aspect-square` rather than a fixed height, so a square is square at 480px
 * on a desktop and at a phone's full-bleed pane alike. A fixed height would
 * draw tall tiles once the pane narrowed, and a tile that is not square stops
 * reading as a unit and starts reading as a bar.
 *
 * Colour is never the only carrier here: the three counts sit directly above,
 * in the same order, in the same inks.
 */
function AnswerSquares({
  counts,
  total,
  label,
}: {
  counts: Record<Band, number>;
  total: number;
  label: string;
}) {
  return (
    <div
      className="mt-2 flex items-start gap-[5px]"
      role="img"
      aria-label={`${label}: ${LEADERSHIP_ANSWER_ORDER.map(
        (band) => `${counts[band]} ${ANSWERS[band].label.toLowerCase()}`,
      ).join(', ')} of ${total} states`}
    >
      {LEADERSHIP_ANSWER_ORDER.map((band) => {
        const count = counts[band];
        if (!count) return null;
        return (
          <span key={band} className="flex gap-[2px]" style={{ flexGrow: count }}>
            {Array.from({ length: count }, (_, i) => (
              <span
                key={i}
                className={cn('aspect-square flex-1 rounded-[1px]', BAND_CLASSES[band].bg)}
              />
            ))}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The searchable list at the foot of the pane.
 *
 * The map is the better instrument for "how does the country look" and a
 * hopeless one for "where is Ebonyi". This is the other way in, and it is the
 * same selection — clicking a row does exactly what clicking a polygon does.
 */
function AreaList({
  label,
  areas,
  selectedId,
  onSelect,
}: {
  label: string;
  areas: AreaProfile[];
  selectedId: string | null;
  onSelect: (area: AreaProfile) => void;
}) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? areas.filter((a) => a.name.toLowerCase().includes(q)) : areas;
    // Worst first: the reader is looking for where the problem is, and an
    // alphabetical list buries that under Abia.
    const rank: Record<Band, number> = { not_ready: 0, moderately_ready: 1, ready: 2 };
    return [...matched].sort((a, b) => {
      const ba = bandOf(a);
      const bb = bandOf(b);
      const ra = ba ? rank[ba] : 3;
      const rb = bb ? rank[bb] : 3;
      return ra === rb ? a.name.localeCompare(b.name) : ra - rb;
    });
  }, [areas, query]);

  if (!areas.length) return null;

  return (
    <section className="px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="mono text-note font-bold uppercase tracking-[0.11em] text-foreground">
          {label}
        </h3>
        <span className="mono text-note text-muted-foreground">{formatCount(rows.length)}</span>
      </div>

      <label className="relative mb-2 block">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Find a ${label.toLowerCase().replace(/s$/, '')}`}
          className="w-full rounded border border-input bg-surface py-1.5 pl-7 pr-2 text-prose text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
      </label>

      <ul>
        {rows.map((area) => {
          const band = bandOf(area);
          const selected = area.id === selectedId;
          return (
            <li key={area.id}>
              <button
                type="button"
                onClick={() => onSelect(area)}
                className={cn(
                  'flex w-full items-center gap-2.5 border-b border-border px-1 py-1.5 text-left transition-colors hover:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  selected && 'bg-surface-sunk',
                )}
                aria-current={selected ? 'true' : undefined}
              >
                <span
                  aria-hidden
                  className={cn(
                    'block h-2.5 w-2.5 shrink-0 rounded-[1px]',
                    band ? cn(BAND_CLASSES[band].bg, BAND_CLASSES[band].texture) : 'bg-nodata',
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-prose text-foreground">
                  {area.name}
                </span>
                <span
                  className={cn(
                    'mono shrink-0 text-note font-semibold uppercase tracking-[0.08em]',
                    band ? BAND_CLASSES[band].text : 'text-muted-foreground',
                  )}
                >
                  {band ? BAND_LABEL[band] : '—'}
                </span>
              </button>
            </li>
          );
        })}
        {!rows.length && (
          <li className="py-3 text-prose text-muted-foreground">Nothing matches “{query}”.</li>
        )}
      </ul>
    </section>
  );
}
