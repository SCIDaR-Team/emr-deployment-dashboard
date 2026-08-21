import { useCallback, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { MapLegend, NigeriaChoropleth, StateLGAMap } from '@/components/map';
import { LoadError, Skeleton } from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { formatCount } from '@/lib/format';
import { THEME_BY_ID } from '@/lib/themes';
import type { GeoDatum } from '@/components/map';
import type { AreaProfile } from '@/lib/types';
import { CoverageFilters } from './CoverageFilters';
import { CoveragePane } from './CoveragePane';
import { bandUnderLens, parseLens, resolveScope, type DomainLens } from './coverageScope';

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
 */

export default function NationalCoveragePage() {
  const { stateId, lgaId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { states, lgas, national } = useDataContext();

  const lens = parseLens(search.get('domain'));
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

  const setLens = useCallback(
    (next: DomainLens) => {
      const params = new URLSearchParams(search);
      if (next === 'overall') params.delete('domain');
      else params.set('domain', next);
      setSearch(params, { replace: true });
    },
    [search, setSearch],
  );

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
          onReset={() => navigate('/states')}
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

          {/* The key sits on the map rather than under it: the map is the whole
              height of the page here, and a legend below the fold explains
              nothing. */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-border bg-surface/92 px-2.5 py-1.5 backdrop-blur">
            <MapLegend showNoData={false} />
          </div>
        </div>

        <aside className="min-h-0 shrink-0 border-t border-border bg-surface lg:h-full lg:w-[370px] lg:border-l lg:border-t-0">
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

function lensLabel(lens: DomainLens): string {
  return lens === 'overall' ? 'Overall readiness' : THEME_BY_ID[lens].label;
}

function subtitleFor(level: 'national' | 'state' | 'lga', lens: DomainLens): string {
  const scope =
    level === 'national'
      ? 'All 37 states, by readiness band'
      : level === 'state'
        ? 'Local government areas, by readiness band'
        : 'One local government area';
  return lens === 'overall' ? scope : `${scope} · ${lensLabel(lens)}`;
}
