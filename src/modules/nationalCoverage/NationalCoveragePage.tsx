import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/filters/FilterBar';
import { MapLegend, NigeriaChoropleth } from '@/components/map';
import {
  BandBadge,
  BandLegend,
  BandRow,
  DistributionBar,
  LoadError,
  SectionCard,
  Tile,
  TileRow,
} from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilterStore } from '@/store/filterStore';
import { buildBandMap } from '@/lib/scale';
import { BAND_LABEL, bandShare } from '@/lib/bands';
import { COVERAGE } from '@/lib/constants';
import { formatCount } from '@/lib/format';
import { THEMES } from '@/lib/themes';
import type { AreaProfile } from '@/lib/types';

/**
 * National Coverage — all 37 states, and how each one was evidenced.
 *
 * The page's whole argument is the evidence split. Twelve states were visited
 * and carry facility counts; the other 25 were desk-reviewed and carry a
 * state-level reading with nothing underneath it. Those are two different kinds
 * of claim, and every surface here keeps them apart — the map hatches the
 * desk-reviewed polygons, and the table gives them a dash where a facility
 * count would go rather than a zero, which would read as "we looked and found
 * none".
 *
 * NOTE: the editorial direction for this page is still open — the client has
 * the structure and will set the content. What is here is the coverage frame
 * everything else will hang off, wired to the synthetic dataset.
 */

const SECTIONS = [
  { id: 'map', label: 'Map' },
  { id: 'states', label: 'All states' },
  { id: 'domains', label: 'Domains' },
];

export default function NationalCoveragePage() {
  const { stateId } = useParams();
  const navigate = useNavigate();
  const { states, facilities, national } = useDataContext();
  const zones = useFilterStore((s) => s.zones);

  const inScope = useMemo(
    () => (zones.length ? states.data.filter((s) => zones.includes(s.zone ?? '')) : states.data),
    [states.data, zones],
  );

  const selected = useMemo(
    () => inScope.find((s) => s.id === stateId) ?? null,
    [inScope, stateId],
  );

  const mapData = useMemo(() => buildBandMap(inScope), [inScope]);

  const primary = inScope.filter((s) => s.evidenceGrade === 'primary');
  const secondary = inScope.filter((s) => s.evidenceGrade === 'secondary');
  const facilityTotal = primary.reduce((sum, s) => sum + s.facilityCount, 0);
  const lgaTotal = primary.reduce((sum, s) => sum + (s.lgaCount ?? 0), 0);

  const ranked = useMemo(
    () =>
      [...inScope].sort((a, b) => {
        // Assessed states first, then by the count that matters — how many of
        // their facilities are not ready. Sorting by band would put twelve
        // states in three buckets and leave the order inside them arbitrary.
        if (a.evidenceGrade !== b.evidenceGrade) return a.evidenceGrade === 'primary' ? -1 : 1;
        return b.archetypeDistribution.not_ready - a.archetypeDistribution.not_ready;
      }),
    [inScope],
  );

  if (states.error) {
    return <LoadError what="the state profiles" error={states.error} onRetry={states.refetch} />;
  }

  return (
    <>
      <PageHeader
        title="National Coverage"
        subtitle="All 37 states and how each was evidenced"
        sections={SECTIONS}
      >
        <FilterBar facilities={facilities.data} show={['zone']} />
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-5">
        <TileRow className="sm:grid-cols-2 lg:grid-cols-5">
          <Tile label="States & FCT" value={formatCount(inScope.length)} />
          <Tile
            label="Assessed by survey"
            value={formatCount(primary.length)}
            note="Facility instrument"
          />
          <Tile
            label="Desk review only"
            value={formatCount(secondary.length)}
            note="State-level findings"
          />
          <Tile label="LGAs covered" value={formatCount(lgaTotal || COVERAGE.lgas)} />
          <Tile label="Facilities assessed" value={formatCount(facilityTotal)} />
        </TileRow>

        <SectionCard
          id="map"
          title="Readiness by state"
          subtitle="Hatched states were desk-reviewed — no facility survey stands behind them"
        >
          <NigeriaChoropleth
            data={mapData}
            selectedId={stateId ?? null}
            onSelect={(id) => navigate(id === stateId ? '/states' : `/states/${id}`)}
          />
          <MapLegend showSecondary className="mt-3" />
        </SectionCard>

        {selected && <StatePanel profile={selected} />}

        <SectionCard
          id="states"
          title="All states"
          subtitle="Assessed states first, ordered by how many facilities are not ready"
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="th">State</th>
                  <th className="th">Zone</th>
                  <th className="th">Evidence</th>
                  <th className="th text-right">Facilities</th>
                  <th className="th">Readiness</th>
                  <th className="th w-[220px]">Split</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/states/${s.id}`)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-sunk"
                  >
                    <td className="td font-medium text-foreground">{s.name}</td>
                    <td className="td text-muted-foreground">{s.zone ?? '—'}</td>
                    <td className="mono td text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                      {s.evidenceGrade === 'primary' ? 'Survey' : 'Desk review'}
                    </td>
                    <td className="mono td text-right">
                      {s.evidenceGrade === 'primary' ? formatCount(s.facilityCount) : '—'}
                    </td>
                    <td className="td">
                      <BandBadge band={s.band} size="sm" />
                    </td>
                    <td className="td">
                      {s.evidenceGrade === 'primary' ? (
                        <DistributionBar
                          distribution={s.archetypeDistribution}
                          scored={s.facilityCount}
                          size="sm"
                          showLegend={false}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No facility survey
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2.5">
            <BandLegend />
          </div>
        </SectionCard>

        <SectionCard
          id="domains"
          title="The five domains, nationally"
          subtitle="Leadership & Governance is a state-level reading — it has no facility instrument behind it"
        >
          <DomainSplits profile={national.data} />
        </SectionCard>
      </div>
    </>
  );
}

/**
 * The five domains, each as a split rather than a single band.
 *
 * The dominant band on its own is not usable here: nationally all four facility
 * domains resolve to Moderately ready, and five identical rows would say
 * nothing about infrastructure failing three times as often as workforce does.
 * The bar carries the finding; the band label stays as the summary beside it.
 */
function DomainSplits({ profile }: { profile: AreaProfile | null }) {
  if (!profile) return null;
  return (
    <div className="space-y-3.5">
      {THEMES.map((t) => {
        const dist = profile.themeDistribution?.[t.id];
        const scored = dist
          ? dist.not_ready + dist.moderately_ready + dist.ready
          : 0;
        const share = dist ? bandShare(dist, 'not_ready') : null;
        return (
          <div key={t.id}>
            <BandRow
              label={t.label}
              band={profile.themeBands[t.id] ?? null}
              note={
                share != null
                  ? `${share.toFixed(0)}% not ready`
                  : t.facilityLevel
                    ? undefined
                    : 'state-level reading'
              }
            />
            {scored > 0 && dist && (
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
      <BandLegend className="pt-1" />
    </div>
  );
}

/** The selected state, opened under the map rather than in a drawer — a reader
 *  comparing two states wants the map still on screen. */
function StatePanel({ profile }: { profile: AreaProfile }) {
  return (
    <SectionCard
      title={profile.name}
      subtitle={
        profile.evidenceGrade === 'primary'
          ? `${formatCount(profile.facilityCount)} facilities across ${formatCount(
              profile.lgaCount ?? 0,
            )} LGAs`
          : 'Desk review — state-level findings only'
      }
      action={<BandBadge band={profile.band} size="sm" />}
    >
      {profile.evidenceGrade === 'primary' && (
        <DistributionBar
          distribution={profile.archetypeDistribution}
          scored={profile.facilityCount}
          className="mb-4"
        />
      )}
      <DomainSplits profile={profile} />
      <p className="mt-3 text-xs text-muted-foreground">
        {profile.band
          ? `${profile.name} sits at ${BAND_LABEL[profile.band].toLowerCase()}.`
          : 'No reading for this state.'}
      </p>
    </SectionCard>
  );
}
