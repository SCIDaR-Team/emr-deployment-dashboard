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
import { formatCount, formatPercent } from '@/lib/format';
import type { GeoDatum } from '@/components/map';
import type { AreaProfile } from '@/lib/types';
import { CoverageFilters } from './CoverageFilters';
import { CoveragePane } from './CoveragePane';
import { bandOf, hasUnbanded, resolveScope } from './coverageScope';

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
 * The State dropdown and the map both write the URL, and the URL is the only
 * place scope lives. That is what stops the two disagreeing, and it makes every
 * view a link — `/states/kano/dala` is a whole sentence.
 *
 * It is now the *only* thing they write. There was a domain lens alongside it,
 * held in the filter store and mirrored into `?domain=`, which re-read every
 * band on the page under one or more coverage domains and rolled two of them up
 * to the weaker. Its control has come out at the client's direction, and with
 * nothing left able to set it the lens came out too — see `CoverageFilters`.
 * Every band here is the area's own overall reading, and the page has one piece
 * of state again.
 */

export default function NationalCoveragePage() {
  const { stateId, lgaId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { states, lgas, national } = useDataContext();

  const scope = useMemo(
    () => resolveScope(states.data, lgas.data, stateId, lgaId),
    [states.data, lgas.data, stateId, lgaId],
  );

  /** Navigation that carries the querystring with it — changing scope must
   *  never silently drop whatever else is in the link. */
  const go = useCallback(
    (path: string) => {
      const query = search.toString();
      navigate(query ? `${path}?${query}` : path);
    },
    [navigate, search],
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
        band: bandOf(state),
        n: state.lgaCount ?? 0,
        evidenceGrade: 'primary',
        label: state.name,
        valueLabel: coverageRates(state) ?? `${formatCount(state.lgaCount ?? 0)} LGAs`,
      };
    }
    return data;
  }, [states.data]);

  const lgaMapData = useMemo(() => {
    const data: Record<string, GeoDatum> = {};
    for (const lga of stateLgas) {
      data[lga.id.split('.')[1] ?? lga.id] = {
        band: bandOf(lga),
        n: 0,
        evidenceGrade: 'primary',
        label: lga.name,
        valueLabel: READINESS_LABEL,
      };
    }
    return data;
  }, [stateLgas]);

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
  /*
   * The no-data key appears only when the map actually has grey on it.
   *
   * Read off the states rather than hardcoded, so the key is present exactly
   * when there is something for it to name. With the domain lens gone every
   * state carries its overall band and today that is never — but an
   * unexplained grey on a readiness map reads as the worst band rather than as
   * an absent one, which is the single misreading the null band exists to
   * prevent, so the check earns its keep the moment a state arrives
   * unclassified.
   *
   * Left off inside a state: an LGA map carries no coverage reading at all, and
   * a key naming the whole map would explain nothing.
   */
  const legend = (
    <div className="rounded border border-border bg-surface/92 px-2.5 py-1.5 backdrop-blur">
      <MapLegend showNoData={!scope.state && hasUnbanded(states.data)} />
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
        subtitle={subtitleFor(scope.level)}
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
          stateId={scope.state?.id ?? null}
          onStateChange={(id) => go(id ? `/states/${id}` : '/states')}
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
              crumbs={crumbs}
              overlay={legend}
              exportScope={READINESS_LABEL}
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
              exportScope={READINESS_LABEL}
              onSearch={searchPlaces}
              className="h-full"
            />
          )}
        </div>

        {/* Fixed width, wide enough for a full LGA name and a band label on one
            line without the count rows wrapping. */}
        <aside className="min-h-0 shrink-0 border-t border-border bg-surface lg:h-full lg:w-[480px] lg:border-l lg:border-t-0">
          <CoveragePane
            scope={scope}
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

/**
 * The two figures the band was classified from, for the hover.
 *
 * The band on its own says a state is Not ready and stops there; these say why,
 * and they are the only two inputs the coverage model has — so a reader
 * hovering Kano learns that 45% electricity access is what put it there, not
 * its network coverage or its staffing.
 *
 * Deliberately not colour-coded and deliberately not banded. These are
 * measurements sitting *beside* a judgement, and the tooltip renders this
 * string in muted body text for that reason — see the note on
 * `CoverageMeasures`. Internet subscription can exceed 100% (per-SIM counting),
 * which is why it is printed as a plain figure and never as a bar.
 *
 * Null when either rate is missing, so the caller falls back rather than
 * printing a half-sentence with an em dash in it. In practice both are set on
 * all 37 states and neither is set anywhere else.
 */
function coverageRates(area: AreaProfile): string | null {
  const { electricityAccessPct, internetSubscriptionPct } = area.coverage.measures;
  if (electricityAccessPct == null || internetSubscriptionPct == null) return null;
  return (
    `Electricity ${formatPercent(electricityAccessPct, 1)} · ` +
    `Internet ${formatPercent(internetSubscriptionPct, 1)}`
  );
}

/**
 * What the fills mean — a constant now, where it was a function of the lens.
 *
 * The Domain control could name a single domain or "the weakest of two", and
 * this label followed it onto the map's export. With one reading on the page
 * there is one thing for it to say.
 */
const READINESS_LABEL = 'Overall readiness';

function subtitleFor(level: 'national' | 'state' | 'lga'): string {
  return level === 'national'
    ? 'All 37 states, by readiness band'
    : level === 'state'
      ? 'Local government areas, by readiness band'
      : 'One local government area';
}
