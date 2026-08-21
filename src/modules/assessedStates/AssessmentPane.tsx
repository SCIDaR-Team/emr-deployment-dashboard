import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { BAND_LABEL } from '@/lib/bands';
import {
  GAP_BY_ID,
  GAP_DOMAINS,
  GAP_DOMAIN_LABEL,
  gapCostNGN,
  gapsForDomains,
} from '@/lib/gapCatalogue';
import { facilityBandUnder } from '@/lib/archetype';
import { cn } from '@/lib/cn';
import { formatCount, formatNaira } from '@/lib/format';
import { FACILITY_THEMES, THEME_BY_ID } from '@/lib/themes';
import { BandBadge, BandCards, EmptyState, Tile, TileRow } from '@/components/ui';
import type { Band, BandDistribution, FacilitySummary, FacilityThemeId } from '@/lib/types';
import {
  distributionTotal,
  facilityDistribution,
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
 * else's — so its blocks are its own four domain bands and the things that
 * identify it.
 *
 * Everything counts the facilities actually on screen: the path scope and the
 * filter row together. Reading a band off `AreaProfile` instead would print a
 * whole-state figure beside a filtered count.
 *
 * NOTE: the blocks below are a working first cut. The editorial direction for
 * this page is still open and the client will set the content.
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
  /** False where the scope's gaps carry no money — the rows fall back to gap
   *  counts rather than printing a column of zeroes. */
  costed?: boolean;
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
          <FacilityBlocks facility={scope.facility} />
        ) : (
          <>
            <Block title="Assessed facilities" note={lens && `Banded by ${lens}`}>
              <BandCounts distribution={distribution} total={facilities.length} />
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

/** The single-facility reading. No distribution — it is one row, not a set. */
function FacilityBlocks({ facility }: { facility: FacilitySummary }) {
  return (
    <>
      <Block title="Readiness by domain">
        <div className="space-y-2">
          {FACILITY_THEMES.map((theme) => (
            <div key={theme.id} className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-foreground">{theme.label}</span>
              <BandBadge band={facility.themeBands[theme.id as FacilityThemeId] ?? null} size="sm" />
            </div>
          ))}
        </div>
      </Block>

      <Block title="Gaps at this facility" note={`${formatNaira(facility.costNGN)} to close`}>
        <FacilityGaps facility={facility} />
      </Block>

      <Block title="This facility">
        <dl className="space-y-1.5 text-[13px]">
          <Detail term="Functionality" value={facility.functionalityLevel} />
          <Detail term="Setting" value={facility.geography === 'urban' ? 'Urban' : 'Rural'} />
          <Detail term="BHCPF" value={facility.isBHCPF ? 'Enrolled' : 'Not enrolled'} />
          <Detail term="Zone" value={facility.zone} />
          <Detail term="Service points" value={formatCount(facility.servicePoints)} />
          <Detail term="Permanent staff" value={formatCount(facility.staffCount)} />
          <Detail
            term="Coordinates"
            value={`${facility.lat.toFixed(4)}, ${facility.lon.toFixed(4)}`}
            mono
          />
        </dl>
      </Block>
    </>
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
function BandCounts({ distribution, total }: { distribution: BandDistribution; total: number }) {
  const scored = distributionTotal(distribution);


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
      ) : (
        <BandCards counts={distribution} showPercent className="mt-3.5" />
      )}
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
        cost += gapCostNGN(GAP_BY_ID[id]!, f);
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
        if (acc) acc.cost += gapCostNGN(gap, f);
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

/** One facility's own gaps — the list, not a count of it. */
function FacilityGaps({ facility }: { facility: FacilitySummary }) {
  if (!facility.gaps.length) {
    return <Nothing>Nothing outstanding — this facility is ready.</Nothing>;
  }
  return (
    <ul className="space-y-2">
      {facility.gaps.map((id) => {
        const gap = GAP_BY_ID[id];
        if (!gap) return null;
        const cost = gapCostNGN(gap, facility);
        return (
          <li key={id} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] leading-snug text-foreground">{gap.label}</span>
              <span className="mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                {GAP_DOMAIN_LABEL[gap.domain]}
              </span>
            </span>
            {/* Zero is printed, not blanked. A gap that costs nothing still has
                to be closed, and an empty cell would read as missing data. */}
            <span className="mono shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {formatNaira(cost, true)}
            </span>
          </li>
        );
      })}
    </ul>
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
                    {list.costed === false
                      ? formatCount(row.need.gaps)
                      : formatNaira(row.need.costNGN, true)}
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
