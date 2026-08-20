import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/filters/FilterBar';
import { MapLegend, StateLGAMap } from '@/components/map';
import {
  BandBadge,
  BandLegend,
  BandRow,
  DistributionBar,
  EmptyState,
  LoadError,
  SectionCard,
  Tile,
  TileRow,
} from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilteredData } from '@/hooks/useFilteredData';
import { BAND_ACTION, BAND_LABEL, bandShare, dominantBand } from '@/lib/bands';
import { formatCount, percentOf } from '@/lib/format';
import { FACILITY_THEMES } from '@/lib/themes';
import type { GeoDatum } from '@/components/map';
import type { FacilityThemeId } from '@/lib/types';

/**
 * Assessed States — the 12 states visited, down to LGA.
 *
 * The counterpart to National Coverage: everything on this page rests on a
 * facility survey, so it can go a level deeper and count things. Where the
 * coverage page answers "what do we know about this state", this one answers
 * "how many facilities, where, and in what condition".
 *
 * The route carries the scope — `/assessment/kano/dala` — rather than holding
 * it in a store, so any view a reader reaches is a link they can send. The
 * filter bar's own state syncs into the query string separately (see
 * `useFilterUrlSync`), which keeps the two kinds of scope from fighting: the
 * path is where you are, the query is what you are looking at.
 *
 * NOTE: the editorial direction for this page is still open — the client has
 * the structure and will set the content.
 */

const SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'domains', label: 'Domains' },
  { id: 'lgas', label: 'LGAs' },
];

export default function AssessedStatesPage() {
  const { stateId, lgaId } = useParams();
  const navigate = useNavigate();
  const { states, lgas } = useDataContext();
  const { facilities, allFacilities, metrics, isLoading, error, retry } = useFilteredData();

  const state = useMemo(
    () => states.data.find((s) => s.id === stateId) ?? null,
    [states.data, stateId],
  );

  /** Facilities inside the current path scope, on top of the filter bar. */
  const scoped = useMemo(() => {
    let rows = facilities;
    if (stateId) rows = rows.filter((f) => f.stateId === stateId);
    if (lgaId) rows = rows.filter((f) => f.lgaId === lgaId);
    return rows;
  }, [facilities, stateId, lgaId]);

  const stateLgas = useMemo(
    () =>
      lgas.data
        .filter((l) => l.parentId === stateId)
        .sort((a, b) => b.archetypeDistribution.not_ready - a.archetypeDistribution.not_ready),
    [lgas.data, stateId],
  );

  const lgaMapData = useMemo(() => {
    const data: Record<string, GeoDatum> = {};
    for (const l of stateLgas) {
      data[l.id.split('.')[1] ?? l.id] = {
        band: l.band,
        n: l.facilityCount,
        evidenceGrade: 'primary',
        label: l.name,
        valueLabel: `${formatCount(l.archetypeDistribution.not_ready)} of ${formatCount(
          l.facilityCount,
        )} not ready`,
      };
    }
    return data;
  }, [stateLgas]);

  /** Counts for the scope on screen, which is the filter *and* the path. */
  const scopedDistribution = useMemo(() => {
    const dist = { not_ready: 0, moderately_ready: 0, ready: 0 };
    for (const f of scoped) if (f.archetype) dist[f.archetype] += 1;
    return dist;
  }, [scoped]);

  const scopedThemeCounts = useMemo(() => {
    const out = {} as Record<FacilityThemeId, Record<'not_ready' | 'moderately_ready' | 'ready', number>>;
    for (const t of FACILITY_THEMES) {
      const dist = { not_ready: 0, moderately_ready: 0, ready: 0 };
      for (const f of scoped) {
        const band = f.themeBands[t.id as FacilityThemeId];
        if (band) dist[band] += 1;
      }
      out[t.id as FacilityThemeId] = dist;
    }
    return out;
  }, [scoped]);

  if (error) {
    return <LoadError what="the facility data" error={error} onRetry={retry} />;
  }

  const scopeName = lgaId
    ? `${stateLgas.find((l) => l.id.endsWith(`.${lgaId}`))?.name ?? lgaId}, ${state?.name ?? ''}`
    : (state?.name ?? 'All 12 assessed states');

  return (
    <>
      <PageHeader
        title="Assessed States"
        subtitle={scopeName}
        sections={SECTIONS}
        back={
          stateId ? (
            <Link
              to={lgaId ? `/assessment/${stateId}` : '/assessment'}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Up one level"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
          ) : undefined
        }
      >
        <FilterBar
          facilities={allFacilities}
          show={['state', 'lga', 'archetype', 'level', 'search']}
        />
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-5">
        {/* The tile row is the "Summary" section the header's tabs scroll to,
            so the scroll target sits on a wrapper — `TileRow` is a grid and
            giving it the id would make the scroll-margin apply to the grid
            rather than to the block the reader is aiming at. */}
        <div id="summary" data-section="summary">
        <TileRow className="sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Facilities in scope"
            value={isLoading ? '—' : formatCount(scoped.length)}
            note={
              scoped.length !== metrics.total
                ? `of ${formatCount(metrics.total)} matching the filters`
                : undefined
            }
          />
          {(['ready', 'moderately_ready', 'not_ready'] as const).map((band) => (
            <Tile
              key={band}
              band={band}
              label={BAND_LABEL[band]}
              value={formatCount(scopedDistribution[band])}
              suffix={
                scoped.length ? percentOf(scopedDistribution[band], scoped.length, 1) : undefined
              }
              note={BAND_ACTION[band]}
            />
          ))}
        </TileRow>
        </div>

        <SectionCard
          title="How the scope splits"
          subtitle={`${formatCount(scoped.length)} facilities carrying a readiness band`}
        >
          <DistributionBar distribution={scopedDistribution} scored={scoped.length} />
        </SectionCard>

        <SectionCard
          id="domains"
          title="The four facility domains"
          subtitle="Counted, not averaged — the split is what an intervention is planned against"
          bodyClassName="p-0"
        >
          <div className="space-y-3.5 px-4 py-3">
            {FACILITY_THEMES.map((t) => {
              const dist = scopedThemeCounts[t.id as FacilityThemeId];
              const share = bandShare(dist, 'not_ready');
              const scored = dist.not_ready + dist.moderately_ready + dist.ready;
              return (
                <div key={t.id}>
                  {/* Band and share both come from `scopedThemeCounts` — the
                      path scope (`/assessment/kano`) as well as the filters.
                      `metrics` knows only about the filters, so reading the band
                      from there would print a national band beside a state's
                      percentage. */}
                  <BandRow
                    label={t.label}
                    band={dominantBand(dist)}
                    note={share != null ? `${share.toFixed(0)}% not ready` : undefined}
                  />
                  {scored > 0 && (
                    <DistributionBar
                      distribution={dist}
                      scored={scored}
                      size="sm"
                      showLegend={false}
                      className="mt-1.5"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-border px-4 py-2.5">
            <BandLegend />
          </div>
        </SectionCard>

        {state && (
          <SectionCard
            title={`${state.name} by LGA`}
            subtitle={`${formatCount(stateLgas.length)} LGAs, all reached by the survey`}
          >
            <StateLGAMap
              stateId={state.id}
              stateName={state.name}
              data={lgaMapData}
              selectedLgaId={lgaId ?? null}
              onSelect={(id) =>
                navigate(id === lgaId ? `/assessment/${state.id}` : `/assessment/${state.id}/${id}`)
              }
            />
            <MapLegend className="mt-3" />
          </SectionCard>
        )}

        <SectionCard
          id="lgas"
          title={state ? 'LGAs' : 'States'}
          subtitle={
            state
              ? 'Ordered by how many facilities are not ready'
              : 'Pick a state to go down to its LGAs'
          }
          bodyClassName="p-0"
        >
          {state ? (
            stateLgas.length ? (
              <RankedTable
                rows={stateLgas.map((l) => ({
                  id: l.id.split('.')[1] ?? l.id,
                  name: l.name,
                  facilityCount: l.facilityCount,
                  distribution: l.archetypeDistribution,
                  band: l.band,
                }))}
                onSelect={(id) => navigate(`/assessment/${state.id}/${id}`)}
                unit="LGA"
              />
            ) : (
              <EmptyState title="No LGAs" message="Nothing matches the current filters." />
            )
          ) : (
            <RankedTable
              rows={states.data
                .filter((s) => s.evidenceGrade === 'primary')
                .sort(
                  (a, b) =>
                    b.archetypeDistribution.not_ready - a.archetypeDistribution.not_ready,
                )
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  facilityCount: s.facilityCount,
                  distribution: s.archetypeDistribution,
                  band: s.band,
                }))}
              onSelect={(id) => navigate(`/assessment/${id}`)}
              unit="State"
            />
          )}
        </SectionCard>
      </div>
    </>
  );
}

interface RankedRow {
  id: string;
  name: string;
  facilityCount: number;
  distribution: Record<'not_ready' | 'moderately_ready' | 'ready', number>;
  band: import('@/lib/types').Band | null;
}

/** One table for both levels — states and LGAs rank on the same three columns,
 *  and giving them separate components only guarantees they drift apart. */
function RankedTable({
  rows,
  onSelect,
  unit,
}: {
  rows: RankedRow[];
  onSelect: (id: string) => void;
  unit: string;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="th">{unit}</th>
              <th className="th text-right">Facilities</th>
              <th className="th text-right">Not ready</th>
              <th className="th">Readiness</th>
              <th className="th w-[220px]">Split</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-sunk"
              >
                <td className="td font-medium text-foreground">{r.name}</td>
                <td className="mono td text-right">{formatCount(r.facilityCount)}</td>
                <td className="mono td text-right">
                  {formatCount(r.distribution.not_ready)}
                  <span className="ml-1.5 text-[11px] text-muted-foreground">
                    {percentOf(r.distribution.not_ready, r.facilityCount, 0)}
                  </span>
                </td>
                <td className="td">
                  <BandBadge band={r.band} size="sm" />
                </td>
                <td className="td">
                  <DistributionBar
                    distribution={r.distribution}
                    scored={r.facilityCount}
                    size="sm"
                    showLegend={false}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-4 py-2.5">
        <BandLegend />
      </div>
    </>
  );
}
