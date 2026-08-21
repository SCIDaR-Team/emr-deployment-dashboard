import { useCallback, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Field } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/filters/FilterBar';
import {
  LGAFacilityMap,
  MapLegend,
  NigeriaChoropleth,
  StateLGAMap,
  type FacilityPoint,
  type GeoDatum,
} from '@/components/map';
import { stepFor } from '@/components/map/mapTypes';
import { Combobox, LoadError, ScaleLegend, Skeleton } from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilteredData } from '@/hooks/useFilteredData';
import { formatCount } from '@/lib/format';
import { dominantBand } from '@/lib/bands';
import type { FacilitySummary } from '@/lib/types';
import { AssessmentPane, type PaneList } from './AssessmentPane';
import {
  assessedStates,
  assessmentPath,
  bareLgaId,
  facilityDistribution,
  notReadyShare,
  resolveAssessmentScope,
  type AssessmentLevel,
} from './assessmentScope';

/**
 * Assessed States — the map is the page, four levels deep.
 *
 * The same shape as National Coverage — filter row, full-bleed map, a pane down
 * the side that always says something — and one level further down. Coverage
 * stops at the LGA because the model behind it classifies areas; this page
 * rests on a survey of individual facilities, so it can go down to the thing
 * that was actually visited: state → LGA → the facilities inside it.
 *
 * ## Scope is the path; the filter row narrows it
 *
 * State and LGA at the front of the filter row are *navigation* — picking Kano
 * there does exactly what clicking Kano on the map does, and what clicking Kano
 * in the pane's list does, because all three write the same URL. Readiness,
 * functionality and search are the opposite: they narrow the population inside
 * whatever the path has selected, and they ride in the query string. The two
 * kinds of control were previously the same control, which is why the page
 * could say "Lagos" in the state filter and still list all 12 states.
 *
 * ## What each level paints
 *
 * The top level cannot paint bands. All 12 assessed states classify to the same
 * state-level band, so a band choropleth over them is twelve identical polygons
 * carrying one value between them — see the note on `GeoDatum.step`. It paints
 * the share of facilities not ready instead, on the sequential ramp, with the
 * scale legend that a sequential encoding cannot be read without. Below that,
 * LGAs and facilities differ in band, so band is what they carry.
 *
 * NOTE: the editorial direction for this page is still open — the client has
 * the structure and will set the content of the pane.
 */

const ALL = '__all__';

export default function AssessedStatesPage() {
  const { stateId, lgaId, facilityId } = useParams();
  const navigate = useNavigate();
  const { states, lgas } = useDataContext();
  const { facilities, allFacilities, isLoading, error, retry } = useFilteredData();

  const surveyed = useMemo(() => assessedStates(states.data), [states.data]);

  const scope = useMemo(
    () => resolveAssessmentScope(states.data, lgas.data, facilities, stateId, lgaId, facilityId),
    [states.data, lgas.data, facilities, stateId, lgaId, facilityId],
  );

  /** Facilities inside the path scope, on top of the filter row. Everything the
   *  pane counts comes from here, so a count and the map beside it agree. */
  const scoped = useMemo(() => {
    let rows = facilities;
    if (scope.state) rows = rows.filter((f) => f.stateId === scope.state!.id);
    if (scope.lga) rows = rows.filter((f) => f.lgaId === bareLgaId(scope.lga!.id));
    return rows;
  }, [facilities, scope.state, scope.lga]);

  const stateLgas = useMemo(
    () =>
      scope.state
        ? lgas.data
            .filter((l) => l.parentId === scope.state!.id)
            .sort((a, b) => b.archetypeDistribution.not_ready - a.archetypeDistribution.not_ready)
        : [],
    [lgas.data, scope.state],
  );

  const go = useCallback(
    (path: string) => navigate({ pathname: path, search: window.location.search }),
    [navigate],
  );

  const selectState = useCallback(
    (id: string) => go(assessmentPath(id === scope.state?.id ? undefined : id)),
    [go, scope.state],
  );

  const selectLga = useCallback(
    (id: string) => {
      if (!scope.state) return;
      const same = scope.lga && bareLgaId(scope.lga.id) === id;
      go(assessmentPath(scope.state.id, same ? undefined : id));
    },
    [go, scope.state, scope.lga],
  );

  const selectFacility = useCallback(
    (uuid: string) => {
      if (!scope.state || !scope.lga) return;
      const same = scope.level === 'facility' && scope.facility.uuid === uuid;
      go(assessmentPath(scope.state.id, bareLgaId(scope.lga.id), same ? undefined : uuid));
    },
    [go, scope],
  );

  /**
   * The top-level map.
   *
   * All 37 states are drawn, because the country is the shape of the country —
   * but only the 12 surveyed ones carry a value and only they are clickable.
   * The other 25 fall through to the no-data fill, which is the honest reading:
   * this page has nothing to say about them.
   */
  const nationalMapData = useMemo(() => {
    const byState = new Map<string, FacilitySummary[]>();
    for (const f of facilities) {
      const bucket = byState.get(f.stateId);
      if (bucket) bucket.push(f);
      else byState.set(f.stateId, [f]);
    }

    const data: Record<string, GeoDatum> = {};
    for (const state of states.data) {
      const rows = byState.get(state.id) ?? [];
      const dist = facilityDistribution(rows);
      const share = state.evidenceGrade === 'primary' ? notReadyShare(dist) : null;
      data[state.id] = {
        band: null,
        n: rows.length,
        evidenceGrade: state.evidenceGrade,
        label: state.name,
        step: stepFor(share, 0, 1),
        valueLabel:
          state.evidenceGrade !== 'primary'
            ? 'Not surveyed'
            : share == null
              ? 'Nothing matches the filters'
              : `${(share * 100).toFixed(0)}% of ${formatCount(rows.length)} not ready`,
      };
    }
    return data;
  }, [states.data, facilities]);

  const lgaMapData = useMemo(() => {
    const byLga = new Map<string, FacilitySummary[]>();
    for (const f of scoped) {
      const bucket = byLga.get(f.lgaId);
      if (bucket) bucket.push(f);
      else byLga.set(f.lgaId, [f]);
    }

    const data: Record<string, GeoDatum> = {};
    for (const l of stateLgas) {
      const id = bareLgaId(l.id);
      const rows = byLga.get(id) ?? [];
      const dist = facilityDistribution(rows);
      data[id] = {
        band: dominantBand(dist),
        n: rows.length,
        evidenceGrade: 'primary',
        label: l.name,
        valueLabel: rows.length
          ? `${formatCount(dist.not_ready)} of ${formatCount(rows.length)} not ready`
          : 'Nothing matches the filters',
      };
    }
    return data;
  }, [stateLgas, scoped]);

  /** The facility layer plots what the filter row left standing, not every
   *  facility in the LGA — a Readiness filter has to remove dots or it is
   *  filtering the pane and not the map. */
  const facilityPoints = useMemo<FacilityPoint[]>(
    () =>
      scoped.map((f) => ({
        uuid: f.uuid,
        name: f.name,
        lat: f.lat,
        lon: f.lon,
        band: f.archetype,
      })),
    [scoped],
  );

  /** The list one level below wherever the reader is, counted off the same
   *  filtered population the map and the pane's blocks use. */
  const list = useMemo<PaneList>(() => {
    if (scope.level === 'all') {
      return {
        label: 'States',
        onSelect: selectState,
        rows: surveyed.map((s) => {
          const datum = nationalMapData[s.id];
          return {
            id: s.id,
            name: s.name,
            band: dominantBand(facilityDistribution(facilities.filter((f) => f.stateId === s.id))),
            note: `${formatCount(datum?.n ?? 0)} facilities`,
          };
        }),
      };
    }

    if (scope.level === 'state') {
      return {
        label: 'LGAs',
        onSelect: selectLga,
        rows: stateLgas.map((l) => {
          const id = bareLgaId(l.id);
          const datum = lgaMapData[id];
          return {
            id,
            name: l.name,
            band: datum?.band ?? null,
            note: `${formatCount(datum?.n ?? 0)} facilities`,
          };
        }),
      };
    }

    return {
      label: 'Facilities',
      onSelect: selectFacility,
      rows: scoped.map((f) => ({
        id: f.uuid,
        name: f.name,
        band: f.archetype,
        note: f.functionalityLevel,
      })),
    };
  }, [
    scope.level,
    surveyed,
    stateLgas,
    scoped,
    facilities,
    nationalMapData,
    lgaMapData,
    selectState,
    selectLga,
    selectFacility,
  ]);

  if (error) return <LoadError what="the facility data" error={error} onRetry={retry} />;
  if (states.error) {
    return <LoadError what="the state profiles" error={states.error} onRetry={states.refetch} />;
  }

  const loading = isLoading && !allFacilities.length;

  const stateOptions = [
    { value: ALL, label: 'All 12 assessed states' },
    ...[...surveyed]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: s.name, hint: s.zone ?? undefined })),
  ];
  const lgaOptions = [
    { value: ALL, label: scope.state ? `All ${stateLgas.length} LGAs` : 'All LGAs' },
    ...[...stateLgas]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ value: bareLgaId(l.id), label: l.name })),
  ];

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <PageHeader
        title="Assessed States"
        subtitle={subtitleFor(scope.level)}
        back={
          scope.level !== 'all' ? (
            <button
              type="button"
              onClick={() =>
                go(
                  scope.level === 'facility'
                    ? assessmentPath(scope.state.id, bareLgaId(scope.lga.id))
                    : scope.level === 'lga'
                      ? assessmentPath(scope.state.id)
                      : assessmentPath(),
                )
              }
              aria-label="Up one level"
              className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : undefined
        }
      >
        <FilterBar
          facilities={allFacilities}
          // Readiness is absent on purpose: Gap asks the same question in the
          // register this page works in, and under a chosen Domain it asks it
          // of that domain rather than of the facility overall.
          show={['level', 'funding', 'domain', 'gap', 'search']}
          leading={
            <>
              <Field label="State">
                <Combobox
                  value={scope.state?.id ?? ALL}
                  onChange={(value) => selectState(value === ALL ? '' : value)}
                  options={stateOptions}
                  className="w-[140px]"
                  searchPlaceholder="Search states…"
                />
              </Field>
              <Field label="LGA">
                <Combobox
                  value={scope.lga ? bareLgaId(scope.lga.id) : ALL}
                  onChange={(value) =>
                    value === ALL ? go(assessmentPath(scope.state!.id)) : selectLga(value)
                  }
                  options={lgaOptions}
                  disabled={!scope.state}
                  className="w-[140px]"
                  searchPlaceholder="Search LGAs…"
                />
              </Field>
            </>
          }
        />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[52vh] shrink-0 bg-page lg:h-auto lg:min-h-0 lg:flex-1">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : scope.lga ? (
            <LGAFacilityMap
              key={`${scope.state.id}/${bareLgaId(scope.lga.id)}`}
              fit="fill"
              stateId={scope.state.id}
              lgaId={bareLgaId(scope.lga.id)}
              lgaName={scope.lga.name}
              facilities={facilityPoints}
              selectedFacilityId={scope.level === 'facility' ? scope.facility.uuid : null}
              onSelect={selectFacility}
              onZoomOut={() => go(assessmentPath(scope.state.id))}
              className="h-full"
            />
          ) : scope.state ? (
            <StateLGAMap
              key={scope.state.id}
              fit="fill"
              stateId={scope.state.id}
              stateName={scope.state.name}
              data={lgaMapData}
              selectedLgaId={null}
              onSelect={selectLga}
              onZoomOut={() => go(assessmentPath())}
              className="h-full"
            />
          ) : (
            <NigeriaChoropleth
              fit="fill"
              data={nationalMapData}
              selectedId={null}
              onSelect={selectState}
              className="h-full"
            />
          )}

          <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-border bg-surface/92 px-2.5 py-1.5 backdrop-blur">
            {scope.state ? (
              <MapLegend showNoData={false} />
            ) : (
              <ScaleLegend
                lo={0}
                hi={1}
                format={(v) => `${Math.round(v * 100)}%`}
                caption="Share of facilities not ready"
                noDataLabel="not surveyed"
              />
            )}
          </div>
        </div>

        <aside className="min-h-0 shrink-0 border-t border-border bg-surface lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
          <AssessmentPane scope={scope} facilities={scoped} list={list} />
        </aside>
      </div>
    </div>
  );
}

function subtitleFor(level: AssessmentLevel): string {
  switch (level) {
    case 'all':
      return 'The 12 states visited, by share of facilities not ready';
    case 'state':
      return 'Local government areas, by readiness band';
    case 'lga':
      return 'Every facility surveyed in this LGA';
    case 'facility':
      return 'One facility';
  }
}
