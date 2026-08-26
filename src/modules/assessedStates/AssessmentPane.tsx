import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import {
  GAP_BY_ID,
  GAP_DOMAINS,
  GAP_DOMAIN_LABEL,
  HORIZONS,
  HORIZON_SEVERITY,
  HORIZON_SHORT,
  gapCostNGN,
  gapsForDomains,
} from '@/lib/gapCatalogue';
import { facilityBandUnder } from '@/lib/archetype';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira, percentOf } from '@/lib/format';
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
  facilityDistribution,
  overallDistribution,
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

export function AssessmentPane({ scope, facilities, domains, list }: AssessmentPaneProps) {
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
          <FacilityBlocks facility={scope.facility} domains={domains} />
        ) : (
          <>
            <Block title="Assessed facilities" note={lens && `Banded by ${lens}`}>
              <BandCounts
                facilities={facilities}
                distribution={distribution}
                domains={domains}
              />
            </Block>

            <Block
              title="Gaps in scope"
              note="What is actually wrong, and what closing it costs"
            >
              <GapBlocks facilities={facilities} domains={domains} />
            </Block>

          </>
        )}

        <PaneListBlock list={list} />
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
}: {
  facility: FacilitySummary;
  domains: FacilityThemeId[];
}) {
  const picked: readonly GapDomainId[] = domains;

  const themes = picked.length
    ? FACILITY_THEMES.filter((t) => picked.includes(t.id))
    : FACILITY_THEMES;

  // The facility's own gaps, cut to the domains in view, ordered most urgent
  // first, and what that subset costs. `facility.costNGN` is the whole-facility
  // figure and would contradict the list under it the moment a domain is
  // ticked.
  const { gaps, cost, unpriced } = useMemo(() => {
    const offered = new Set(gapsForDomains(domains).map((g) => g.id));
    const gaps = facility.gaps
      .filter((id) => offered.has(id))
      .sort((a, b) => gapUrgency(a) - gapUrgency(b));
    let cost = 0;
    let unpriced = 0;
    for (const id of gaps) {
      const c = gapCostNGN(GAP_BY_ID[id]!);
      cost += c.costNGN;
      unpriced += c.unpriced;
    }
    return { gaps, cost, unpriced };
  }, [facility, domains]);

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

      <Block
        title="Gaps at this facility"
        note={
          unpriced
            ? `${formatNaira(cost)} to close · ${formatCount(unpriced)} not costed`
            : `${formatNaira(cost)} to close`
        }
      >
        <FacilityGaps gaps={gaps} scoped={picked.length > 0} />
      </Block>

      <Block title="This facility">
        <dl className="space-y-1.5 text-[13px]">
          <Detail term="Functionality" value={facility.functionalityLevel} />
          <Detail term="BHCPF" value={facility.isBHCPF ? 'Enrolled' : 'Not enrolled'} />
          <Detail term="Zone" value={facility.zone} />
          {facility.dailyClientLoad && (
            <Detail term="Daily client load" value={facility.dailyClientLoad} />
          )}
          {/* Only where there is one. This dataset carries no coordinates, so
              the row is absent rather than blank — an empty field reads as a
              value that failed to load. A coordinate a reader can only look at
              gets transcribed into a phone by hand, which is where the digit
              errors come from, so where one exists it is copyable and it opens
              somewhere that can navigate to it. See `MapCoordinates`. */}
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

  const dual = useMemo(
    () => ({
      use: overallDistribution(facilities, 'useBand'),
      deployment: overallDistribution(facilities, 'deploymentBand'),
    }),
    [facilities],
  );

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
      ) : domains.length ? (
        /* Under a domain there is one reading to show — that domain's, which is
           always an EMR-use band. The source has no per-domain deployment
           reading, so the pair below would be the same row twice. */
        <BandCards counts={distribution} showPercent className="mt-3.5" />
      ) : (
        <DualBandTable use={dual.use} deployment={dual.deployment} />
      )}
    </div>
  );
}

/**
 * The two overall readings, one above the other.
 *
 * Both at once rather than a control to switch between them, because the
 * interesting thing here is the *distance* between the two rows and distance is
 * only visible when both are on screen. A reader looking at Niger should see
 * that 21 of its facilities are clear to deploy into and none at all is in
 * shape to run an EMR — one number is a plan, the pair is the finding.
 *
 * A table rather than two sets of cards: stacking two `BandCards` costs about
 * 150px of a 420px column to say six numbers, and the shared row header is what
 * makes the two rows read as one comparison rather than two blocks that happen
 * to be adjacent.
 *
 * The Not-ready column is identical between the rows by construction — the same
 * facilities, not merely the same count, since a critical gap sinks both
 * readings. Seeing it repeat is the point: it shows the reader immediately that
 * the two readings agree about the floor and differ only above it.
 */
function DualBandTable({ use, deployment }: { use: BandDistribution; deployment: BandDistribution }) {
  const order: Band[] = ['not_ready', 'moderately_ready', 'ready'];
  const rows: { label: string; dist: BandDistribution }[] = [
    { label: 'EMR use', dist: use },
    { label: 'EMR deployment', dist: deployment },
  ];

  return (
    <div className="mt-3.5 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="w-[38%] pb-1.5" />
            {order.map((band) => (
              <th
                key={band}
                className={cn(
                  'mono pb-1.5 text-right text-[9px] font-bold uppercase leading-tight tracking-[0.07em]',
                  BAND_CLASSES[band].text,
                )}
              >
                {BAND_LABEL[band]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, dist }) => {
            const total = distributionTotal(dist);
            return (
              <tr key={label} className="border-t border-border">
                <th
                  scope="row"
                  className="py-2 pr-2 text-[12.5px] font-medium leading-tight text-foreground"
                >
                  {label}
                </th>
                {order.map((band) => (
                  <td key={band} className="py-2 text-right align-baseline">
                    <span className="mono block text-[15px] font-semibold leading-none tabular-nums text-foreground">
                      {formatCount(dist[band] ?? 0)}
                    </span>
                    <span className="mono mt-1 block text-[10px] leading-none tabular-nums text-muted-foreground">
                      {total ? percentOf(dist[band] ?? 0, total, 1) : '—'}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
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
}: {
  facilities: FacilitySummary[];
  domains: FacilityThemeId[];
}) {
  const { rows, instances, affected, cost, byDomain, total } = useMemo(() => {
    const offered = new Set(gapsForDomains(domains).map((g) => g.id));
    const counts = new Map<string, number>();
    let instances = 0;
    let cost = 0;
    const affected = new Set<string>();

    for (const f of facilities) {
      let hit = false;
      for (const id of f.gaps) {
        if (!offered.has(id)) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
        instances += 1;
        cost += gapCostNGN(GAP_BY_ID[id]!).costNGN;
        hit = true;
      }
      if (hit) affected.add(f.uuid);
    }

    const rows = [...counts.entries()]
      .map(([id, n]) => ({ gap: GAP_BY_ID[id]!, n }))
      .sort((a, b) => b.n - a.n);

    // Only the domains actually in play. A row of zeroes for a domain the
    // filter has excluded is noise, and one for leadership would be wrong
    // rather than empty — its gaps belong to a state and no facility carries
    // them, so counting facilities against it would be counting the wrong noun.
    const perDomain = new Map<string, { gaps: number; cost: number }>();
    for (const { gap, n } of rows) {
      const acc = perDomain.get(gap.domain) ?? { gaps: 0, cost: 0 };
      acc.gaps += n;
      perDomain.set(gap.domain, acc);
    }
    for (const f of facilities) {
      for (const id of f.gaps) {
        const gap = GAP_BY_ID[id];
        if (!gap || !offered.has(id)) continue;
        const acc = perDomain.get(gap.domain);
        if (acc) acc.cost += gapCostNGN(gap).costNGN;
      }
    }

    const byDomain = GAP_DOMAINS.filter((d) => perDomain.has(d.id)).map((d) => ({
      id: d.id,
      label: d.label,
      ...perDomain.get(d.id)!,
    }));

    return {
      rows,
      instances,
      affected: affected.size,
      cost,
      byDomain,
      total: byDomain.reduce((sum, d) => sum + d.cost, 0),
    };
  }, [facilities, domains]);

  if (!rows.length) return <Nothing>No gaps in scope.</Nothing>;

  return (
    <div>
      <TileRow className="grid-cols-3">
        <Tile label="Gaps" value={formatCount(instances)} note="to close" />
        <Tile label="Facilities" value={formatCount(affected)} note="with a gap" />
        <Tile label="Cost" value={formatNaira(cost, true)} note="to close them" />
      </TileRow>

      {/* Where the money is, by domain.
          
          What is left of the old "four facility domains" block, and deliberately
          not a rebuild of it. That block gave each domain a readiness split,
          which under a Domain filter was the headline card above repeated word
          for word — and a band is a summary of gaps anyway, shown at finer
          grain in the list below. This says the thing a band cannot: how much of
          the problem each domain holds, and what its share of the bill is.
          
          The bar is the share of cost, not of gaps, and the two diverge sharply:
          data use is the commonest gap in the country and costs nothing at all,
          because what closes it is a habit rather than a purchase. A domain
          reading 0% here is not a domain to ignore — it is a domain to act on
          without a budget. */}
      <ul className="mt-3 space-y-1.5 border-b border-border pb-3">
        {byDomain.map(({ id, label, gaps, cost }) => (
          <li key={id} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{label}</span>
            <span className="mono shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatCount(gaps)}
            </span>
            <span className="h-1.5 w-10 shrink-0 rounded-[1px] bg-surface-sunk" aria-hidden>
              <span
                className="block h-full rounded-[1px] bg-foreground/55"
                style={{ width: `${cost && total ? Math.max(4, (cost / total) * 100) : 0}%` }}
              />
            </span>
            <span className="mono w-[52px] shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
              {formatNaira(cost, true)}
            </span>
          </li>
        ))}
      </ul>

      {/* A header, because the column was a bare number against a sentence and
          a bare number is a guess. Each row is one gap out of the catalogue —
          a specific, named thing that is wrong — and the figure is how many
          facilities in scope carry it. */}
      <div className="mono mt-3.5 flex items-baseline gap-2 border-b border-border pb-1 text-[9px] uppercase tracking-[0.07em] text-muted-foreground">
        <span className="min-w-0 flex-1">Gap</span>
        <span className="shrink-0">Facilities</span>
      </div>

      <ul className="mt-2 space-y-1.5">
        {rows.map(({ gap, n }) => (
          <li key={gap.id} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] leading-snug text-foreground">{gap.label}</span>
              <span className="mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                {gap.subDomain}
              </span>
            </span>
            <span className="mono shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground">
              {formatCount(n)}
            </span>
          </li>
        ))}
      </ul>

    </div>
  );
}

/**
 * One facility's own gaps — the list, not a count of it.
 *
 * Takes the ids rather than reading `facility.gaps` itself, because the caller
 * has already cut them to the domains in view and priced exactly that subset.
 */
function FacilityGaps({
  gaps,
  scoped,
}: {
  gaps: string[];
  scoped: boolean;
}) {
  if (!gaps.length) {
    return (
      <Nothing>
        {scoped
          ? 'Nothing outstanding in the domain in view.'
          : 'Nothing outstanding — this facility is ready.'}
      </Nothing>
    );
  }
  return (
    <ul className="space-y-3">
      {gaps.map((id) => {
        const gap = GAP_BY_ID[id];
        if (!gap) return null;
        return (
          <li key={id}>
            <p className="text-[12.5px] leading-snug text-foreground">{gap.label}</p>
            <p className="mono mt-0.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
              {GAP_DOMAIN_LABEL[gap.domain]} · {gap.subDomain}
            </p>

            {/* The interventions, which are the point of the dataset: a gap the
                reader cannot act on is a diagnosis without a prescription. */}
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
                        nothing still has to be closed; one the source does not
                        price is a different thing entirely, and a blank would
                        let a reader take it for free. */}
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
        );
      })}
    </ul>
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

/** "Workforce Capacity", "the weakest of 2 domains", or nothing at all. */
function lensLabel(domains: FacilityThemeId[]): string | undefined {
  if (!domains.length) return undefined;
  if (domains.length === 1) return THEME_BY_ID[domains[0]!].label;
  return `the weakest of ${domains.length} domains`;
}

function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] italic text-muted-foreground">{children}</p>;
}
