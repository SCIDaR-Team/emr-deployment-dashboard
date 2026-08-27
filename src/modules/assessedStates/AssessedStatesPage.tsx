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
  rankByName,
  type Crumb,
  type FacilityPoint,
  type GeoDatum,
  type MapSearchResult,
} from '@/components/map';
import { stepFor } from '@/components/map/mapTypes';
import { Combobox, LoadError, ScaleLegend, Skeleton } from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilterStore } from '@/store/filterStore';
import { useFilteredData } from '@/hooks/useFilteredData';
import { formatCount, formatNaira } from '@/lib/format';
import { GAP_BY_ID, gapCostNGN, gapsForDomains } from '@/lib/gapCatalogue';
import { domainSelectionMode, facilityBandUnder } from '@/lib/archetype';
import { THEME_BY_ID } from '@/lib/themes';
import type { FacilitySummary, FacilityThemeId } from '@/lib/types';
import { AssessmentPane, type PaneList, type PaneRow } from './AssessmentPane';
import {
  assessedStates,
  assessmentPath,
  bareLgaId,
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
 * **States and LGAs carry money, facilities carry a band.** An area is a
 * population rather than a thing with a readiness level, and what a programme
 * allocates against it is investment need — so both area levels fill from total
 * intervention cost on the sequential ramp, fitted to the features actually
 * drawn rather than anchored at zero. A facility *is* one thing with a reading,
 * so it takes a band.
 *
 * A band choropleth over the states would say nothing in any case: they
 * classify to one or two values between the twelve — see the note on
 * `GeoDatum.step`.
 *
 * Every domain in the dataset carries money, including data use at ₦36.8m, so
 * the map never has to fall back to counting gaps. It did once, when two
 * domains in the synthetic model had gaps and no cost.
 */

const ALL = '__all__';

export default function AssessedStatesPage() {
  const { stateId, lgaId, facilityId } = useParams();
  const navigate = useNavigate();
  const { states, lgas } = useDataContext();
  const { facilities, allFacilities, isLoading, error, retry } = useFilteredData();

  /**
   * The Domain filter, which on this page is a lens rather than a sieve.
   *
   * It removes no facility — all 2,806 are scored in all four domains — but it
   * changes what every band on the page *means*, through `facilityBandUnder`.
   *
   * Nothing ticked, a facility shows both overall readings: how ready it is to
   * *use* an EMR and whether anything blocks *deploying* one. Tick a domain and
   * both collapse to that domain's band — which is always a use band, since the
   * source has no per-domain deployment reading. So the page has two modes, and
   * which one it is in is decided here.
   */
  const domains = useFilterStore((s) => s.domains);

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

  /** Whether anything in scope can actually be drawn as a point. False for the
   *  whole dataset today — the assessment recorded no coordinates. */
  const plottable = useMemo(
    () => scoped.some((f) => f.lat != null && f.lon != null),
    [scoped],
  );

  const stateLgas = useMemo(
    () =>
      scope.state
        ? lgas.data
            .filter((l) => l.parentId === scope.state!.id)
            .sort((a, b) => b.useDistribution.not_ready - a.useDistribution.not_ready)
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
   * What an area needs, under whatever the Domain filter has selected.
   *
   * Cost and quantity together, because the programme prioritises on both and
   * neither alone is enough: a state with many cheap gaps and a state with few
   * expensive ones are different bets, and a map showing only one of them hides
   * the difference.
   */
  const needOf = useCallback(
    (rows: FacilitySummary[]) => {
      const offered = new Set(gapsForDomains(domains).map((g) => g.id));
      let gaps = 0;
      let costNGN = 0;
      let affected = 0;
      for (const f of rows) {
        let hit = false;
        for (const id of f.gaps) {
          if (!offered.has(id)) continue;
          gaps += 1;
          costNGN += gapCostNGN(GAP_BY_ID[id]!).costNGN;
          hit = true;
        }
        if (hit) affected += 1;
      }
      // `affected` counts facilities *carrying a gap*, not facilities present —
      // the same noun the pane's middle tile uses, so the two cannot disagree.
      return { gaps, costNGN, affected };
    },
    [domains],
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

    const need = new Map<string, { gaps: number; costNGN: number; affected: number }>();
    for (const state of states.data) {
      if (state.evidenceGrade !== 'primary') continue;
      need.set(state.id, needOf(byState.get(state.id) ?? []));
    }

    // The ramp is fitted to the states actually drawn, not to zero. Investment
    // need spans roughly a threefold range across the twelve, and a scale
    // anchored at zero would drop all of them into the darkest two steps and
    // stop discriminating between the ones a budget has to choose between.
    const values = [...need.values()].map((v) => v.costNGN);
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 0;

    const data: Record<string, GeoDatum> = {};
    for (const state of states.data) {
      const rows = byState.get(state.id) ?? [];
      const surveyed = state.evidenceGrade === 'primary';
      const n = need.get(state.id);
      const value = n ? n.costNGN : null;
      data[state.id] = {
        band: null,
        n: rows.length,
        evidenceGrade: state.evidenceGrade,
        label: state.name,
        step: stepFor(value, lo, hi),
        rawValue: value,
        valueLabel: !surveyed ? 'Not surveyed' : needLabel(n, n?.affected ?? 0),
      };
    }
    return data;
  }, [states.data, facilities, needOf]);

  const lgaMapData = useMemo(() => {
    const byLga = new Map<string, FacilitySummary[]>();
    for (const f of scoped) {
      const bucket = byLga.get(f.lgaId);
      if (bucket) bucket.push(f);
      else byLga.set(f.lgaId, [f]);
    }

    const need = new Map<string, { gaps: number; costNGN: number; affected: number }>();
    for (const l of stateLgas) {
      const id = bareLgaId(l.id);
      need.set(id, needOf(byLga.get(id) ?? []));
    }
    const values = [...need.values()].map((v) => v.costNGN);
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 0;

    const data: Record<string, GeoDatum> = {};
    for (const l of stateLgas) {
      const id = bareLgaId(l.id);
      const rows = byLga.get(id) ?? [];
      const n = need.get(id);
      data[id] = {
        band: null,
        n: rows.length,
        evidenceGrade: 'primary',
        label: l.name,
        step: stepFor(n ? n.costNGN : null, lo, hi),
        rawValue: n ? n.costNGN : null,
        valueLabel: needLabel(n, n?.affected ?? 0),
      };
    }
    return data;
  }, [stateLgas, scoped, needOf]);

  /** The bounds the ramp was fitted to, so the legend prints the same numbers
   *  the polygons were coloured from. */
  const mapScale = useMemo(() => {
    const rows = scope.state ? Object.values(lgaMapData) : Object.values(nationalMapData);
    const values = rows
      .filter((d) => d.step != null)
      .map((d) => d.rawValue ?? 0);
    return values.length
      ? { lo: Math.min(...values), hi: Math.max(...values) }
      : { lo: 0, hi: 0 };
  }, [scope.state, lgaMapData, nationalMapData]);

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
        band: facilityBandUnder(f, domains),
        // Carried through so the map's own card can name the geography a
        // coordinate belongs to. A bare lat/lon is only checkable against
        // something — "9.4172° N, 12.1163° E" tells a reader nothing until it
        // sits next to "Demsa, Adamawa".
        state: f.state,
        lga: f.lga,
        status: f.functionalityLevel,
      })),
    [scoped, domains],
  );

  /**
   * The geographic hierarchy, as the map's own breadcrumb.
   *
   * Four levels here rather than three, because this page can reach the thing
   * that was actually visited. Built from the same `scope` the map and the pane
   * read, and every crumb navigates through the same `go` — so the breadcrumb
   * is a URL change like every other selection, and the three views cannot
   * disagree about where the reader is.
   */
  const crumbs = useMemo<Crumb[]>(() => {
    const out: Crumb[] = [
      { id: 'ng', label: 'Nigeria', kind: 'Country', onSelect: () => go(assessmentPath()) },
    ];
    if (scope.state) {
      out.push({
        id: scope.state.id,
        label: scope.state.name,
        kind: 'State',
        onSelect: () => go(assessmentPath(scope.state!.id)),
      });
    }
    if (scope.lga) {
      out.push({
        id: scope.lga.id,
        label: scope.lga.name,
        kind: 'LGA',
        onSelect: () => go(assessmentPath(scope.state!.id, bareLgaId(scope.lga!.id))),
      });
    }
    if (scope.level === 'facility') {
      out.push({ id: scope.facility.uuid, label: scope.facility.name, kind: 'Facility' });
    }
    return out;
  }, [scope, go]);

  /**
   * The map's locator: a name in, a place out.
   *
   * Searches the whole hierarchy from wherever the reader happens to be, not
   * just the level they are on — the point of a locator is to reach a facility
   * without already knowing which state and LGA to drill through, and it is
   * exactly the LGAs nobody can place that are worth searching for. Selecting a
   * result writes the full path, so the levels above it open on the way.
   *
   * Facilities come from `allFacilities` rather than the filtered set, and that
   * is deliberate: the locator is navigation, not analysis. A reader who has
   * narrowed to "not ready" and then searches for a clinic by name is asking
   * where that clinic is, and answering "no results" because it happens to be
   * moderately ready would be the filter silently eating the question.
   */
  const searchPlaces = useCallback(
    (query: string): MapSearchResult[] => {
      const states = rankByName(surveyed, query, (st) => st.name).map((st) => ({
        id: `state:${st.id}`,
        label: st.name,
        kind: 'State' as const,
        hint: st.zone ?? undefined,
        onSelect: () => go(assessmentPath(st.id)),
      }));

      // Only LGAs inside the twelve surveyed states can be reached from this
      // page — the other 469 resolve to nothing, so offering them would be a
      // list of dead ends.
      const assessedIds = new Set(surveyed.map((st) => st.id));
      const reachableLgas = lgas.data.filter((l) => assessedIds.has(l.parentId ?? ''));
      const lgaHits = rankByName(reachableLgas, query, (l) => l.name).map((l) => ({
        id: `lga:${l.id}`,
        label: l.name,
        kind: 'LGA' as const,
        hint: states.find((st) => st.id === `state:${l.parentId}`)?.label ?? undefined,
        onSelect: () => go(assessmentPath(l.parentId!, bareLgaId(l.id))),
      }));

      const facilityHits = rankByName(allFacilities, query, (f) => f.name).map((f) => ({
        id: `facility:${f.uuid}`,
        label: f.name,
        kind: 'Facility' as const,
        hint: `${f.lga}, ${f.state}`,
        onSelect: () => go(assessmentPath(f.stateId, f.lgaId, f.uuid)),
      }));

      // Broadest first: a reader typing "kano" almost always wants the state,
      // not the 444th facility whose name contains it.
      return [...states, ...lgaHits, ...facilityHits];
    },
    [surveyed, lgas.data, allFacilities, go],
  );

  /** The list one level below wherever the reader is, counted off the same
   *  filtered population the map and the pane's blocks use. */
  const list = useMemo<PaneList>(() => {
    // Areas are ranked by what they need, worst first — the list is the other
    // half of the map, and the map is a prioritisation instrument now. Ranked
    // alphabetically it would bury the most expensive state under Adamawa.
    const byNeed = (a: PaneRow, b: PaneRow) =>
      (b.need?.costNGN ?? 0) - (a.need?.costNGN ?? 0);

    if (scope.level === 'all') {
      return {
        label: 'States',
        onSelect: selectState,
        rows: surveyed
          .map((s) => {
            const rows = facilities.filter((f) => f.stateId === s.id);
            return {
              id: s.id,
              name: s.name,
              band: null,
              note: `${formatCount(rows.length)} facilities`,
              need: needOf(rows),
            };
          })
          .sort(byNeed),
      };
    }

    if (scope.level === 'state') {
      return {
        label: 'LGAs',
        onSelect: selectLga,
        rows: stateLgas
          .map((l) => {
            const id = bareLgaId(l.id);
            const rows = scoped.filter((f) => f.lgaId === id);
            return {
              id,
              name: l.name,
              band: null,
              note: `${formatCount(rows.length)} facilities`,
              need: needOf(rows),
            };
          })
          .sort(byNeed),
      };
    }

    return {
      label: 'Facilities',
      onSelect: selectFacility,
      rows: scoped.map((f) => ({
        id: f.uuid,
        name: f.name,
        band: facilityBandUnder(f, domains),
        note: f.functionalityLevel,
      })),
    };
  }, [
    scope.level,
    surveyed,
    stateLgas,
    scoped,
    facilities,
    needOf,
    domains,
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

  /**
   * The key, drawn *inside* the map frame rather than beside it.
   *
   * Bottom right, opposite the toolbar and against the pane it explains — the
   * eye reaches the legend on its way back from the figures rather than
   * crossing the whole map for it. Handed to the layer rather than rendered as
   * its sibling because the frame is what goes full screen, and a legend
   * outside it disappears exactly when the reader has committed to the map.
   *
   * One encoding at both polygon levels, so one legend: they carry investment
   * need rather than readiness — a budget is allocated against what a place
   * needs, not against how it is classified, and the classification is in the
   * pane beside it.
   */
  const scaleLegend = (
    <div className="w-[210px] rounded border border-border bg-surface/92 px-2.5 py-1.5 backdrop-blur">
      <ScaleLegend
        lo={mapScale.lo}
        hi={mapScale.hi}
        format={(v) => formatNaira(v, true)}
        caption="Investment need"
        noDataLabel={scope.state ? 'no facilities' : 'not surveyed'}
      />
    </div>
  );

  /**
   * The facility layer's own key. Its marks are points carrying a band as a
   * silhouette, which is a different vocabulary from the ramp above — so it
   * gets the legend that teaches the one actually on screen.
   *
   * Null when nothing in scope has a coordinate, which is the whole dataset
   * today: the assessment recorded no positions, so the layer draws no points.
   * A key explaining four colours over an empty map is worse than no key — it
   * tells the reader to look for marks that are not there and cannot be, and
   * sends them hunting for a filter they have not applied. It comes back on its
   * own the day coordinates arrive.
   */
  const facilityLegend = plottable ? (
    <div className="rounded border border-border bg-surface/92 px-2.5 py-1.5 backdrop-blur">
      <MapLegend marks="point" showNoData />
    </div>
  ) : null;

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <PageHeader
        title="Assessed States"
        subtitle={subtitleFor(scope.level, domains)}
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
          // Readiness is back beside Gap, because the two stopped being the
          // same question. Gap used to be the readiness band relabelled as a
          // deficiency — "Foundational gap" was Not ready in other words — and
          // showing both would have been one control twice. Gap now selects
          // actual gaps out of the catalogue, so Readiness is the only way left
          // to ask the band question.
          show={['level', 'geography', 'funding', 'domain', 'gapArea', 'archetype', 'search']}
          // State and LGA are navigation here, so Reset has to clear the path
          // as well as the store — the two pickers sit in this row and a reader
          // does not owe them the distinction.
          scopeReset={{
            active: scope.level !== 'all',
            // Bare path, no search: the store reset writes the querystring back
            // out empty a beat later, and carrying the old one across would
            // flash the filters the reader just cleared.
            clear: () => navigate(assessmentPath()),
          }}
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
              crumbs={crumbs}
              exportScope="Facility readiness band"
              onSearch={searchPlaces}
              // No scale legend at facility level: the points carry a readiness
              // band as a *shape*, not a position on the need ramp, so printing
              // the ramp there would explain an encoding that is not on screen.
              overlay={facilityLegend}
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
              crumbs={crumbs}
              overlay={scaleLegend}
              exportScope="Investment need"
              onSearch={searchPlaces}
              className="h-full"
            />
          ) : (
            <NigeriaChoropleth
              fit="fill"
              data={nationalMapData}
              selectedId={null}
              onSelect={selectState}
              crumbs={crumbs}
              overlay={scaleLegend}
              exportScope="Investment need"
              onSearch={searchPlaces}
              className="h-full"
            />
          )}
        </div>

        <aside className="min-h-0 shrink-0 border-t border-border bg-surface lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
          <AssessmentPane scope={scope} facilities={scoped} domains={domains} list={list} />
        </aside>
      </div>
    </div>
  );
}

/**
 * What a polygon says on hover — the pane's three tiles, in the pane's order.
 *
 * Deliberately the same three figures the reader has just been looking at, and
 * in the same sequence: gaps, facilities, cost. A tooltip that reported the
 * same area in a different vocabulary would make the reader do a translation
 * every time they moved the mouse, and the fill only ever encodes one of the
 * three anyway. Cost is dropped where the selection has none, rather than
 * printed as a zero the map could not have painted.
 */
function needLabel(
  need: { gaps: number; costNGN: number } | undefined,
  affected: number,
): string {
  if (!need) return 'Nothing matches the filters';
  if (!need.gaps) return 'No gaps in scope';
  return (
    `${formatCount(need.gaps)} gaps · ${formatCount(affected)} facilities · ` +
    formatNaira(need.costNGN, true)
  );
}

function subtitleFor(level: AssessmentLevel, domains: FacilityThemeId[]): string {
  // The subtitle names the encoding, and the encoding is the same at both map
  // levels now: what a place needs, not how it is classified.
  const scope =
    level === 'all'
      ? 'The 12 states visited, by investment need'
      : level === 'state'
        ? 'Local government areas, by investment need'
        : level === 'lga'
          ? 'Every facility surveyed in this LGA'
          : 'One facility';

  // Naming the lens here rather than only in the pane: the map is the page, and
  // a reader looking at a red Kano needs to know whether that is Kano overall
  // or Kano's workforce.
  // Only a single domain names a lens, because only a single domain *is* one.
  // A combination has no published reading behind it, so the map stays on
  // investment need for the selected domains and the subtitle says which ones
  // rather than naming a band the assessment never issued.
  const mode = domainSelectionMode(domains);
  if (mode === 'overall') return scope;
  if (mode === 'single') return `${scope} · ${THEME_BY_ID[domains[0]!].label}`;
  return `${scope} · ${domains.length} domains`;
}
