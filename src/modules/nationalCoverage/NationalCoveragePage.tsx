import { useCallback, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  MapLegend,
  NigeriaChoropleth,
  StateLGAMap,
  rankByName,
  type Crumb,
  type MapSearchResult,
} from '@/components/map';
import { LoadError, Skeleton } from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilterStore } from '@/store/filterStore';
import { formatCount } from '@/lib/format';
import { THEME_BY_ID } from '@/lib/themes';
import type { GeoDatum } from '@/components/map';
import type { AreaProfile } from '@/lib/types';
import { CoverageFilters } from './CoverageFilters';
import { CoveragePane } from './CoveragePane';
import { bandUnderLens, coverageLens, resolveScope, type DomainLens } from './coverageScope';

/**
 * National Coverage — the map *is* the page.
 *
 * One screen, not a stack of panels: filters across the top, a full-bleed map,
 * and a pane down the side that always says something about whatever is
 * selected. Clicking a state drills the map into its LGAs and re-scopes the
 * pane; clicking an LGA goes one level further. The pane is never empty — with
 * nothing selected it holds the national picture — so there is no "choose
 * something to begin" state to get past.
 *
 * ## The unit here is the state, not the facility
 *
 * Nothing on this page counts facilities. That is not an omission: this page
 * answers "where does the country stand", and the answer is 37 state-level
 * readings, each already classified by a model outside this dashboard. The
 * facility survey is a different claim about a different population and it
 * lives on Assessed States. Everything here reads `AreaProfile.coverage` and
 * nothing else — see the note on `CoverageProfile`.
 *
 * ## Two ways to select, one selection
 *
 * The filter row and the map both write the URL, and the URL is the only place
 * scope lives. That is what stops the two disagreeing, and it makes every view
 * a link — `/states/kano/dala?domain=workforce_capacity` is a whole sentence.
 *
 * The lens is the exception: it lives in the filter store, which mirrors itself
 * into `?domain=` for exactly the same link. It has to, because Assessed States
 * has a Domain control writing that same parameter through the store — and with
 * two owners the mirror won every time, so picking a lens here wrote the
 * querystring and the store overwrote it a tick later. Reading the lens back
 * out of the store is what makes the two pages one selection; the sentence in
 * the URL is unchanged.
 */

export default function NationalCoveragePage() {
  const { stateId, lgaId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { states, lgas, national } = useDataContext();

  // The Domain control is shared with Assessed States, which offers four
  // domains against the facility survey; this page has readings for two. The
  // rest drop out in `coverageLens` — see the note there.
  const domains = useFilterStore((s) => s.domains);
  const setDomains = useFilterStore((s) => s.setDomains);
  const lens = useMemo(() => coverageLens(domains), [domains]);
  const scope = useMemo(
    () => resolveScope(states.data, lgas.data, stateId, lgaId),
    [states.data, lgas.data, stateId, lgaId],
  );

  /** Navigation that carries the lens with it — changing scope must never
   *  silently reset what the reader is looking at. */
  const go = useCallback(
    (path: string) => {
      const query = search.toString();
      navigate(query ? `${path}?${query}` : path);
    },
    [navigate, search],
  );

  const setLens = useCallback((next: DomainLens) => setDomains(next), [setDomains]);

  const stateLgas = useMemo(
    () => (scope.state ? lgas.data.filter((l) => l.parentId === scope.state!.id) : []),
    [lgas.data, scope.state],
  );

  /**
   * The national map's data.
   *
   * Every state is `primary` here, which switches off the desk-review hatch and
   * makes all 37 clickable. On this page that is correct rather than a fudge:
   * the evidence-grade distinction exists because 12 states got a facility
   * survey, and no reading on this page comes from that survey. Network
   * coverage and grid connection are known for Sokoto exactly as they are for
   * Kano.
   */
  const nationalMapData = useMemo(() => {
    const data: Record<string, GeoDatum> = {};
    for (const state of states.data) {
      data[state.id] = {
        band: bandUnderLens(state, lens),
        n: state.lgaCount ?? 0,
        evidenceGrade: 'primary',
        label: state.name,
        valueLabel: `${formatCount(state.lgaCount ?? 0)} LGAs`,
      };
    }
    return data;
  }, [states.data, lens]);

  const lgaMapData = useMemo(() => {
    const data: Record<string, GeoDatum> = {};
    for (const lga of stateLgas) {
      data[lga.id.split('.')[1] ?? lga.id] = {
        band: bandUnderLens(lga, lens),
        n: 0,
        evidenceGrade: 'primary',
        label: lga.name,
        valueLabel: lensLabel(lens),
      };
    }
    return data;
  }, [stateLgas, lens]);

  const selectState = useCallback(
    (id: string) => go(id === scope.state?.id ? '/states' : `/states/${id}`),
    [go, scope.state],
  );

  const selectLga = useCallback(
    (id: string) => {
      if (!scope.state) return;
      go(id === scope.lga?.id.split('.')[1] ? `/states/${scope.state.id}` : `/states/${scope.state.id}/${id}`);
    },
    [go, scope.state, scope.lga],
  );

  /**
   * The geographic hierarchy, as the map's own breadcrumb.
   *
   * Built from the same `scope` the map and the pane read, so the three cannot
   * disagree about where the reader is, and every crumb navigates through the
   * same `go` — which means the breadcrumb is a URL change like every other
   * selection on this page, and a link to any level is a link to what the
   * reader was looking at.
   */
  const crumbs = useMemo<Crumb[]>(() => {
    const out: Crumb[] = [
      { id: 'ng', label: 'Nigeria', kind: 'Country', onSelect: () => go('/states') },
    ];
    if (scope.state) {
      out.push({
        id: scope.state.id,
        label: scope.state.name,
        kind: 'State',
        onSelect: () => go(`/states/${scope.state!.id}`),
      });
    }
    if (scope.lga) out.push({ id: scope.lga.id, label: scope.lga.name, kind: 'LGA' });
    return out;
  }, [scope.state, scope.lga, go]);

  /**
   * The map's locator: a name in, a place out.
   *
   * Stops at the LGA, because that is where this page's claims stop — it
   * classifies areas from a desk model and has nothing to say about an
   * individual facility. Assessed States can resolve one level deeper, and its
   * locator does.
   */
  const searchPlaces = useCallback(
    (query: string): MapSearchResult[] => {
      const stateName = new Map(states.data.map((st) => [st.id, st.name]));

      const stateHits = rankByName(states.data, query, (st) => st.name).map((st) => ({
        id: `state:${st.id}`,
        label: st.name,
        kind: 'State' as const,
        hint: st.zone ?? undefined,
        onSelect: () => go(`/states/${st.id}`),
      }));

      const lgaHits = rankByName(lgas.data, query, (l) => l.name).map((l) => ({
        id: `lga:${l.id}`,
        label: l.name,
        kind: 'LGA' as const,
        hint: l.parentId ? stateName.get(l.parentId) : undefined,
        onSelect: () => go(`/states/${l.parentId}/${l.id.split('.')[1] ?? l.id}`),
      }));

      // Broadest first: a reader typing "kano" almost always wants the state,
      // not one of its LGAs whose name contains it.
      return [...stateHits, ...lgaHits];
    },
    [states.data, lgas.data, go],
  );

  /**
   * The key, drawn *inside* the map frame rather than beside it.
   *
   * The map is the whole height of the page here, so a legend below the fold
   * explains nothing — and now that the map can take the full display, a legend
   * rendered as the map's sibling is on a part of the document the reader can
   * no longer see. Handed to the layer instead, which draws it within the
   * element that goes full screen.
   */
  const legend = (
    <div className="rounded border border-border bg-surface/92 px-2.5 py-1.5 backdrop-blur">
      <MapLegend showNoData={false} />
    </div>
  );

  if (states.error) {
    return <LoadError what="the coverage data" error={states.error} onRetry={states.refetch} />;
  }

  const loading = states.isLoading && !states.data.length;

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <PageHeader
        title="National Coverage"
        subtitle={subtitleFor(scope.level, lens)}
        back={
          scope.level !== 'national' ? (
            <button
              type="button"
              onClick={() =>
                go(scope.level === 'lga' ? `/states/${scope.state!.id}` : '/states')
              }
              aria-label="Up one level"
              className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : undefined
        }
      >
        <CoverageFilters
          states={states.data}
          lgas={lgas.data}
          stateId={scope.state?.id ?? null}
          lgaId={scope.lga?.id.split('.')[1] ?? null}
          lens={lens}
          onStateChange={(id) => go(id ? `/states/${id}` : '/states')}
          onLgaChange={(id) =>
            go(id ? `/states/${scope.state!.id}/${id}` : `/states/${scope.state!.id}`)
          }
          onLensChange={setLens}
          onReset={() => {
            // Scope is in the path and the lens is in the store, so clearing
            // the path is only half of it.
            setDomains([]);
            navigate('/states');
          }}
        />
      </PageHeader>

      {/* Map and pane side by side on a desktop, stacked on a phone — where the
          map takes a fixed slice of the viewport and the pane scrolls under it,
          rather than being hidden behind a control the way the reference
          dashboard does it. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[52vh] shrink-0 bg-page lg:h-auto lg:min-h-0 lg:flex-1">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : scope.state ? (
            <StateLGAMap
              key={scope.state.id}
              fit="fill"
              stateId={scope.state.id}
              stateName={scope.state.name}
              data={lgaMapData}
              selectedLgaId={scope.lga?.id.split('.')[1] ?? null}
              onSelect={selectLga}
              onZoomOut={() => go('/states')}
              crumbs={crumbs}
              overlay={legend}
              exportScope={lensLabel(lens)}
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
              overlay={legend}
              exportScope={lensLabel(lens)}
              onSearch={searchPlaces}
              className="h-full"
            />
          )}
        </div>

        {/* Fixed width, wide enough for a full LGA name and a band label on one
            line without the count rows wrapping. */}
        <aside className="min-h-0 shrink-0 border-t border-border bg-surface lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
          <CoveragePane
            scope={scope}
            lens={lens}
            national={national.data}
            states={states.data}
            listAreas={scope.state ? stateLgas : states.data}
            listLabel={scope.state ? 'LGAs' : 'States'}
            selectedListId={scope.lga?.id ?? scope.state?.id ?? null}
            onSelectListItem={(area: AreaProfile) =>
              area.level === 'state'
                ? selectState(area.id)
                : selectLga(area.id.split('.')[1] ?? area.id)
            }
          />
        </aside>
      </div>
    </div>
  );
}

/** What the fills mean right now — the lens named, or the absence of one. */
function lensLabel(lens: DomainLens): string {
  if (!lens.length) return 'Overall readiness';
  if (lens.length === 1) return THEME_BY_ID[lens[0]!].label;
  return `The weakest of ${lens.length} domains`;
}

function subtitleFor(level: 'national' | 'state' | 'lga', lens: DomainLens): string {
  const scope =
    level === 'national'
      ? 'All 37 states, by readiness band'
      : level === 'state'
        ? 'Local government areas, by readiness band'
        : 'One local government area';
  return lens.length ? `${scope} · ${lensLabel(lens)}` : scope;
}
