import { useCallback, useEffect, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { PAGE_GUIDES } from '@/content/pageGuides';
import {
  MapLegend,
  NigeriaChoropleth,
  StateOutlineMap,
  rankByName,
  type Crumb,
  type MapSearchResult,
} from '@/components/map';
import { LoadError, Skeleton } from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { MATURITY_LABEL, MATURITY_NO_DATA } from '@/lib/bands';
import { formatPercent } from '@/lib/format';
import { LEADERSHIP_ANSWER_LABEL, LEADERSHIP_SUB_DOMAINS } from '@/lib/themes';
import type { GeoDatum } from '@/components/map';
import type { AreaProfile, LeadershipSubDomainId } from '@/lib/types';
import { CoverageFilters } from './CoverageFilters';
import { ExplainScope } from '@/modules/explain/context';
import { CoveragePane } from './CoveragePane';
import { bandOf, hasUnbanded, resolveScope } from './coverageScope';

/**
 * National Coverage — the map *is* the page.
 *
 * One screen, not a stack of panels: filters across the top, a full-bleed map,
 * and a pane down the side that always says something about whatever is
 * selected. Clicking a state opens that state on its own and re-scopes the
 * pane. The pane is never empty — with nothing selected it holds the national
 * picture — so there is no "choose something to begin" state to get past.
 *
 * ## Two levels: the country, and one state
 *
 * There was a third. Clicking a state drilled into its 44 LGAs, and clicking
 * one of those went further still. Both are gone at the client's direction,
 * and the page is better for it, because the LGA level was drawing a
 * distinction the data does not make: the coverage model classifies *states*,
 * an LGA inherited its parent's band, and 44 polygons in one colour with 44
 * names on them look like 44 findings. See the note in `coverageScope`.
 *
 * So the state view is one silhouette — `StateOutlineMap`, no internal
 * boundaries, no LGA names, nothing to click into — filled with the state's own
 * band, which is the same colour the state had on the national map a click
 * earlier. Going in changes the extent and the detail around it; it does not
 * change what is being said.
 *
 * ## The band is maturity
 *
 * Every fill, badge and count on this page is the State Maturity sheet's
 * reading — six items (four governance answers, electricity, internet) scored
 * and averaged into Mature / Moderately mature / Not mature. It is carried on
 * the band scale, so it takes the band colours, and it is labelled in its own
 * words throughout (`MATURITY_LABEL`). Six states are Not assessed and paint
 * grey. See `build-maturity.mjs`.
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
 * view a link — `/states/kano` is a whole sentence.
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
  const { states, national } = useDataContext();

  const scope = useMemo(() => resolveScope(states.data, stateId), [states.data, stateId]);

  /** Where the reader is, for "Explain" on the pane's blocks. */
  const explainScope = useMemo(
    () => [
      scope.level === 'state'
        ? `Area: ${scope.state.name} State`
        : `Area: Nigeria, all ${states.data.length} states`,
    ],
    [scope, states.data.length],
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

  /**
   * Old LGA links land on the state, and say so in the address bar.
   *
   * `/states/kano/dala` is in people's history, in sent messages and in decks.
   * The route still matches — dropping it would bounce those to the landing
   * page — and the level behind it is gone, so the link resolves to the nearest
   * thing that still exists and rewrites itself to `/states/kano`. Replace, not
   * push: Back should return to wherever the reader came from, not to a URL
   * this page just redirected away from.
   */
  useEffect(() => {
    if (lgaId && stateId) navigate(`/states/${stateId}`, { replace: true });
  }, [lgaId, stateId, navigate]);

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
        bandLabel: maturityLabel(state),
        n: 0,
        evidenceGrade: 'primary',
        label: state.name,
        // The two access rates behind two of the six maturity items, or the
        // measure's own name where a state carries neither.
        valueLabel: coverageRates(state) ?? MAP_MEASURE,
        tooltipGroups: hoverGroups(state),
      };
    }
    return data;
  }, [states.data]);

  /**
   * The state view's one shape.
   *
   * Deliberately the same datum the state carries on the national map — same
   * band, same hover line — because drilling in is a change of extent and not
   * a change of claim. If these two ever disagreed, one of the two maps would
   * be lying about the same state.
   */
  const stateDatum = useMemo<GeoDatum | null>(() => {
    if (!scope.state) return null;
    return (
      nationalMapData[scope.state.id] ?? {
        band: bandOf(scope.state),
        bandLabel: maturityLabel(scope.state),
        n: 0,
        evidenceGrade: 'primary',
        label: scope.state.name,
        valueLabel: coverageRates(scope.state) ?? MAP_MEASURE,
        tooltipGroups: hoverGroups(scope.state),
      }
    );
  }, [nationalMapData, scope.state]);

  const selectState = useCallback(
    (id: string) => go(id === scope.state?.id ? '/states' : `/states/${id}`),
    [go, scope.state],
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
    return out;
  }, [scope.state, go]);

  /**
   * The map's locator: a name in, a place out.
   *
   * States, and only states, because a state is the only place this page has.
   * It offered LGAs as well while there was a level for them to lead to; with
   * that level gone every LGA hit would resolve to its parent state, which is a
   * list of 774 names for 37 destinations. Assessed States, which does drill
   * into an LGA and into a facility, still searches all three.
   */
  const searchPlaces = useCallback(
    (query: string): MapSearchResult[] =>
      rankByName(states.data, query, (st) => st.name).map((st) => ({
        id: `state:${st.id}`,
        label: st.name,
        kind: 'State' as const,
        hint: st.zone ?? undefined,
        onSelect: () => go(`/states/${st.id}`),
      })),
    [states.data, go],
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
   * On at both levels now, and that is the change the state view brings: the
   * silhouette a reader drills into is painted from the same three-band scale
   * the country was, so the key that explained the country explains it too. It
   * was left off inside a state while that view drew LGAs, which carried no
   * coverage reading of their own for a key to name.
   */
  const legend = (
    <div className="rounded border border-border bg-surface/92 px-2.5 py-1.5 backdrop-blur">
      <MapLegend
        labels={MATURITY_LABEL}
        noDataLabel={MATURITY_NO_DATA}
        showNoData={hasUnbanded(states.data)}
      />
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
        guide={PAGE_GUIDES.coverage}
        subtitle={subtitleFor(scope.level)}
        back={
          scope.level !== 'national' ? (
            <button
              type="button"
              onClick={() => go('/states')}
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
          ) : scope.state && stateDatum ? (
            // One shape, in the band it had on the map the reader just came
            // from — no LGA polygons, no LGA names, nothing under it to click
            // into. See `StateOutlineMap`.
            <StateOutlineMap
              key={scope.state.id}
              fit="fill"
              stateId={scope.state.id}
              stateName={scope.state.name}
              datum={stateDatum}
              onZoomOut={() => go('/states')}
              crumbs={crumbs}
              overlay={legend}
              exportScope={MAP_MEASURE}
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
              exportScope={MAP_MEASURE}
              onSearch={searchPlaces}
              className="h-full"
            />
          )}
        </div>

        {/* Fixed width, wide enough for a full state name and a band label on
            one line without the count rows wrapping. */}
        <aside className="min-h-0 shrink-0 border-t border-border bg-surface lg:h-full lg:w-[480px] lg:border-l lg:border-t-0">
          <ExplainScope value={explainScope}>
            <CoveragePane
              scope={scope}
              national={national.data}
              states={states.data}
              // Read at national level only — the pane drops the list once a
              // state is open. Handed over unconditionally because the rows are
              // the same 37 either way and the decision about whether to draw
              // them belongs with the pane that draws them.
              listAreas={states.data}
              listLabel="States"
              selectedListId={scope.state?.id ?? null}
              onSelectListItem={(area: AreaProfile) => selectState(area.id)}
            />
          </ExplainScope>
        </aside>
      </div>
    </div>
  );
}

/**
 * The band's name in maturity's words, or "Not assessed" for the six states
 * the sheet has not scored — never "No data", which reads as a gap in the
 * dashboard rather than in the assessment.
 */
function maturityLabel(area: AreaProfile): string {
  const band = bandOf(area);
  return band ? MATURITY_LABEL[band] : MATURITY_NO_DATA;
}

/**
 * The two access rates, as one line — the map names each shape with it for
 * screen readers and exports; the hover card lays them out in `hoverGroups`.
 *
 * The band on its own says a state is Not mature and stops there. Electricity
 * and internet are two of the six items it was scored from, and the two that
 * are measurements; the other four are the governance answers.
 *
 * Deliberately not colour-coded and deliberately not banded. These are
 * measurements sitting *beside* a judgement — see the note on
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

/** The four commitments, named short enough for the hover card. */
const COMMITMENT_SHORT: Record<LeadershipSubDomainId, string> = {
  governance_structure: 'Governance structure',
  data_governance_policy: 'Data governance policy',
  digital_health_strategy: 'Digital health strategy',
  financial_commitment: 'Financial commitment for EMR',
};

/**
 * The hover card under the band: the state's readings in the pane's order —
 * Leadership & Governance's four commitments, answered Yes / Partial / No,
 * then Technical Infrastructure's two access rates. Plain text, like the
 * pane's figures: colour on this map means maturity and nothing else.
 */
function hoverGroups(area: AreaProfile): NonNullable<GeoDatum['tooltipGroups']> {
  const { leadership, measures } = area.coverage;
  const pct = (v: number | null | undefined) => (v == null ? '—' : formatPercent(v, 1));
  return [
    {
      title: 'Leadership & Governance',
      rows: leadership
        ? LEADERSHIP_SUB_DOMAINS.map((sub) => ({
            label: COMMITMENT_SHORT[sub.id],
            value: LEADERSHIP_ANSWER_LABEL[leadership[sub.id]],
          }))
        : [{ label: 'Commitments', value: 'Not assessed' }],
    },
    {
      title: 'Technical Infrastructure',
      rows: [
        { label: 'Electricity access', value: pct(measures.electricityAccessPct) },
        { label: 'Internet subscriptions per head', value: pct(measures.internetSubscriptionPct) },
      ],
    },
  ];
}

/** What the fills mean — named on the map's export. */
const MAP_MEASURE = 'State maturity';

function subtitleFor(level: 'national' | 'state'): string {
  return level === 'national'
    ? 'All 37 states, by maturity band'
    : 'One state, by maturity band';
}
