/**
 * Apply the global filters to the facility population and derive aggregates.
 *
 * Everything downstream reads from here rather than from the raw context, so a
 * filtered view can never accidentally show a national figure.
 *
 * Every aggregate here is a **count**. There is no score in the model to
 * average, and the counts are the stronger statement anyway: "381 of 444 not
 * ready" is a fact a reader can act on, where a mean of 2.41 is a number they
 * have to be taught to read first.
 */

import { useMemo } from 'react';
import { useDataContext } from '@/state/dataContext';
import { useFilterStore } from '@/store/filterStore';
import { archetypeDistribution } from '@/lib/archetype';
import { dominantBand } from '@/lib/bands';
import { FACILITY_THEMES } from '@/lib/themes';
import type {
  Band,
  FacilitySummary,
  FacilityThemeId,
  FilterState,
} from '@/lib/types';

export function filterFacilities(
  facilities: FacilitySummary[],
  f: FilterState,
): FacilitySummary[] {
  const search = f.search.trim().toLowerCase();

  return facilities.filter((fac) => {
    if (f.states.length && !f.states.includes(fac.state)) return false;
    if (f.lgas.length && !f.lgas.includes(fac.lga)) return false;
    if (f.zones.length && !f.zones.includes(fac.zone)) return false;
    if (f.geography.length && !f.geography.includes(fac.geography)) return false;
    if (f.functionalityLevels.length && !f.functionalityLevels.includes(fac.functionalityLevel)) {
      return false;
    }
    if (f.archetypes.length && (!fac.archetype || !f.archetypes.includes(fac.archetype))) {
      return false;
    }

    if (f.funding.length) {
      const label = fac.isBHCPF ? 'BHCPF' : 'non-BHCPF';
      if (!f.funding.includes(label)) return false;
    }

    for (const [themeId, bands] of Object.entries(f.bandByTheme)) {
      if (!bands?.length) continue;
      const band = fac.themeBands[themeId as FacilityThemeId];
      if (!band || !bands.includes(band)) return false;
    }

    // Search covers the three names on screen, not just the facility's own —
    // typing "Dala" should find the LGA's facilities, which is what a user
    // reading the ranked table is trying to do.
    if (
      search &&
      !fac.name.toLowerCase().includes(search) &&
      !fac.lga.toLowerCase().includes(search) &&
      !fac.state.toLowerCase().includes(search)
    ) {
      return false;
    }

    return true;
  });
}

/**
 * The options each filter can offer, with the facility count behind each one.
 *
 * Derived from the population rather than declared, so a value that does not
 * occur is never offered. LGA options narrow to the selected states — 305 LGAs
 * in one list is not a picker — but every other facet is computed against the
 * *unfiltered* population, so its counts stay stable as the user selects and
 * the list does not collapse under them.
 */
export function buildFilterOptions(facilities: FacilitySummary[], selectedStates: string[]) {
  const tally = (rows: FacilitySummary[], pick: (f: FacilitySummary) => string | null) => {
    const counts = new Map<string, number>();
    for (const f of rows) {
      const key = pick(f);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, label: key, count }));
  };

  const inScope = selectedStates.length
    ? facilities.filter((f) => selectedStates.includes(f.state))
    : facilities;

  return {
    states: tally(facilities, (f) => f.state),
    lgas: tally(inScope, (f) => f.lga),
    zones: tally(facilities, (f) => f.zone),
    geography: tally(facilities, (f) => f.geography),
    functionalityLevels: tally(facilities, (f) => f.functionalityLevel),
    funding: tally(facilities, (f) => (f.isBHCPF ? 'BHCPF' : 'non-BHCPF')),
  };
}

export interface FilteredMetrics {
  total: number;
  /** Overall readiness split across the filtered population. */
  distribution: Record<Band, number>;
  /** The population's own band, by the `dominantBand` rule. */
  band: Band | null;
  /** Per-domain split, so a page can show *which* domain the not-ready sit in. */
  themeDistribution: Record<FacilityThemeId, Record<Band, number>>;
  /** The band each domain lands in across the filtered population. */
  themeBands: Record<FacilityThemeId, Band | null>;
}

export function useFilteredData() {
  const { facilities } = useDataContext();
  const filters = useFilterStore();

  const filtered = useMemo(
    () => filterFacilities(facilities.data, filters),
    [facilities.data, filters],
  );

  const metrics = useMemo<FilteredMetrics>(() => {
    const themeDistribution = Object.fromEntries(
      FACILITY_THEMES.map((t) => [
        t.id,
        archetypeDistribution(filtered.map((f) => f.themeBands[t.id as FacilityThemeId])),
      ]),
    ) as Record<FacilityThemeId, Record<Band, number>>;

    const themeBands = Object.fromEntries(
      FACILITY_THEMES.map((t) => [
        t.id,
        dominantBand(themeDistribution[t.id as FacilityThemeId]),
      ]),
    ) as Record<FacilityThemeId, Band | null>;

    const distribution = archetypeDistribution(filtered.map((f) => f.archetype));

    return {
      total: filtered.length,
      distribution,
      band: dominantBand(distribution),
      themeDistribution,
      themeBands,
    };
  }, [filtered]);

  return {
    facilities: filtered,
    /** The unfiltered population — the filter bar counts its options from this. */
    allFacilities: facilities.data,
    metrics,
    isLoading: facilities.isLoading,
    error: facilities.error,
    /** Re-run the facility fetch. Pass to `LoadError`'s `onRetry`. */
    retry: facilities.refetch,
    isFiltered: filters.isActive(),
  };
}
