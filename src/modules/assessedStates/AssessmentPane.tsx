import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import {
  GAP_BY_ID,
  GAP_DOMAINS,
  FACILITY_DOMAIN_IDS,
  GAP_AREAS,
  GAP_AREA_BY_ID,
  GAP_DOMAIN_LABEL,
  HORIZONS,
  HORIZON_LABEL,
  HORIZON_SEVERITY,
  HORIZON_SHORT,
  gapCostNGN,
  gapsInArea,
  offeredGapIds,
} from '@/lib/gapCatalogue';
import { domainSelectionMode, facilityBandUnder } from '@/lib/archetype';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira } from '@/lib/format';
import { FACILITY_THEMES, THEME_BY_ID } from '@/lib/themes';
import { BandBadge, BandCards, EmptyState, Tile, TileRow } from '@/components/ui';
import { FacilityCoordinates } from '@/components/map';
import type {
  Band,
  BandDistribution,
  FacilitySummary,
  FacilityThemeId,
  GapDomainId,
  Horizon,
} from '@/lib/types';
import {
  distributionTotal,
  domainOverlap,
  facilityDistribution,
  facilityDomainDistribution,
  type AssessmentScope,
} from './assessmentScope';

/**
 * The pane — everything the reader is told about whatever the map has selected.
 *
 * One component across all four levels, because until the last one the question
 * does not change: how many facilities are in scope, and how do they split. A
 * state, an LGA and the whole survey are the same reading over a different
 * population, so they get the same blocks over a different `facilities` array —
 * which also means the numbers cannot drift apart, since there is one code path
 * producing them.
 *
 * The facility level is the exception and reads differently on purpose. A
 * single facility has no distribution to show — it *is* one row in everyone
 * else's — so its blocks are its own bands, its own gaps and the things that
 * identify it.
 *
 * ## Two readings, shown together
 *
 * Areas carry both overall distributions and a facility carries both overall
 * bands, side by side, rather than a control switching between them. The
 * interesting fact in this dataset is the *distance* between the two — 624
 * facilities are clear to deploy into and 71 are in shape to run an EMR — and
 * distance is only legible when both are on screen.
 *
 * Tick a domain and both collapse to that domain's band. There is no
 * per-domain deployment reading anywhere in the source, so under a domain the
 * pair would be one row printed twice.
 *
 * Everything counts the facilities actually on screen: the path scope and the
 * filter row together. Reading a band off `AreaProfile` instead would print a
 * whole-state figure beside a filtered count.
 */

interface AssessmentPaneProps {
  scope: AssessmentScope;
  /** Facilities inside the current path scope, after the filter row. */
  facilities: FacilitySummary[];
  /** The domains the Domain filter has ticked. Empty is the overall reading. */
  domains: FacilityThemeId[];
  /**
   * The gap areas the Gap area filter has ticked.
   *
   * Changes what the headline block *is*, not just what it counts — see
   * `SelectionBlock`. The assessment publishes no readiness band for a gap
   * area, so once one is ticked the block naming the selection replaces the
   * block splitting it by band.
   */
  gapAreas: string[];
  /** The rows for the list at the bottom, and what one click does. */
  list: PaneList;
}

/**
 * One row of the list at the bottom of the pane.
 *
 * Flat, and built by the page rather than derived here from an `AreaProfile`.
 * Every figure on this page counts the facilities the filter row left standing,
 * and a profile carries the unfiltered ones — a list reading "281 facilities"
 * beside a header reading "120 in scope" is the page contradicting itself. The
 * band is computed the same way, so a row's badge and its polygon's fill cannot
 * disagree either.
 */
export interface PaneRow {
  id: string;
  name: string;
  /** A readiness band, for a row that *is* one thing — a facility. Null for an
   *  area, which is a population and gets `need` instead. */
  band: Band | null;
  note: string;
  /**
   * What the area needs, for a row that stands for many facilities.
   *
   * A state's band was the same word twelve times over — every one of them
   * Moderately ready — which is a column of ink telling the reader nothing and
   * offering nothing to rank on. Cost and gap count differ between every state
   * in the country, and they are what the programme allocates against.
   */
  need?: { gaps: number; costNGN: number };
}

export interface PaneList {
  /** Plural noun for the heading and the search placeholder. */
  label: string;
  rows: PaneRow[];
  onSelect: (id: string) => void;
}

export function AssessmentPane({
  scope,
  facilities,
  domains,
  gapAreas,
  list,
}: AssessmentPaneProps) {
  const distribution = useMemo(
    () => facilityDistribution(facilities, domains),
    [facilities, domains],
  );
  const lens = lensLabel(domains);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeader
        scope={scope}
        /**
         * A band only where a band is the subject.
         *
         * A facility has a readiness level and the map paints it, so its pill
         * stays. A state or an LGA no longer does: the polygons carry
         * investment need now, and a pill reading "Moderately ready" beside a
         * map coloured by naira invites the reader to think the two are the
         * same encoding. The facilities inside it still have bands, and the
         * split below still counts them — that is a different claim, about a
         * population rather than about the area.
         */
        band={
          scope.level === 'facility' ? facilityBandUnder(scope.facility, domains) : null
        }
      />

      {/* The header stays put; everything under it scrolls as one column — the
          same arrangement as the coverage pane, and for the same reason: two
          scroll regions inside 420px leaves neither one enough room. */}
      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto">
        {scope.level === 'facility' ? (
          <FacilityBlocks
            facility={scope.facility}
            domains={domains}
            gapAreas={gapAreas}
          />
        ) : (
          <>
            {/* One block or the other, never both.

                With a gap area ticked the population is "facilities carrying
                this gap", and the assessment publishes no readiness band for a
                gap area — bands exist at the facility, at the domain and
                nowhere between. A band split printed over that population
                would be a domain reading sitting under a gap-area heading,
                which reads as the gap area's own and is not. So the block
                names the selection instead, and the counting is left to Gaps
                in scope directly below. */}
            {gapAreas.length ? (
              <Block
                title="Gap areas in scope"
                note="The assessment publishes no readiness band for a gap area"
              >
                <SelectionBlock gapAreas={gapAreas} domains={domains} />
              </Block>
            ) : (
              <Block title="Assessed facilities" note={lens && `Banded by ${lens}`}>
                <BandCounts
                  facilities={facilities}
                  distribution={distribution}
                  domains={domains}
                />
              </Block>
            )}

            <Block
              title="Gaps in scope"
              note="What is actually wrong, and what closing it costs"
            >
              <GapBlocks facilities={facilities} domains={domains} gapAreas={gapAreas} />
            </Block>

          </>
        )}

        {/* The way down, and a facility is the bottom of it.

            At every level above, this list is what the pane is *for* — the
            other half of the map, ranked by need, and the way to the level
            below. A facility has no level below, so the list stops being
            navigation and becomes a roster of the siblings the reader has just
            filtered past. They came here to read this clinic; the way back to
            the others is the breadcrumb and the map, both already on screen. */}
        {scope.level !== 'facility' && <PaneListBlock list={list} />}
      </div>
    </div>
  );
}

/** Scope identity: what you are looking at, and at what level. */
function PaneHeader({ scope, band }: { scope: AssessmentScope; band: Band | null }) {
  const { name, level } =
    scope.level === 'all'
      ? { name: 'All assessed states', level: '12 states surveyed' }
      : scope.level === 'state'
        ? {
            name: scope.state.name,
            level: `State · ${formatCount(scope.state.lgaCount ?? 0)} LGAs`,
          }
        : scope.level === 'lga'
          ? { name: scope.lga.name, level: `LGA · ${scope.state.name}` }
          : {
              name: scope.facility.name,
              level: `Facility · ${scope.facility.lga}, ${scope.facility.state}`,
            };

  return (
    <div className="shrink-0 border-b border-border px-4 py-3">
      <p className="mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{level}</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight text-foreground">{name}</h2>
        {band && <BandBadge band={band} size="sm" />}
      </div>
    </div>
  );
}

/**
 * The single-facility reading. No distribution — it is one row, not a set.
 *
 * Under a domain the block narrows to it: that domain's band, then only its
 * gaps. Every other figure on this page already answers to the Domain filter,
 * and four domain bands standing above a gap list cut down to one would put a
 * reading and its evidence out of step — the bands would answer a question the
 * list beneath them no longer does.
 */
function FacilityBlocks({
  facility,
  domains,
  gapAreas,
}: {
  facility: FacilitySummary;
  domains: FacilityThemeId[];
  gapAreas: string[];
}) {
  const picked: readonly GapDomainId[] = domains;

  const themes = picked.length
    ? FACILITY_THEMES.filter((t) => picked.includes(t.id))
    : FACILITY_THEMES;

  /**
   * This facility's gaps, grouped by domain, and what each group costs.
   *
   * The tree the aggregate levels render has no branching here: a gap column
   * holds one value, so a facility carries at most one condition per area, and
   * domain → area → condition collapses to domain → one row per gap. There is
   * nothing to expand, so nothing is collapsed.
   *
   * **Ordered by urgency inside a domain, not by cost.** The aggregate levels
   * sort on money because the question there is where a budget goes; the
   * question at a clinic is what has to happen before anyone can deploy, and
   * that is the horizon. Cost breaks ties, so the grouping still reads as a
   * spending plan.
   *
   * Everything is derived from the same filtered `gaps` array the list renders
   * — never from `facility.costByDomain`, which is the whole facility's and
   * would contradict the rows above it the moment a domain or gap area is
   * ticked.
   */
  const { groups, cost, unpriced, gapCount, schedule, actionCount } = useMemo(() => {
    const offered = offeredGapIds(domains, gapAreas);
    const mine = facility.gaps.filter((id) => offered.has(id));

    let cost = 0;
    let unpriced = 0;
    /**
     * The same money, split by when it has to be spent.
     *
     * Over **interventions, not gaps** — a power gap fires two, a critical
     * install and an optional grid connection, and they belong in different
     * quarters. So these counts sum to more than the gap count above them, and
     * the column is labelled actions to say so. The costs do sum to the total,
     * because every intervention is counted once.
     *
     * `scripts/ingest-assessment.mjs` checks exactly this split against the
     * sheet's own four summary columns in all 2,806 rows, so these are the
     * source's numbers rather than an interpretation of them.
     */
    const byHorizon = new Map<Horizon, { actions: number; cost: number; unpriced: number }>();
    const per = new Map<string, { cost: number; unpriced: number; gaps: typeof rows }>();
    type Row = {
      id: string;
      area: string;
      condition: string;
      cost: number;
      unpriced: number;
      urgency: number;
      interventions: (typeof GAP_BY_ID)[string]['interventions'];
    };
    const rows: Row[] = [];

    for (const id of mine) {
      const gap = GAP_BY_ID[id]!;
      const c = gapCostNGN(gap);
      cost += c.costNGN;
      unpriced += c.unpriced;
      for (const iv of gap.interventions) {
        const h = byHorizon.get(iv.horizon) ?? { actions: 0, cost: 0, unpriced: 0 };
        h.actions += 1;
        if (iv.costNGN === null) h.unpriced += 1;
        else h.cost += iv.costNGN;
        byHorizon.set(iv.horizon, h);
      }

      const row: Row = {
        id,
        area: `${GAP_AREA_BY_ID[gap.area]?.label ?? gap.area} gap`,
        condition: gap.label,
        cost: c.costNGN,
        unpriced: c.unpriced,
        urgency: gapUrgency(id),
        interventions: gap.interventions,
      };
      rows.push(row);
      const acc = per.get(gap.domain) ?? { cost: 0, unpriced: 0, gaps: [] as Row[] };
      acc.cost += c.costNGN;
      acc.unpriced += c.unpriced;
      acc.gaps.push(row);
      per.set(gap.domain, acc);
    }

    const groups = GAP_DOMAINS.filter((d) => per.has(d.id)).map((d) => {
      const acc = per.get(d.id)!;
      return {
        id: d.id,
        label: d.label,
        cost: acc.cost,
        unpriced: acc.unpriced,
        gaps: [...acc.gaps].sort((a, b) => a.urgency - b.urgency || b.cost - a.cost),
      };
    });

    // Worst-first, and only the horizons in play — a row of zeroes for a
    // quarter with nothing in it is noise.
    const schedule = HORIZONS.filter((h) => byHorizon.has(h)).map((h) => ({
      horizon: h,
      ...byHorizon.get(h)!,
    }));

    return {
      groups,
      cost,
      unpriced,
      gapCount: mine.length,
      schedule,
      actionCount: schedule.reduce((sum, h) => sum + h.actions, 0),
    };
  }, [facility, domains, gapAreas]);

  return (
    <>
      <Block
        title="Readiness"
        note={
          picked.length
            ? picked.length === 1
              ? 'The domain in view'
              : 'The domains in view'
            : undefined
        }
      >
        <div className="space-y-2">
          {/* Both overall readings, and only when no domain is ticked. The
              source has no per-domain deployment band, so under a domain the
              question the pair answers is not one this facility can be asked —
              the domain's own band stands alone instead, matching what the map
              is painting. */}
          {!picked.length && (
            <>
              <BandLine label="EMR use" band={facility.useBand} />
              <BandLine label="EMR deployment" band={facility.deploymentBand} />
              <div className="my-2.5 border-t border-border" />
            </>
          )}
          {themes.map((theme) => (
            <BandLine
              key={theme.id}
              label={theme.label}
              band={facility.themeBands[theme.id as FacilityThemeId] ?? null}
            />
          ))}
        </div>
      </Block>

      {/* Gaps and their money in one block.

          They used to be two — the list, then a separate "What it costs" card
          repeating the domains underneath it. A reader comparing a domain's
          subtotal against the gaps that produced it had to hold one block in
          their head while scrolling to the other, and the two could disagree
          under a filter without either of them saying so. The subtotal now sits
          on the heading of the gaps it is the sum of. */}
      <Block
        title="Gaps at this facility"
        note={
          gapCount
            ? `${gapCount} to close${picked.length ? ' in the domains in view' : ''}`
            : undefined
        }
      >
        <FacilityGaps
          groups={groups}
          schedule={schedule}
          actionCount={actionCount}
          cost={cost}
          unpriced={unpriced}
          scoped={picked.length > 0}
        />
      </Block>

      <Block title="This facility">
        <dl className="space-y-1.5 text-[13px]">
          <Detail term="Functionality" value={facility.functionalityLevel} />
          {/* Omitted rather than guessed where the raw export could not be
              matched: four fifths of these facilities are rural, so a default
              would read as the answer instead of as its absence. */}
          {facility.geography && (
            <Detail
              term="Setting"
              value={facility.geography === 'urban' ? 'Urban' : 'Rural'}
            />
          )}
          <Detail term="BHCPF" value={facility.isBHCPF ? 'Enrolled' : 'Not enrolled'} />
          <Detail term="Zone" value={facility.zone} />
          {facility.dailyClientLoad && (
            <Detail term="Daily client load" value={facility.dailyClientLoad} />
          )}
          {/* Only where there is one — absent rather than blank for the two
              facilities that carry none, because an empty field reads as a
              value that failed to load. A coordinate a reader can only look at
              gets transcribed into a phone by hand, which is where the digit
              errors come from, so it is copyable and it opens somewhere that
              can navigate to it. See `MapCoordinates`. */}
          {facility.lat != null && facility.lon != null && (
            <div className="flex items-baseline justify-between gap-3 pt-0.5">
              <dt className="text-muted-foreground">Coordinates</dt>
              <dd className="min-w-0">
                <FacilityCoordinates lat={facility.lat} lon={facility.lon} />
              </dd>
            </div>
          )}
        </dl>
      </Block>

      <ConnectivityBlock facility={facility} />
    </>
  );
}

/**
 * Mobile-network measurement, in a block of its own.
 *
 * Separate from the readiness blocks deliberately: these are *measurements*,
 * not judgements, so nothing here may take band colour. A distance and a signal
 * grade sit beside a readiness finding as context, and the moment they are
 * painted in the readiness hues the page starts implying that "Excellent 4G" is
 * itself a readiness reading.
 *
 * Airtel contributes only a distance — its serviceability and site-name columns
 * are empty in every row of the source, so the feasibility judgement behind the
 * satellite interventions rests on MTN alone. That is worth being able to see
 * on the facility it was made about.
 */
function ConnectivityBlock({ facility }: { facility: FacilitySummary }) {
  const has =
    facility.mtnBaseStation ||
    facility.mtnServiceability ||
    facility.mtn4gSignal ||
    facility.mtnDistanceKm != null ||
    facility.airtelDistanceM != null;
  if (!has) return null;

  return (
    <Block title="Mobile network" note="Measured, not a readiness reading">
      <dl className="space-y-1.5 text-[13px]">
        {facility.mtnServiceability && (
          <Detail term="MTN serviceability" value={facility.mtnServiceability} />
        )}
        {facility.mtn4gSignal && <Detail term="MTN 4G signal" value={facility.mtn4gSignal} />}
        {facility.mtnBaseStation && (
          <Detail term="MTN base station" value={facility.mtnBaseStation} mono />
        )}
        {facility.mtnDistanceKm != null && (
          <Detail term="Distance to MTN site" value={`${facility.mtnDistanceKm.toFixed(2)} km`} />
        )}
        {facility.airtelDistanceM != null && (
          <Detail
            term="Distance to Airtel site"
            value={`${formatCount(facility.airtelDistanceM)} m`}
          />
        )}
      </dl>
    </Block>
  );
}

/** A gap's place in the urgency order, for sorting. Most urgent first. */
function gapUrgency(id: string): number {
  const gap = GAP_BY_ID[id];
  if (!gap) return HORIZONS.length;
  let worst = HORIZONS.length;
  for (const iv of gap.interventions) worst = Math.min(worst, HORIZONS.indexOf(iv.horizon));
  return worst;
}

/** Label left, band right — the pane's one way of stating a single band. The
 *  note is for a row that has to explain why it has none. */
function BandLine({ label, band, note }: { label: string; band: Band | null; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate text-[13px] text-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {note && <span className="mono text-[10px] text-muted-foreground">{note}</span>}
        <BandBadge band={band} size="sm" />
      </span>
    </div>
  );
}

function Detail({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn('text-right text-foreground', mono && 'mono text-xs')}>{value}</dd>
    </div>
  );
}

/**
 * What the Gap area filter is asking for, named rather than counted.
 *
 * Takes the place of the band split whenever a gap area is ticked. The reason
 * is a fact about the source, not a display preference: readiness bands exist
 * at the facility and at the domain, and at no level between them. A gap area
 * has none, and the block that used to sit here would have supplied the
 * domain's — printed under a heading the reader had just filtered to a gap
 * area, which invites exactly the reading the data does not support.
 *
 * So the block says what is selected and stops. The size of the population it
 * selects is one card below, in Gaps in scope, where it is a count of
 * facilities carrying a gap rather than a judgement about them.
 *
 * Grouped by domain because that is the hierarchy the selection was made in —
 * Domain scopes which areas the control offers, the same way State scopes LGA.
 */
function SelectionBlock({
  gapAreas,
  domains,
}: {
  gapAreas: string[];
  domains: FacilityThemeId[];
}) {
  const groups = useMemo(() => {
    const areas = gapAreas
      .map((id) => GAP_AREA_BY_ID[id])
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .sort((a, b) => a.order - b.order);

    // Every domain that owns a ticked area, plus any the Domain control ticked
    // without picking an area inside it — that domain is narrowing what the
    // control *offers* and nothing else, and saying so is better than leaving
    // the reader to infer it from a heading that never appears.
    const ids = new Set<FacilityThemeId>([
      ...areas.map((a) => a.domain as FacilityThemeId),
      ...domains,
    ]);

    return FACILITY_DOMAIN_IDS.filter((id) => ids.has(id)).map((id) => ({
      id,
      label: GAP_DOMAIN_LABEL[id],
      areas: areas.filter((a) => a.domain === id),
    }));
  }, [gapAreas, domains]);

  return (
    <ul className="space-y-2.5">
      {groups.map((group) => (
        <li key={group.id}>
          <p className="mono text-[9.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
            {group.label}
          </p>
          {group.areas.length ? (
            <ul className="mt-1 space-y-0.5">
              {group.areas.map((area) => (
                <li key={area.id} className="text-[13px] leading-snug text-foreground">
                  {area.label} gap
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] italic leading-snug text-muted-foreground">
              No gap area selected — this domain is only narrowing what the Gap
              area filter offers.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The headline: how many facilities were assessed, and how they split.
 *
 * Figures rather than a stacked bar, which is where the coverage pane landed
 * for the same reason — the bar encoded exactly the three numbers printed under
 * it, and in a 420px column the height it cost was better spent on the numbers.
 * Count and share are both set bold because both are asked for: the count is
 * what a budget is built from, the share is what makes two states comparable.
 */
function BandCounts({
  facilities,
  distribution,
  domains,
}: {
  facilities: FacilitySummary[];
  distribution: BandDistribution;
  domains: FacilityThemeId[];
}) {
  const total = facilities.length;
  const scored = distributionTotal(distribution);
  const mode = domainSelectionMode(domains);

  return (
    <div>
      <p className="mono text-[30px] font-semibold leading-none tracking-tight text-foreground">
        {formatCount(total)}
      </p>
      <p className="mono mt-1 text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
        {total === 1 ? 'facility in scope' : 'facilities in scope'}
      </p>

      {scored === 0 ? (
        <p className="mt-3 text-[13px] italic text-muted-foreground">
          None of them carries a readiness band.
        </p>
      ) : mode === 'multi' ? (
        /* Two or three domains: one row each, side by side.

           Not a single figure, because the assessment publishes no reading for a
           combination and this app no longer invents one. The rows are the
           answer to what the reader asked — how do these domains sit — stated at
           the grain the data actually carries it. */
        <PerDomainSplit facilities={facilities} domains={domains} />
      ) : (
        /**
         * One reading, in cards, whether a domain is selected or not.
         *
         * `distribution` is already the right column either way — the domain's
         * own band under a selection, the overall EMR-use band without one —
         * because `facilityBandUnder` decides that once for the whole page.
         *
         * The EMR-deployment split used to sit beside it here, and its removal
         * is deliberate: all four domain readings are *readiness for EMR use*,
         * so pairing the overall view with a deployment row put the block on a
         * different footing from every other state of itself. Selecting a
         * domain then silently changed which question the block was answering.
         * One scale throughout means ticking a domain narrows the reading
         * rather than swapping it.
         *
         * The deployment reading is not lost — it is a facility-level fact and
         * the facility card still carries it beside the use band, which is
         * where the distance between the two is worth reading.
         */
        <BandCards counts={distribution} showPercent className="mt-3.5" />
      )}
    </div>
  );
}

/**
 * Two or three domains, one row each.
 *
 * The shape the pane takes when the reader has asked something the source does
 * not answer in a single column. Rather than compose one, the rows put the
 * selected domains beside each other and let the comparison be the reading —
 * which is what the reader was after in ticking more than one.
 *
 * Counts and a bar together, unlike the contribution block above, which is a
 * chooser and can lean on the bar alone. This is the headline: it stands where
 * a figure the size of `formatCount(total)` used to be, and it has to carry the
 * numbers a plan is written from.
 */
function PerDomainSplit({
  facilities,
  domains,
}: {
  facilities: FacilitySummary[];
  domains: FacilityThemeId[];
}) {
  // Best first, the same order as the `BandCards` this stands in for. The two
  // states of one block must not run their columns in opposite directions, or
  // ticking a second domain would mirror the table under the reader.
  const order: Band[] = ['ready', 'moderately_ready', 'not_ready'];

  const rows = useMemo(
    () =>
      domains.map((id) => ({
        id,
        label: THEME_BY_ID[id].shortLabel,
        dist: facilityDomainDistribution(facilities, id),
      })),
    [facilities, domains],
  );

  return (
    <div className="mt-3.5">
      <div className="mono flex items-baseline gap-2 border-b border-border pb-1 text-[9px] uppercase tracking-[0.07em] text-muted-foreground">
        <span className="min-w-0 flex-1">Domain</span>
        {order.map((b) => (
          <span key={b} className="w-[46px] shrink-0 text-right">
            {BAND_LABEL[b].replace('Moderately ready', 'Moderate')}
          </span>
        ))}
      </div>

      <ul>
        {rows.map(({ id, label, dist }) => (
          <li
            key={id}
            className="flex items-baseline gap-2 border-b border-border py-1.5 last:border-0"
          >
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{label}</span>
            {order.map((b) => (
              <span
                key={b}
                className={cn(
                  'mono w-[46px] shrink-0 text-right text-[12px] font-semibold tabular-nums',
                  BAND_CLASSES[b].text,
                )}
              >
                {formatCount(dist[b])}
              </span>
            ))}
          </li>
        ))}
      </ul>

      {/* Said once, under the rows. Without it the table reads as a breakdown of
          the facility count above — three columns that sum to the total — when
          each row is in fact the same facilities counted again under a different
          domain. */}
      <p className="mt-2 text-[11px] italic leading-snug text-muted-foreground">
        Every row counts the same facilities under a different domain, so the rows
        do not add up. The assessment publishes no combined reading.
      </p>
    </div>
  );
}


/**
 * The gap reading: how many, spread over how many facilities, and what it costs.
 *
 * Three figures at the top because they are three different questions and a
 * programme asks all of them. *Gaps* is instances, not distinct problems — one
 * facility with four gaps is four, because four things have to be bought or
 * done. *Facilities affected* is how wide it goes. *Cost* is what the first two
 * come to, and it is smaller than the gap count implies, because two of the
 * five domains are closed by attention rather than procurement.
 *
 * Then the gaps themselves, commonest first. Commonest rather than costliest:
 * this pane answers "what is wrong here", and the money question has a page of
 * its own that can phase and rank it properly.
 */
function GapBlocks({
  facilities,
  domains,
  gapAreas,
}: {
  facilities: FacilitySummary[];
  domains: FacilityThemeId[];
  /** The ticked gap areas. Narrows *which gaps are counted*, not only which
   *  facilities are in scope — see `offeredGapIds`. */
  gapAreas: string[];
}) {
  const { tree, instances, affected, cost, unpriced } = useMemo(() => {
    /**
     * The gaps this block counts — both filters, not just Domain.
     *
     * A gap area selection narrows the population *and* the gaps counted
     * within it. Ticking the nine Technical Infrastructure areas asks what
     * those nine cost; answering with every gap those facilities carry returns
     * the national total instead — 30,557 gaps and ₦16.3bn against Technical
     * Infrastructure's own 18,667 and ₦12.9bn, printed two rows below in the
     * same card.
     */
    const offered = offeredGapIds(domains, gapAreas);
    /**
     * The tree the block renders: domain → gap area → condition.
     *
     * The source's own three levels, and the reason the flat list it replaces
     * read badly — ordered by facility count, that list stepped between domains
     * on almost every row, so nothing accumulated as the eye went down it.
     *
     * Each level carries all three headline figures, and the relationship
     * between two of them changes with depth, which is worth stating because
     * the table makes it visible:
     *
     *   domain     gaps ≠ facilities. 18,667 technical gaps sit in 2,806
     *              facilities, because one facility has several.
     *   area       gaps = facilities, exactly. A gap column holds one value,
     *              so a facility carries at most one condition per area.
     *   condition  the same, one rung further down.
     *
     * Cost adds up at every level. Facilities never does — a facility with a
     * power problem and a wiring problem is one facility in the domain row and
     * appears in two area rows beneath it. Said once under the table.
     */
    const perCondition = new Map<string, number>();
    type Acc = { gaps: number; facs: Set<string>; cost: number; unpriced: number };
    const perArea = new Map<string, Acc>();
    const perDomain = new Map<string, Acc>();

    // The headline tiles, from the same single pass. `instances` counts gaps
    // and `affected` counts clinics — the pair the tiles print, and the pair
    // the domain rows below diverge on for the same reason.
    let instances = 0;
    let cost = 0;
    const affected = new Set<string>();

    for (const f of facilities) {
      let hit = false;
      for (const id of f.gaps) {
        if (!offered.has(id)) continue;
        const gap = GAP_BY_ID[id]!;
        const { costNGN: c, unpriced: u } = gapCostNGN(gap);
        instances += 1;
        cost += c;
        hit = true;
        perCondition.set(id, (perCondition.get(id) ?? 0) + 1);

        const a = perArea.get(gap.area) ?? { gaps: 0, facs: new Set<string>(), cost: 0, unpriced: 0 };
        a.gaps += 1;
        a.facs.add(f.uuid);
        a.cost += c;
        a.unpriced += u;
        perArea.set(gap.area, a);

        const d =
          perDomain.get(gap.domain) ?? { gaps: 0, facs: new Set<string>(), cost: 0, unpriced: 0 };
        d.gaps += 1;
        d.facs.add(f.uuid);
        d.cost += c;
        d.unpriced += u;
        perDomain.set(gap.domain, d);
      }
      if (hit) affected.add(f.uuid);
    }

    /** Costliest first at every level — see the sort note on the old
     *  breakdown. Ties break on gaps then label, so a row of ₦0 actions keeps
     *  a stable place between renders instead of reshuffling. */
    const byCost = (a: { cost: number; gaps: number; label: string },
                    b: { cost: number; gaps: number; label: string }) =>
      b.cost - a.cost || b.gaps - a.gaps || a.label.localeCompare(b.label);

    const tree = GAP_DOMAINS.filter((d) => perDomain.has(d.id))
      .map((d) => {
        const acc = perDomain.get(d.id)!;
        const areas = GAP_AREAS.filter((a) => a.domain === d.id && perArea.has(a.id))
          .map((a) => {
            const av = perArea.get(a.id)!;
            return {
              id: a.id,
              label: `${a.label} gap`,
              gaps: av.gaps,
              facs: av.facs.size,
              cost: av.cost,
              unpriced: av.unpriced,
              conditions: gapsInArea(a.id)
                .filter((g) => perCondition.has(g.id))
                .map((g) => ({
                  id: g.id,
                  label: g.label,
                  gaps: perCondition.get(g.id)!,
                  facs: perCondition.get(g.id)!,
                  cost: perCondition.get(g.id)! * gapCostNGN(g).costNGN,
                  unpriced: perCondition.get(g.id)! * gapCostNGN(g).unpriced,
                }))
                .sort(byCost),
            };
          })
          .sort(byCost);
        return {
          id: d.id,
          label: d.label,
          gaps: acc.gaps,
          facs: acc.facs.size,
          cost: acc.cost,
          unpriced: acc.unpriced,
          areas,
        };
      })
      .sort(byCost);

    return {
      tree,
      instances,
      affected: affected.size,
      cost,
      /** Actions in scope the sheet does not price — the footnote's trigger. */
      unpriced: [...perDomain.values()].reduce((sum, d) => sum + d.unpriced, 0),
    };
  }, [facilities, domains, gapAreas]);

  /**
   * Facilities failing in *every* selected domain at once.
   *
   * The counterpart to `affected` above, and only meaningful against two or
   * more domains — with one selected the two figures are the same number.
   *
   * It sits here rather than in its own block because it is the same
   * population counted more strictly, and separating them would invite the
   * reader to add them up. The pair is the point: `affected` is what the
   * programme has to budget for, this is the part of it no single workstream
   * can clear.
   *
   * Note it is the figure that actually moves. Every facility in the dataset
   * carries at least one technical infrastructure gap, so `affected` pins to
   * the full population whenever infrastructure is selected, while this falls
   * from 2,670 across two domains to 741 across all four.
   */
  const overlap = useMemo(
    () => (domains.length >= 2 ? domainOverlap(facilities, domains) : null),
    [facilities, domains],
  );

  /**
   * Which areas are showing their conditions.
   *
   * Collapsed by default: twenty areas and seventy-three conditions in a 420px
   * column is a wall, and the area is the level a reader is scanning for.
   *
   * One exception — filter to a single gap area and it opens itself. Asking for
   * exactly one area is asking what is wrong inside it, and a lone collapsed
   * row is the pane withholding the answer to the question just put to it.
   * Keyed on the selection so re-picking a different single area opens that one
   * instead of leaving the first one hanging open.
   */
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const auto = gapAreas.length === 1 ? gapAreas[0]! : null;
  const open = new Set(
    Object.entries(manual)
      .filter(([, v]) => v)
      .map(([k]) => k),
  );
  if (auto && manual[auto] === undefined) open.add(auto);
  const toggle = (id: string) =>
    setManual((m) => ({ ...m, [id]: !(m[id] ?? id === auto) }));

  if (!tree.length) return <Nothing>No gaps in scope.</Nothing>;

  return (
    <div>
      <TileRow className="grid-cols-3">
        <Tile label="Gaps" value={formatCount(instances)} note="to close" />
        <Tile label="Facilities" value={formatCount(affected)} note="with a gap" />
        {/* The cost card names the counting rule, because cost is the figure a
            reader is most likely to carry away and quote. The tiles are a
            union — everything wrong across the selected domains, the same
            grammar every other multi-select on this page uses — and the
            intersection below is a different question about the same
            population. */}
        <Tile
          label="Cost"
          value={formatNaira(cost, true)}
          note={domains.length ? 'across selected domains' : 'to close them'}
        />
      </TileRow>

      {/* The intersection, against the union in the cards above.

          Only from two domains up: with one selected the two are the same
          facilities, and drawing the distinction would imply one is being made. */}
      {overlap && (
        <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
          <span className="mono font-semibold tabular-nums text-foreground">
            {formatCount(overlap.all)}
          </span>{' '}
          of them carry a gap in <em>all {domains.length}</em> selected domains.
        </p>
      )}

      {/* The gap tree: domain → gap area → condition.

          Three columns because the reader has just read three tiles, and a
          breakdown that answers a different set of questions from the headline
          above it is a breakdown they have to re-learn.

          Gaps and Facilities are equal on every row below a domain, and that
          repetition is the point rather than noise: it is where the reader can
          see that one gap here means one facility, which is what makes an area
          count safe to read as a facility count. They part company only on a
          domain row, where several gaps land in the same clinic. */}
      <div className="mono mt-3.5 flex items-baseline gap-2 border-b border-border pb-1 text-[9px] uppercase tracking-[0.07em] text-muted-foreground">
        <span className="min-w-0 flex-1">Gap</span>
        <span className="w-[38px] shrink-0 text-right">Gaps</span>
        <span className="w-[38px] shrink-0 text-right">Facs</span>
        <span className="w-[52px] shrink-0 text-right">Cost</span>
      </div>

      <div className="mt-1.5">
        {tree.map((domain) => (
          <div key={domain.id} className="border-b border-border py-1.5 last:border-0">
            <Row
              label={domain.label}
              gaps={domain.gaps}
              facs={domain.facs}
              cost={domain.cost}
              unpriced={domain.unpriced}
              tone="domain"
            />
            <ul className="mt-1">
              {domain.areas.map((area) => (
                <li key={area.id}>
                  <Row
                    label={area.label}
                    gaps={area.gaps}
                    facs={area.facs}
                    cost={area.cost}
                    unpriced={area.unpriced}
                    tone="area"
                    expanded={open.has(area.id)}
                    onToggle={area.conditions.length ? () => toggle(area.id) : undefined}
                  />
                  {open.has(area.id) && (
                    <ul className="mb-1 ml-3 border-l border-border pl-2">
                      {area.conditions.map((c) => (
                        <li key={c.id}>
                          <Row
                            label={c.label}
                            gaps={c.gaps}
                            facs={c.facs}
                            cost={c.cost}
                            unpriced={c.unpriced}
                            tone="condition"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Said once, under the table, for the one column that does not add up.
          Cost does, at every level. */}
      <p className="mt-2 text-[11px] italic leading-snug text-muted-foreground">
        Gaps is shown only on a domain row, where several gaps land in the same
        clinic. Below it every gap is one facility, so the two columns would
        print the same number twice. Cost adds up at every level; facilities
        does not — a clinic with a power problem and a wiring problem is one
        facility on the domain row and appears under both areas.
        {unpriced > 0 && (
          <>
            {' '}
            <span className="mono not-italic">n/p</span> marks work the source
            does not price, and <span className="mono not-italic">+</span> a
            total that excludes some:{' '}
            <span className="mono not-italic tabular-nums">
              {formatCount(unpriced)}
            </span>{' '}
            action(s) here, all of them the connectivity blocker whose fix
            cannot be costed until someone establishes which connection reaches
            the site. Never ₦0, which is a real price the data also carries.
          </>
        )}
      </p>

    </div>
  );
}

/**
 * One row of the gap tree, at any of its three depths.
 *
 * One component rather than three, because the columns must line up down the
 * whole table — three near-identical row components drift the moment one of
 * them gets a tweak, and a misaligned cost column is the sort of thing that
 * makes a reader distrust the numbers rather than the layout.
 *
 * Depth is carried by `tone`, which sets weight and indent only. The figures
 * are rendered identically at every level: they mean the same thing all the
 * way down, and styling them differently would suggest otherwise.
 */
function Row({
  label,
  gaps,
  facs,
  cost,
  unpriced,
  tone,
  expanded,
  onToggle,
}: {
  label: string;
  gaps: number;
  facs: number;
  cost: number;
  /**
   * Actions here the sheet carries no price for.
   *
   * Kept apart from `cost` rather than folded in as zero, because the dataset
   * has both and they are opposite claims. Naming a focal person really is
   * free; "check which connection works, then use one" is unpriced because
   * nobody yet knows which connection that is. Both would print ₦0.
   */
  unpriced: number;
  tone: 'domain' | 'area' | 'condition';
  expanded?: boolean;
  /** Absent where there is nothing to open — an area with one condition in
   *  scope, which a click would only redraw. */
  onToggle?: () => void;
}) {
  const figures = (
    <>
      {/* Gaps only where it says something Facilities does not.

          Below a domain the two are the same number every time — a gap column
          holds one value, so a facility carries at most one condition per area
          — and printing 2,703 twice on the same row is a column of noise the
          reader has to check before they can ignore it. The blank is the
          finding: nothing here counts differently from the column beside it.
          The cell keeps its width so the numbers stay in line down the table. */}
      <span
        className="mono w-[38px] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
        aria-hidden={tone !== 'domain'}
      >
        {tone === 'domain' ? formatCount(gaps) : ''}
      </span>
      <span className="mono w-[38px] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {formatCount(facs)}
      </span>
      <span
        className="mono w-[52px] shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground"
        title={unpriced ? `${unpriced} action(s) the source does not price` : undefined}
      >
        {unpriced && !cost ? (
          <span className="font-normal text-muted-foreground">n/p</span>
        ) : (
          <>
            {formatNaira(cost, true)}
            {unpriced ? <span className="font-normal text-muted-foreground">+</span> : null}
          </>
        )}
      </span>
    </>
  );

  const text = cn(
    'min-w-0 flex-1 text-left leading-snug',
    tone === 'domain' && 'mono text-[9.5px] font-bold uppercase tracking-[0.09em] text-foreground',
    tone === 'area' && 'text-[12px] text-foreground',
    tone === 'condition' && 'text-[11.5px] text-muted-foreground',
  );

  if (!onToggle) {
    return (
      <div className={cn('flex items-baseline gap-2 py-0.5', tone !== 'domain' && 'pl-3')}>
        <span className={text}>{label}</span>
        {figures}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-baseline gap-2 rounded py-0.5 text-left hover:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <span
        aria-hidden
        className={cn(
          'mono w-3 shrink-0 text-[9px] text-muted-foreground transition-transform',
          expanded && 'rotate-90',
        )}
      >
        ▶
      </span>
      <span className={text}>{label}</span>
      {figures}
    </button>
  );
}

/**
 * One facility's gaps: domain, then the gaps inside it, then what to do.
 *
 * Takes the grouped rows rather than reading `facility.gaps` itself, because
 * the caller has already cut them to the domains and gap areas in view and
 * priced exactly that subset.
 *
 * Three depths, and each says a different kind of thing:
 *
 *   domain     a heading and a subtotal — where this clinic's money goes
 *   gap area   the category, with what closing it costs here
 *   condition  what the survey actually found, verbatim from the sheet
 *
 * Then the interventions, which are the point of the dataset: a gap the reader
 * cannot act on is a diagnosis without a prescription. They stay inline rather
 * than behind a disclosure because at facility level they are the deliverable —
 * the thing somebody buys — and the list is short enough to carry them.
 *
 * No gap or facility counts anywhere here. Both are always one.
 */
function FacilityGaps({
  groups,
  schedule,
  actionCount,
  cost,
  unpriced,
  scoped,
}: {
  schedule: { horizon: Horizon; actions: number; cost: number; unpriced: number }[];
  actionCount: number;
  groups: {
    id: string;
    label: string;
    cost: number;
    unpriced: number;
    gaps: {
      id: string;
      area: string;
      condition: string;
      cost: number;
      unpriced: number;
      interventions: { id: string; label: string; horizon: Horizon; costNGN: number | null }[];
    }[];
  }[];
  cost: number;
  unpriced: number;
  scoped: boolean;
}) {
  if (!groups.length) {
    return (
      <Nothing>
        {scoped
          ? 'Nothing outstanding in the domain in view.'
          : 'Nothing outstanding — this facility is ready.'}
      </Nothing>
    );
  }

  return (
    <div>
      {/* When the money has to be spent, before where it goes.

          The domain groups below answer "what is wrong here"; this answers
          "what has to happen before anyone can deploy", which is the question a
          clinic is actually visited to settle. Both are the same money — every
          intervention appears in exactly one row here and in exactly one group
          below — so the two totals agree.

          Counted in **actions, not gaps**: a power gap fires a critical install
          and an optional grid connection, and those belong in different
          quarters. That is why these rows sum past the gap count in the
          heading. */}
      <div className="mb-3.5">
        <div className="mono flex items-baseline gap-2 border-b border-border pb-1 text-[9px] uppercase tracking-[0.07em] text-muted-foreground">
          <span className="min-w-0 flex-1">When</span>
          <span className="w-[52px] shrink-0 text-right">Actions</span>
          <span className="w-[56px] shrink-0 text-right">Cost</span>
        </div>
        <ul className="mt-1">
          {schedule.map((row) => (
            <li key={row.horizon} className="flex items-baseline gap-2 py-0.5">
              <span
                className={cn(
                  'min-w-0 flex-1 text-[12px] leading-snug',
                  HORIZON_SEVERITY[row.horizon] === 'blocking'
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {HORIZON_LABEL[row.horizon]}
              </span>
              <span className="mono w-[52px] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {formatCount(row.actions)}
              </span>
              <Money cost={row.cost} unpriced={row.unpriced} className="w-[56px]" />
            </li>
          ))}
          <li className="flex items-baseline gap-2 border-t border-border py-1 mt-0.5">
            <span className="min-w-0 flex-1 text-[12px] font-medium text-foreground">
              All actions
            </span>
            <span className="mono w-[52px] shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
              {formatCount(actionCount)}
            </span>
            <Money cost={cost} unpriced={unpriced} className="w-[56px] font-semibold" />
          </li>
        </ul>
      </div>

      {groups.map((group) => (
        <section key={group.id} className="mb-3 last:mb-0">
          <div className="flex items-baseline gap-2 border-b border-border pb-1">
            <h4 className="mono min-w-0 flex-1 text-[9.5px] font-bold uppercase tracking-[0.09em] text-foreground">
              {group.label}
            </h4>
            <Money cost={group.cost} unpriced={group.unpriced} className="font-semibold" />
          </div>

          <ul className="mt-2 space-y-3">
            {group.gaps.map((gap) => (
              <li key={gap.id}>
                <div className="flex items-baseline gap-2">
                  <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-foreground">
                    {gap.area}
                  </p>
                  <Money cost={gap.cost} unpriced={gap.unpriced} />
                </div>
                {/* The finding, under the category it is filed as. Verbatim
                    from the sheet — "Power gap" is where it sits, this is what
                    is actually wrong. */}
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  {gap.condition}
                </p>

                {gap.interventions.length ? (
                  <ul className="mt-1.5 space-y-1.5 border-l border-border pl-2.5">
                    {gap.interventions.map((iv) => (
                      <li key={iv.id} className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] leading-snug text-muted-foreground">
                            {iv.label}
                          </span>
                          <HorizonChip horizon={iv.horizon} />
                        </span>
                        {/* Zero is printed, `null` is named. A gap that costs
                            nothing still has to be closed; one the source does
                            not price is a different thing entirely, and a blank
                            would let a reader take it for free. */}
                        <span className="mono shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {iv.costNGN == null ? (
                            <span className="italic opacity-70">Not costed</span>
                          ) : (
                            formatNaira(iv.costNGN, true)
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  /* 55 facilities carry a gap the source records with no action
                     behind it. Saying so is more honest than hiding the gap or
                     inventing a fix for it — see docs/data-queries. */
                  <p className="mt-1 border-l border-border pl-2.5 text-[12px] italic text-muted-foreground">
                    No intervention recorded.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex items-baseline gap-2 border-t border-border pt-2">
        <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">Total</span>
        <Money cost={cost} unpriced={unpriced} className="text-[13px] font-semibold" />
      </div>
      {unpriced > 0 && (
        <p className="mt-1.5 text-[11px] italic leading-snug text-muted-foreground">
          The total excludes {formatCount(unpriced)} action(s) the source does not
          price — never ₦0, which is a real price this data also carries.
        </p>
      )}
    </div>
  );
}

/**
 * A cost, with the unpriced case kept apart from a real zero.
 *
 * The same rule the gap tree uses one level up: `n/p` where nothing here is
 * priced, a trailing `+` on a total that leaves something out, and ₦0 only
 * where ₦0 is what the sheet says.
 */
function Money({
  cost,
  unpriced,
  className,
}: {
  cost: number;
  unpriced: number;
  className?: string;
}) {
  return (
    <span
      className={cn('mono shrink-0 text-right text-[11.5px] tabular-nums text-foreground', className)}
      title={unpriced ? `${unpriced} action(s) the source does not price` : undefined}
    >
      {unpriced && !cost ? (
        <span className="font-normal text-muted-foreground">n/p</span>
      ) : (
        <>
          {formatNaira(cost, true)}
          {unpriced ? <span className="font-normal text-muted-foreground">+</span> : null}
        </>
      )}
    </span>
  );
}

/** An intervention's urgency, as a chip. Text as well as colour — the four
 *  urgencies are not the three readiness bands and must not read as them. */
function HorizonChip({ horizon }: { horizon: Horizon }) {
  const blocking = HORIZON_SEVERITY[horizon] === 'blocking';
  return (
    <span
      className={cn(
        'mono mt-0.5 inline-block text-[9.5px] uppercase tracking-[0.06em]',
        blocking ? 'font-semibold text-foreground' : 'text-muted-foreground',
      )}
    >
      {HORIZON_SHORT[horizon]}
    </span>
  );
}
/**
 * The list at the bottom — one level down from wherever the reader is.
 *
 * It is the other way into the map: a reader who knows the name of the place
 * they want should not have to find it on a polygon, and at the facility level
 * there is no polygon to find. Searchable from about a dozen rows up, which is
 * where scanning stops being faster than typing.
 */
function PaneListBlock({ list }: { list: PaneList }) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.rows.filter((r) => r.name.toLowerCase().includes(q)) : list.rows;
  }, [list.rows, query]);

  const { label } = list;
  const total = list.rows.length;

  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <h3 className="mono text-[10px] font-bold uppercase tracking-[0.11em] text-foreground">
          {label}
        </h3>
        <span className="mono text-[10px] text-muted-foreground">{formatCount(total)}</span>
      </div>

      {total > 12 && (
        <div className="relative px-4 pt-2">
          <Search
            className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label.toLowerCase()}`}
            className="w-full rounded border border-input bg-surface py-1.5 pl-7 pr-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Nothing here" message="No row matches the current filters." />
      ) : (
        <ul className="mt-1 pb-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => list.onSelect(row.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-sunk focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {row.name}
                  </span>
                  <span className="mono block text-[10px] text-muted-foreground">
                    {row.note}
                    {row.need ? ` · ${formatCount(row.need.gaps)} gaps` : ''}
                  </span>
                </span>
                {row.need ? (
                  <span className="mono shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground">
                    {formatNaira(row.need.costNGN, true)}
                  </span>
                ) : (
                  <span
                    className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground"
                    aria-label={row.band ? BAND_LABEL[row.band] : 'No band'}
                  >
                    <BandBadge band={row.band} size="sm" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-4 py-3">
      <h3 className="mono text-[10px] font-bold uppercase tracking-[0.11em] text-foreground">
        {title}
      </h3>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{note}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/**
 * What the headline split is banded by — or nothing, when it is the default.
 *
 * There is no longer a phrase for a combination of domains, because there is no
 * longer a reading for one. "The weakest of 2 domains" named a value this app
 * computed and the assessment never published; the note now either names a
 * single published column or says the headline has fallen back to the overall
 * one. All four ticked reads as the default, which it is: narrowing to
 * everything narrows nothing.
 */
function lensLabel(domains: FacilityThemeId[]): string | undefined {
  const mode = domainSelectionMode(domains);
  if (mode === 'overall') return undefined;
  if (mode === 'single') return THEME_BY_ID[domains[0]!].label;
  return undefined;
}

function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] italic text-muted-foreground">{children}</p>;
}
