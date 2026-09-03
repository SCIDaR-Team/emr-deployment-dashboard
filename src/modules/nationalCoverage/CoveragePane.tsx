import { useMemo, useState } from 'react';
import {
  Globe,
  Info,
  Landmark,
  Map as MapIcon,
  Router,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BAND_CLASSES, BAND_CSS_INK, BAND_LABEL, BAND_RANK } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCompactCount, formatCount, formatPercent, percentOf } from '@/lib/format';
import {
  COVERAGE_THEMES,
  INTERNET_GROUPS,
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
import {
  bandUnderLens,
  countByBand,
  countByDomain,
  countLeadershipBands,
  totalOf,
  type DomainLens,
  type Scope,
} from './coverageScope';

/**
 * The pane — everything the reader is told about whatever the map has selected.
 *
 * Two shapes, one component, because the difference between them is genuinely
 * only the scope:
 *
 *   national   counts. "12 states ready, 14 moderately, 11 not ready", the same
 *              three counts per domain, and the national figures beneath.
 *   state/LGA  bands. This area's own reading per domain, and its own figures.
 *              No counts of LGAs — a state's pane answers "how is this state",
 *              not "how are its parts", and the map already shows the parts.
 *
 * The domain lens narrows which blocks render. Under `overall` all three show
 * (overall, then a block per domain); under a domain, only that one.
 */

interface CoveragePaneProps {
  scope: Scope;
  lens: DomainLens;
  national: AreaProfile | null;
  states: AreaProfile[];
  /** The rows for the list at the bottom — states nationally, LGAs in a state. */
  listAreas: AreaProfile[];
  listLabel: string;
  selectedListId: string | null;
  onSelectListItem: (area: AreaProfile) => void;
}

export function CoveragePane({
  scope,
  lens,
  national,
  states,
  listAreas,
  listLabel,
  selectedListId,
  onSelectListItem,
}: CoveragePaneProps) {
  const area = scope.level === 'lga' ? scope.lga : scope.level === 'state' ? scope.state : national;
  const isNational = scope.level === 'national';

  if (!area) return null;

  const measures = area.coverage.measures;
  // Nothing ticked shows all of them; ticking narrows to what was ticked.
  const themes = lens.length ? COVERAGE_THEMES.filter((t) => lens.includes(t.id)) : COVERAGE_THEMES;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeader scope={scope} lens={lens} national={national} />

      {/* The header stays put; everything under it scrolls as one column. The
          alternative — scrolling the list alone inside a fixed stats block —
          gives a reader on a laptop two scroll regions in 370px and neither one
          enough room. */}
      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto">
        {/* The combined reading — what the map is painted from.
            
            With nothing ticked that is overall readiness, which belongs to no
            domain. With two ticked it is the weaker of them, which belongs to
            neither on its own and so has nowhere else to go. With exactly one
            ticked it would repeat the block immediately below it word for word,
            so it stands down. */}
        {lens.length !== 1 && (
          <Block title={lens.length ? `The weakest of ${lens.length} domains` : 'Overall readiness'}>
            {isNational ? (
              <CountRows counts={countByBand(states, lens)} unit="states" of={states.length} />
            ) : (
              <Reading band={bandUnderLens(area, lens)} />
            )}
          </Block>
        )}

        {themes.map((theme) => (
          <Block key={theme.id} title={theme.label}>
            {isNational ? (
              <CountRows
                counts={countByDomain(states, theme.id)}
                unit="states"
                of={states.length}
              />
            ) : (
              <Reading band={area.coverage.themeBands[theme.id] ?? null} />
            )}
            <SubDomains themeId={theme.id} measures={measures} />
            {/* The counts behind the internet rate, directly beneath it: Access
                rates is the only sub-domain this domain has, so appending here
                lands the block under the two figures it is the arithmetic for.
                Renders nothing below a state, where the workbook has no rows. */}
            {theme.id === 'technical_infrastructure' && (
              <InternetProviders internet={area.coverage.internet} />
            )}
            {/* The same move one domain down: Leadership's band is scored from
                four answers and nothing else, so the four sit directly beneath
                it. Renders nothing where there is no reading — the ten unscored
                states, every LGA, and the nation. */}
            {theme.id === 'leadership_governance' &&
              (isNational ? (
                <LeadershipSpread states={states} />
              ) : (
                <LeadershipBandRows bands={area.coverage.leadership} />
              ))}
          </Block>
        ))}

        <AreaList
          label={listLabel}
          areas={listAreas}
          lens={lens}
          selectedId={selectedListId}
          onSelect={onSelectListItem}
        />
      </div>
    </div>
  );
}

/** Scope identity: what you are looking at, and at what level. */
function PaneHeader({
  scope,
  lens,
  national,
}: {
  scope: Scope;
  lens: DomainLens;
  national: AreaProfile | null;
}) {
  const area = scope.level === 'lga' ? scope.lga : scope.level === 'state' ? scope.state : national;
  const name = scope.level === 'national' ? 'Nigeria' : (area?.name ?? '');
  const level =
    scope.level === 'national'
      ? `${formatCount(37)} states & FCT`
      : scope.level === 'state'
        ? `State · ${formatCount(scope.state.lgaCount ?? 0)} LGAs`
        : `LGA · ${scope.state.name}`;

  return (
    <div className="shrink-0 border-b border-border px-4 py-3">
      <p className="eyebrow">{level}</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{name}</h2>
        {/* The national scope shows counts rather than a badge: a single band
            for the whole country would flatten 37 readings into one word. */}
        {scope.level !== 'national' && area && (
          <BandBadge band={bandUnderLens(area, lens)} size="sm" />
        )}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3.5">
      <h3 className="mono mb-2.5 text-[10px] font-bold uppercase tracking-[0.11em] text-foreground">
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
      <p className="mono mt-2.5 text-[10px] text-muted-foreground">
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
 * The state/LGA shape: one band, stated plainly.
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
        <p className="text-[13px] text-muted-foreground">Not assessed.</p>
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
      <span className="text-[15px] font-bold tracking-tight">{BAND_LABEL[band]}</span>
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
 * The figures beneath a domain, as cards.
 *
 * Set in plain ink with no band colour anywhere near them, and that is a rule
 * rather than a style choice: sub-domains carry no readiness level, in this
 * dataset or the real one, so tinting 53.3% with a readiness hue would invent a
 * judgement the data does not make. Colour on this page means band, and only
 * the blocks above have one. The card gives the figure its own frame, an icon
 * and a denominator — everything the number needs to be read — without giving
 * it a hue.
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
    <div className="mt-3.5 space-y-4 border-t border-border pt-3.5">
      {subs.map((sub) => (
        <section key={sub.id}>
          <p className="eyebrow">{sub.label}</p>
          {/* The note is promoted from a grey gloss to the block's own
              headline. It is the sentence that says what the figures are, and
              at 11.5px grey it was read as boilerplate and skipped. */}
          <h4 className="mt-1 text-[13px] font-semibold leading-snug tracking-tight text-foreground">
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
          <p className="mono truncate text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          {/* One decimal always: these are read as a pair, and an exact 45
              printed as "45%" beside "50.5%" breaks the alignment. */}
          <p className="mono mt-0.5 text-[19px] font-semibold leading-none tracking-tight text-foreground">
            {value == null ? (
              '—'
            ) : isPercent ? (
              <>
                {value.toFixed(1)}
                <span className="text-[11px] font-medium text-muted-foreground">%</span>
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

      <p className="mt-1.5 text-[9.5px] leading-snug text-muted-foreground">
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
        'mono flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold leading-none',
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
      <h4 className="mt-1 text-[15px] font-semibold leading-tight tracking-tight text-foreground">
        {formatCompactCount(total)} active subscriptions
      </h4>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
        across a population of {formatCompactCount(population)} (NBS 2025).
      </p>

      {/* The three technologies at a glance, before the operator detail. The
          finding is the shape of this row — mobile carries all of it — and a
          reader who stops here has still been told the thing that matters. */}
      <div className="mt-2.5 rounded-card border border-border bg-surface-sunk/45 px-2.5 py-2">
        <p className="text-[10px] font-medium text-muted-foreground">
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
                <p className="mono mt-1 text-[13px] font-semibold leading-none tracking-tight text-foreground">
                  {group.subtotal == null ? '—' : formatCompactCount(group.subtotal)}
                </p>
                <p className="mt-1 truncate text-[9.5px] leading-none text-muted-foreground">
                  {group.label}
                </p>
                <p className="mono mt-1 text-[9.5px] leading-none text-muted-foreground">
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
                <p className="mono truncate text-[10.5px] font-bold uppercase tracking-[0.09em] text-foreground">
                  {group.label}
                </p>
                <p className="mono truncate text-[9.5px] leading-tight text-muted-foreground">
                  {group.subtotal == null ? '—' : formatCount(group.subtotal)} subscriptions
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="mono text-[13px] font-semibold leading-none tracking-tight text-foreground">
                  {group.subtotal == null ? '—' : shareOfSubs(group.subtotal, total)}
                </p>
                <p className="mt-1 text-[9px] leading-none text-muted-foreground">
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
                      className="mono pb-1 text-left text-[8.5px] font-normal uppercase tracking-[0.1em] text-muted-foreground"
                    >
                      Provider
                    </th>
                    <th
                      scope="col"
                      className="mono w-[76px] pb-1 text-right text-[8.5px] font-normal uppercase tracking-[0.1em] text-muted-foreground"
                    >
                      Subscriptions
                    </th>
                    <th
                      scope="col"
                      className="mono w-[40px] pb-1 text-right text-[8.5px] font-normal uppercase tracking-[0.1em] text-muted-foreground"
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
                            <span className="w-[68px] shrink-0 truncate text-[11px] text-foreground">
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
                        <td className="mono py-1.5 text-right text-[11px] text-foreground">
                          {formatCount(count)}
                        </td>
                        <td className="mono py-1.5 text-right text-[10px] text-muted-foreground">
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
        <p className="mt-3 text-[10.5px] leading-snug text-muted-foreground">
          Not reported here:{' '}
          <span className="text-foreground">{unreported.map((p) => p.label).join(', ')}</span>. The
          source leaves these blank, which is not the same as none.
        </p>
      )}

      {/* The two denominators, said once at the foot rather than argued with
          in every caption above. */}
      <div className="mt-2.5 flex gap-2 rounded-card bg-surface-sunk/60 px-2.5 py-2">
        <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[10px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Access rates are per head</span> (population
          level). Subscription counts may exceed the population, as some people hold more than one.
        </p>
      </div>
    </section>
  );
}

/* Leadership sub-domain icons. Same split as MEASURE_ICONS above: the names
   live in the table in themes.ts, the components they resolve to live here. */
const LEADERSHIP_ICONS: Record<string, LucideIcon> = {
  Landmark,
  ShieldCheck,
  Map: MapIcon,
  Wallet,
};

/**
 * The sentence every leadership sub-domain block carries, in both scopes.
 *
 * Said rather than left to be inferred, because the four rows beneath a band do
 * *not* roll up to it the way the rest of this page's bands do. The domain lens
 * takes the weaker of two domains (`bandUnderLens`); this source takes the
 * average of four sub-domains, and the two rules disagree on 7 of the 27 —
 * Rivers is Ready over a Not-ready row, Kano and Lagos are Ready over
 * Moderately-ready ones.
 *
 * A reader who has learnt worst-wins on the Domain filter would read those as a
 * mistake. One line fixes it, and the line is worth more than the space: that a
 * state can be ready overall and still be missing the policy that governs the
 * record is the finding, not an artefact. See `LeadershipBands` in types.ts.
 */
const LEADERSHIP_ROLLUP_NOTE = 'The source averages these four';

/**
 * A state's four leadership sub-domains, each with its own band.
 *
 * The only sub-domains in the app that carry one, and the exception is the
 * source's own rather than this page's — it scores Yes 5 / Partial 3 / No 1 and
 * cuts its bands on that same 1–5 scale, so a single answer lands exactly on a
 * band name. `LeadershipBands` in types.ts has the full argument, including why
 * this does not reopen the door for electricity access.
 *
 * What that buys is one vocabulary. A reader learns the three bands on the map
 * and reads them unchanged down to the last row of the pane, instead of meeting
 * a second three-way scale (Yes / Partial / No) that means the same thing in
 * different words. The Yes/Partial/No wording is gone entirely: carrying both
 * would only raise the question of which one is authoritative.
 *
 * Ordered weakest first, so the row a reader most needs is the row they land
 * on. `AreaList` sorts the same way, for the same reason.
 */
function LeadershipBandRows({ bands }: { bands: LeadershipBands | null }) {
  const rows = useMemo(() => {
    if (!bands) return [];
    return [...LEADERSHIP_SUB_DOMAINS].sort((a, b) => {
      const ra = BAND_RANK[bands[a.id]];
      const rb = BAND_RANK[bands[b.id]];
      return ra === rb ? a.label.localeCompare(b.label) : ra - rb;
    });
  }, [bands]);

  if (!bands) return null;

  return (
    <section className="mt-3.5 border-t border-border pt-3.5">
      <p className="eyebrow">Governance readiness</p>
      <h4 className="mt-1 text-[13px] font-semibold leading-snug tracking-tight text-foreground">
        Four state-level commitments, weakest first.
      </h4>

      <ul className="mt-2.5 divide-y divide-border border-y border-border">
        {rows.map((sub) => {
          const Icon = LEADERSHIP_ICONS[sub.icon] ?? Landmark;
          return (
            <li key={sub.id} className="flex items-start gap-2.5 py-2">
              <span
                aria-hidden
                className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunk"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-foreground">
                  {sub.label}
                </span>
                <span className="block text-[10px] leading-snug text-muted-foreground">
                  {sub.note}
                </span>
              </span>
              {/* The same pill the pane's own header wears, one size down. The
                  band on a row and the band on a polygon are the same claim in
                  the same colours — which is the whole point of the mapping. */}
              <BandBadge band={bands[sub.id]} size="sm" className="mt-px shrink-0" />
            </li>
          );
        })}
      </ul>

      <div className="mt-2.5 flex gap-2 rounded-card bg-surface-sunk/60 px-2.5 py-2">
        <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[10px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">{LEADERSHIP_ROLLUP_NOTE}</span> to reach the
          band above — it is not the weakest of them, so a state can read Ready
          with a Not-ready row beneath it.
        </p>
      </div>
    </section>
  );
}

/** Best first, matching the three cards at the top of this pane — a reader
 *  meets the same order twice on one screen. */
const BAND_ORDER: Band[] = ['ready', 'moderately_ready', 'not_ready'];

/**
 * The four sub-domains across the country: how the scored states band on each.
 *
 * The national shape of `LeadershipBandRows`, and the block that made this
 * domain worth a national reading at all. A state's own four rows say what *it*
 * is missing; these say what the country is missing, and the two halves of the
 * finding are nothing like each other:
 *
 *   governance structure     16 of 27 have it      a body that owns it
 *   financial commitment     15 of 27              money against it
 *   digital health strategy   6 of 27              a strategy to sit under
 *   data governance policy    5 of 27              a policy for the record
 *
 * Roughly half the scored states have built the institution and put money
 * behind it; almost none have written down what either is for. That is a
 * different intervention from "leadership is weak", which is all the band above
 * can say, and it is invisible at the band.
 *
 * ## One bar per sub-domain, ranked
 *
 * Each row is a single 100% bar cut three ways, so the four sit on a common
 * scale and can be read down the column against each other — Not ready runs
 * three-quarters of the track on the top two and under half on the bottom one,
 * which is the finding, visible before a figure is read.
 *
 * The count sits *inside* its own segment and the share directly under it, so
 * neither has to be traced back to a key. The dotted legend beneath repeats
 * both, and the repetition is deliberate: a segment too narrow to hold its own
 * digits still has to state its count somewhere, and a row where only the wide
 * segments are labelled would read as though the narrow ones were unmeasured.
 *
 * The rank badge is now the *only* statement that these four are ordered — the
 * heading and the foot note that used to say so have both come out at the
 * client's direction. It carries that on its own well enough: four numerals
 * down the left edge read as a ranking, and the `n of 27` beside each row is
 * the quantity they are ranked on, sitting in plain sight one line up.
 *
 * The denominator survives the same way. It was said once at the foot and is
 * now said four times, once per row, which is where a reader looking at a bar
 * actually needs it.
 */
function LeadershipSpread({ states }: { states: AreaProfile[] }) {
  const { scored, bySubDomain } = useMemo(() => countLeadershipBands(states), [states]);

  const rows = useMemo(
    () =>
      LEADERSHIP_SUB_DOMAINS.map((sub) => {
        const counts = bySubDomain[sub.id] ?? { not_ready: 0, moderately_ready: 0, ready: 0 };
        return { sub, counts, inPlace: counts.ready + counts.moderately_ready };
      })
        // Weakest first, on the states that have the thing *at all* — Ready
        // plus Moderately ready. Ranking on Ready alone would put financial
        // commitment last despite 15 of 27 having some budget, because almost
        // all of that 15 is partial.
        .sort((a, b) =>
          a.inPlace === b.inPlace
            ? a.sub.label.localeCompare(b.sub.label)
            : a.inPlace - b.inPlace,
        ),
    [bySubDomain],
  );

  if (!scored) return null;

  return (
    <section className="mt-3.5 border-t border-border pt-3.5">
      {/* Four rows and nothing else — no heading, no band key, no sentence
          defining the three bands, no note at the foot. All of it came out at
          the client's direction, and the block survives it because every piece
          was restating something already on screen: the parent Block is titled
          Leadership & Governance, the three cards above these rows carry the
          band names and colours, and the denominator now sits on each row as
          `n of 27` rather than once underneath. */}
      <ul className="divide-y divide-border">
        {rows.map(({ sub, counts, inPlace }, rank) => (
          <li key={sub.id} className="py-3">
            <div className="flex items-start gap-2.5">
              {/* Zero-padded, so 01–04 read as a rank rather than as counts. */}
              <span
                aria-hidden
                className="mono mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-sunk text-[9.5px] font-bold text-muted-foreground"
              >
                {String(rank + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold tracking-tight text-foreground">
                    {sub.label}
                  </span>
                  <span className="mono shrink-0 text-[10px] text-muted-foreground">
                    <span className="text-[13px] font-bold text-foreground">
                      {formatCount(inPlace)}
                    </span>{' '}
                    of {formatCount(scored)}
                  </span>
                </div>
                <p className="mono mt-0.5 text-right text-[9px] text-muted-foreground">
                  have the foundation in place ({percentOf(inPlace, scored, 1)})
                </p>
              </div>
            </div>

            <BandSplitBar counts={counts} total={scored} className="mt-2" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One 100% bar cut three ways: the count inside each segment, its share
 * directly beneath, and a dotted key under both.
 *
 * ## Every segment carries its own count, and nothing is widened to fit it
 *
 * The two used to be in tension — a one-state segment is 3.7% of the track, and
 * an earlier version hid its figure rather than distort the bar. It turns out
 * neither has to give, because of an arithmetic accident of this particular
 * denominator: with 27 states, any count needing two digits is at least 10 and
 * therefore at least 37% of the track, while a single digit needs about 5px and
 * the narrowest possible segment is 14px at this pane's width. Every figure
 * fits inside its own true width, so the bar stays honest and no count is
 * hidden. Worth knowing that this is a property of the data and not a
 * guarantee: a much larger denominator would put a two-digit count in a sliver
 * again, and then the figure moves out rather than the segment growing.
 *
 * ## Flat fills, no textures
 *
 * `BAND_CLASSES[band].texture` is deliberately not applied — the segments are
 * plain colour, at the client's direction, where `BandStack` and
 * `DistributionBar` keep their dotted and hatched fills.
 *
 * It is safe because the non-colour carrier moved rather than went: every
 * segment states its own count, its share sits beneath it, and the key below
 * names each band in words beside its figure. Colour is never alone on this
 * block — it simply is not the fill doing the carrying.
 *
 * A band with no states gets no segment and no share; a minimum-width sliver
 * would draw a band that nothing is in, which is the one thing a proportional
 * bar must never do. Its `0` is stated in the key instead, so the absence is
 * still said out loud.
 */
function BandSplitBar({
  counts,
  total,
  className,
}: {
  counts: Record<Band, number>;
  total: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className="flex h-[18px] gap-[2px]"
        role="img"
        aria-label={BAND_ORDER.map(
          (b) => `${BAND_LABEL[b]} ${counts[b]} of ${total}`,
        ).join(', ')}
      >
        {BAND_ORDER.map((band) => {
          const count = counts[band];
          if (!count) return null;
          return (
            <span
              key={band}
              title={`${BAND_LABEL[band]}: ${formatCount(count)} (${percentOf(count, total, 1)})`}
              className={cn(
                'flex items-center justify-center rounded-full',
                BAND_CLASSES[band].bg,
              )}
              style={{ width: `${(count / total) * 100}%` }}
            >
              <span className="mono text-[9.5px] font-bold leading-none text-onband">
                {count}
              </span>
            </span>
          );
        })}
      </div>

      {/* The shares, cut to the same widths as the segments above so each sits
          under its own fill without being positioned absolutely.
          
          Centred and allowed to overflow their cell rather than clipped: at
          3.7% the cell is 14px and "3.7%" is 17px, so it runs 2px past each
          edge — into a neighbour that has 16px of slack, so nothing collides.
          Clipping it instead would drop the one share a reader is most likely
          to be squinting at.
          
          Set in the band's ink. This and the key below are the only places on
          the block where a figure takes a band colour, and it holds because the
          figure *is* that band's share sitting directly under that band's own
          fill. */}
      <div className="mt-1 flex gap-[2px]">
        {BAND_ORDER.map((band) => {
          const count = counts[band];
          if (!count) return null;
          return (
            <span
              key={band}
              className={cn(
                'mono whitespace-nowrap text-center text-[8.5px] font-semibold leading-none',
                BAND_CLASSES[band].text,
              )}
              style={{ width: `${(count / total) * 100}%` }}
            >
              {percentOf(count, total, 1)}
            </span>
          );
        })}
      </div>

      {/* The key: a dot, the count, the band. Every band, including the ones
          with no states — "0 Moderately ready" is a real finding here
          (Governance structure has no partial answers at all) and it has
          nowhere else to be said, since a zero draws no segment above.
          
          The dot takes the band's *ink*, not its fill. At 6px the pastel fills
          the bar is drawn in are barely visible against the surface, and the
          ink is the same hue at a weight that reads small — which is the
          distinction `BAND_CSS_INK` exists to draw. */}
      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {BAND_ORDER.map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="block h-[5px] w-[5px] shrink-0 rounded-full"
              style={{ backgroundColor: BAND_CSS_INK[band] }}
            />
            <span className="text-[9.5px] leading-none text-muted-foreground">
              <span className="mono font-bold text-foreground">{counts[band]}</span>{' '}
              {BAND_LABEL[band]}
            </span>
          </li>
        ))}
      </ul>
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
  lens,
  selectedId,
  onSelect,
}: {
  label: string;
  areas: AreaProfile[];
  lens: DomainLens;
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
      const ba = bandUnderLens(a, lens);
      const bb = bandUnderLens(b, lens);
      const ra = ba ? rank[ba] : 3;
      const rb = bb ? rank[bb] : 3;
      return ra === rb ? a.name.localeCompare(b.name) : ra - rb;
    });
  }, [areas, query, lens]);

  if (!areas.length) return null;

  return (
    <section className="px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="mono text-[10px] font-bold uppercase tracking-[0.11em] text-foreground">
          {label}
        </h3>
        <span className="mono text-[10px] text-muted-foreground">{formatCount(rows.length)}</span>
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
          className="w-full rounded border border-input bg-surface py-1.5 pl-7 pr-2 text-[12.5px] text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
      </label>

      <ul>
        {rows.map((area) => {
          const band = bandUnderLens(area, lens);
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
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                  {area.name}
                </span>
                <span
                  className={cn(
                    'mono shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.08em]',
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
          <li className="py-3 text-[12.5px] text-muted-foreground">Nothing matches “{query}”.</li>
        )}
      </ul>
    </section>
  );
}
