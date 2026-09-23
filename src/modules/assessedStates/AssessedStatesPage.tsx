import { useCallback, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Field } from '@/components/layout/PageHeader';
import { FILTER_FIELD, FilterBar } from '@/components/filters/FilterBar';
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
import { Combobox, LoadError, Skeleton } from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilterStore } from '@/store/filterStore';
import { useFilteredData } from '@/hooks/useFilteredData';
import { MATURITY_LABEL, MATURITY_NO_DATA } from '@/lib/bands';
import { formatCount, formatNaira } from '@/lib/format';
import { GAP_BY_ID, facilityGapCost, offeredGapIds } from '@/lib/gapCatalogue';
import { domainSelectionMode, facilityBandUnder } from '@/lib/archetype';
import { THEME_BY_ID, facilityLens } from '@/lib/themes';
import type { FacilitySummary, FacilityThemeId } from '@/lib/types';
// Reached across module folders on purpose: this map's twelve states have to
// paint in the colours National Coverage gives them, and the only way to
// guarantee that is to resolve the band through the same function rather than
// to keep a second copy of the rule in step by hand.
import { bandOf } from '@/modules/nationalCoverage/coverageScope';
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
 * **The national map carries the state's maturity band; below it, facilities
 * carry their own readiness.** The twelve surveyed states are filled from
 * exactly the reading National Coverage paints them with — the State Maturity
 * band, through `bandOf`, the same function that page's polygons go through,
 * and under the same `MATURITY_LABEL` names — so Kano is the same amber on both
 * maps and a reader crossing between them never has to work out
 * whether two pictures of the same country disagree. The other twenty-five
 * keep the desk-review hatch, because this page still has no facility survey
 * for them.
 *
 * That fill was a sequential ramp fitted to total intervention cost. The money
 * has not left the level — it is in the hover on every polygon and it is what
 * the pane's list is ranked by — but it is read there as a figure rather than
 * guessed off a five-step ramp, and the fill is now saying the one thing two
 * maps of the same states have to agree on.
 *
 * From the state level down the map stops classifying areas and starts drawing
 * the things that were actually surveyed. The LGAs keep their outlines, their
 * names and their click target but take no fill, and every facility in the
 * state is plotted in its band silhouette — the same marks, from the same
 * `FacilityLayer`, that the LGA level draws. So drilling from a state into one
 * of its LGAs changes the extent and nothing else, and the reader never has to
 * relearn the encoding on the way down.
 *
 * The two are never stacked. A pastel polygon under a marker of a different
 * band is two readiness scales in one frame with no way to tell which a colour
 * belongs to — see the `facilities` prop on `StateLGAMap`.
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
   * Nothing ticked, a facility shows its overall reading: whether anything
   * blocks deploying an EMR into it. Tick a domain and it shows that domain's
   * band instead. Both are on the same scale, so ticking a domain narrows the
   * question rather than swapping it — which is the point of the lens.
   */
  const storeDomains = useFilterStore((s) => s.domains);
  // Narrowed to the four the facility survey scores. The store's Domain
  // selection is shared with National Coverage, which can add Leadership &
  // Governance — a state-level reading no facility carries. It drops out here
  // rather than reaching a band lookup as an unknown key; the tick survives in
  // the store, so going back to that page finds it still set.
  const domains = useMemo(() => facilityLens(storeDomains), [storeDomains]);
  const gapAreas = useFilterStore((s) => s.gapAreas);

  const surveyed = useMemo(() => assessedStates(states.data), [states.data]);

  const scope = useMemo(
    () => resolveAssessmentScope(states.data, lgas.data, facilities, stateId, lgaId, facilityId),
    [states.data, lgas.data, facilities, stateId, lgaId, facilityId],
  );

  /**
   * The population the filter row counts against: the path scope, and nothing
   * else.
   *
   * Not `allFacilities`, which is what it used to be — every option carried its
   * national tally, so drilling into Demsa left the row reading "Functional
   * L1 · 1,462" beside a pane reading 10 facilities. A count that does not move
   * when the reader moves is not a count of anything they are looking at.
   *
   * Not `facilities` either, which has the filter row already applied. Counts
   * taken from that answer "how many survive what you have already picked",
   * so every option collapses toward zero as the reader ticks and an option
   * reading 0 would still return rows once a competing tick is cleared.
   *
   * Path scope only. Then a count says how many facilities *here* an option
   * would offer, and it changes on every drill-down.
   */
  const inScope = useMemo(() => {
    let rows = allFacilities;
    if (scope.state) rows = rows.filter((f) => f.stateId === scope.state!.id);
    if (scope.lga) rows = rows.filter((f) => f.lgaId === bareLgaId(scope.lga!.id));
    return rows;
  }, [allFacilities, scope.state, scope.lga]);

  /** Facilities inside the path scope, on top of the filter row. Everything the
   *  pane counts comes from here, so a count and the map beside it agree. */
  const scoped = useMemo(() => {
    let rows = facilities;
    if (scope.state) rows = rows.filter((f) => f.stateId === scope.state!.id);
    if (scope.lga) rows = rows.filter((f) => f.lgaId === bareLgaId(scope.lga!.id));
    return rows;
  }, [facilities, scope.state, scope.lga]);

  /** Whether anything in scope can actually be drawn as a point. True almost
   *  everywhere now: 2,804 of 2,806 facilities carry a surveyed fix. */
  const plottable = useMemo(
    () => scoped.some((f) => f.lat != null && f.lon != null),
    [scoped],
  );

  const stateLgas = useMemo(
    () =>
      scope.state
        ? lgas.data
            .filter((l) => l.parentId === scope.state!.id)
            .sort(
              (a, b) => b.deploymentDistribution.not_ready - a.deploymentDistribution.not_ready,
            )
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
   * The same selection, made from the state map — where there is no LGA in the
   * path yet to build the facility's URL from.
   *
   * So it comes off the record instead. A marker clicked in Kano lands on
   * `/kano/dala/<uuid>`, which is the URL drilling in by hand would have
   * produced: the reader skips a level, and the pane, the breadcrumb and the
   * back button all find the state they expect underneath them.
   */
  const selectFacilityFromState = useCallback(
    (uuid: string) => {
      const f = scoped.find((row) => row.uuid === uuid);
      if (!f) return;
      go(assessmentPath(f.stateId, f.lgaId, uuid));
    },
    [go, scoped],
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
      const offered = offeredGapIds(domains, gapAreas);
      let gaps = 0;
      let costNGN = 0;
      let affected = 0;
      for (const f of rows) {
        let hit = false;
        for (const id of f.gaps) {
          if (!offered.has(id)) continue;
          const gap = GAP_BY_ID[id]!;
          costNGN += facilityGapCost(f, gap).costNGN;
          // Costed but not a gap — see `GapDef.recorded`.
          if (!gap.recorded) continue;
          gaps += 1;
          hit = true;
        }
        if (hit) affected += 1;
      }
      // `affected` counts facilities *carrying a gap*, not facilities present —
      // the same noun the pane's middle tile uses, so the two cannot disagree.
      return { gaps, costNGN, affected };
    },
    [domains, gapAreas],
  );

  /**
   * The top-level map.
   *
   * All 37 states are drawn, because the country is the shape of the country —
   * but only the 12 surveyed ones carry a fill and only they are clickable.
   * The other 25 take the desk-review hatch, which is the honest reading: this
   * page has no facility-level evidence for them.
   *
   * The fill is the state's maturity band and nothing else, resolved through
   * the same `bandOf` National Coverage paints its own polygons with. Reading
   * the field directly would give the same colour today and would be free to
   * drift the day that page changes how it resolves a band; going through the
   * one function is what makes "the exact colours from National Coverage" a
   * property of the code rather than a coincidence.
   *
   * Cost still travels with every state — `valueLabel` puts it in the hover
   * and the pane ranks its list by it — it just no longer decides the fill.
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
      const surveyed = state.evidenceGrade === 'primary';
      const n = surveyed ? needOf(rows) : undefined;
      // Null off the survey, not "no reading": an unsurveyed state has a
      // maturity band, but painting it here would put a state this page
      // cannot speak for into the same key as the twelve it can. The layer
      // hatches it on `evidenceGrade` in any case.
      const band = surveyed ? bandOf(state) : null;
      data[state.id] = {
        band,
        // Named as maturity, not readiness: this is the state's reading, and
        // the facilities below it are the ones that carry readiness.
        bandLabel: !surveyed ? undefined : band ? MATURITY_LABEL[band] : MATURITY_NO_DATA,
        n: rows.length,
        evidenceGrade: state.evidenceGrade,
        label: state.name,
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

  // "All 12", not "All 12 assessed states": the field's own label reads
  // State directly above it, and on one row the trigger has 67px of text to
  // spend — enough for the count, which is the part the label does not say.
  const stateOptions = [
    { value: ALL, label: 'All 12' },
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
   * The national level's key, and now only its own — the state map moved to
   * the facility key below, because that is the encoding actually on screen
   * there. It is `MapLegend` rather than a scale, and deliberately the very
   * same component National Coverage hands its own map: the two levels are
   * painting one vocabulary now, and a second key describing it in other words
   * would be the place they drift apart.
   *
   * The hatch swatch is on, because 25 of the 37 polygons carry it here. The
   * no-data swatch is asked for rather than assumed: every surveyed state
   * carries a band today, so it stays off, and it turns itself on the day one
   * arrives unclassified — grey on a readiness map otherwise reads as the
   * worst band rather than as an absent one.
   */
  const scaleLegend = (
    <div className="rounded border border-border bg-surface/92 px-2.5 py-1.5 backdrop-blur">
      <MapLegend
        showSecondary
        labels={MATURITY_LABEL}
        noDataLabel={MATURITY_NO_DATA}
        showNoData={surveyed.some((s) => bandOf(s) == null)}
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
          facilities={inScope}
          // Nine controls. Left to wrap they take two lines at every width the
          // page is actually used at, and the break lands on a different
          // control on every screen.
          singleRow
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
              <Field label="State" className={FILTER_FIELD}>
                <Combobox
                  value={scope.state?.id ?? ALL}
                  onChange={(value) => selectState(value === ALL ? '' : value)}
                  options={stateOptions}
                  className="w-full"
                  searchPlaceholder="Search states…"
                />
              </Field>
              <Field label="LGA" className={FILTER_FIELD}>
                <Combobox
                  value={scope.lga ? bareLgaId(scope.lga.id) : ALL}
                  onChange={(value) =>
                    value === ALL ? go(assessmentPath(scope.state!.id)) : selectLga(value)
                  }
                  options={lgaOptions}
                  disabled={!scope.state}
                  className="w-full"
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
              // Passing facilities puts the layer in facility mode: the LGAs
              // keep their outlines and their names but give up the need ramp,
              // and every surveyed facility in the state is drawn in the same
              // band silhouette the LGA level draws it in. Drilling into one
              // LGA now changes the extent rather than the encoding.
              facilities={facilityPoints}
              selectedFacilityId={null}
              onSelectFacility={selectFacilityFromState}
              selectedLgaId={null}
              onSelect={selectLga}
              onZoomOut={() => go(assessmentPath())}
              crumbs={crumbs}
              // The points' key, not the ramp's — the ramp is no longer on
              // screen at this level, and a legend explaining an encoding that
              // is not drawn sends the reader hunting for it.
              overlay={facilityLegend}
              exportScope="Facility readiness band"
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
              // The same words National Coverage stamps under its export, for
              // the same fills — see `READINESS_LABEL` there.
              exportScope="Overall readiness"
              onSearch={searchPlaces}
              className="h-full"
            />
          )}
        </div>

        <aside className="min-h-0 shrink-0 border-t border-border bg-surface lg:h-full lg:w-[480px] lg:border-l lg:border-t-0">
          <AssessmentPane
            scope={scope}
            facilities={scoped}
            domains={domains}
            gapAreas={gapAreas}
            list={list}
          />
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
  // The subtitle names the encoding, and the two map levels no longer share
  // one: the states are filled by their maturity band, the LGAs beneath them
  // by what they need.
  const scope =
    level === 'all'
      ? 'The 12 states visited, by maturity band'
      : level === 'state'
        ? 'Local government areas, by investment need'
        : level === 'lga'
          ? 'Every facility surveyed in this LGA'
          : 'One facility';

  // Naming the domains here rather than only in the pane: they narrow the
  // investment need the LGA map is filled with and the gaps the pane counts, so
  // a reader looking at a deep LGA needs to know whose gaps it is deep in.
  // Readiness is never re-read through a domain — the source has no band per
  // domain — so the facility points and the state fills do not move with it.
  const mode = domainSelectionMode(domains);
  if (mode === 'overall') return scope;
  if (mode === 'single') return `${scope} · ${THEME_BY_ID[domains[0]!].label}`;
  return `${scope} · ${domains.length} domains`;
}
