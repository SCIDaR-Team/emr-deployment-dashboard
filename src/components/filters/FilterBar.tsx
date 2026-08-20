import { useMemo } from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BAND_LABEL } from '@/lib/bands';
import { buildFilterOptions } from '@/hooks/useFilteredData';
import { useFilterStore } from '@/store/filterStore';
import { MultiSelectDropdown } from '@/components/ui';
import type { Band, FacilitySummary, FunctionalityLevel } from '@/lib/types';

/** Which controls a page shows. Every page uses a subset. */
export type FilterKey =
  | 'state'
  | 'lga'
  | 'zone'
  | 'geography'
  | 'funding'
  | 'level'
  | 'archetype'
  | 'search';

const DEFAULT_KEYS: FilterKey[] = ['state', 'lga', 'archetype', 'level', 'search'];

export interface FilterBarProps {
  /** The unfiltered population. Option counts are computed from it. */
  facilities: FacilitySummary[];
  show?: FilterKey[];
  /**
   * Page-specific controls, rendered in the same row as the shared ones,
   * before Reset. A page whose control needs different option counts than the
   * shared one (State Summary's Readiness filter counts states, not
   * facilities) passes it here rather than starting a second row.
   */
  children?: React.ReactNode;
  className?: string;
}

const GEOGRAPHY_LABELS: Record<string, string> = { rural: 'Rural', urban: 'Urban' };

/**
 * The filter row, rendered under the page title.
 *
 * Labelled dropdowns in a horizontal row, following the ERA prototype rather
 * than the left rail the SRH dashboard uses — the Figma puts the map at full
 * page width, which a rail would eat into.
 *
 * Every control is labelled above the trigger and carries its option counts, so
 * a user can see that "Rivers + Functional L2" is 14 facilities before applying
 * it rather than after wondering where the chart went. The reset button appears
 * only when something is active, and states the count it will restore.
 *
 * Each control keeps its designed width from `sm` up. Below that it grows to
 * share the row instead: at 375px a fixed 12rem trigger sits in a column with
 * 150px of dead space beside it and every filter takes a whole row, which is
 * five rows before the reader reaches the page.
 */
export function FilterBar({ facilities, show = DEFAULT_KEYS, children, className }: FilterBarProps) {
  const filters = useFilterStore();
  const visible = new Set(show);

  const options = useMemo(
    () => buildFilterOptions(facilities, filters.states),
    [facilities, filters.states],
  );

  const active = filters.isActive();

  return (
    <div className={cn('flex w-full flex-wrap items-end gap-3', className)}>
      {visible.has('state') && (
        <MultiSelectDropdown
          label="State"
          className="min-w-[9.5rem] flex-1 sm:flex-none sm:w-48"
          groups={[{ label: 'States assessed', items: options.states }]}
          selected={filters.states}
          onChange={filters.setStates}
          placeholder="All 12 states"
          searchable
        />
      )}

      {visible.has('lga') && (
        <MultiSelectDropdown
          label="LGA"
          className="min-w-[9.5rem] flex-1 sm:flex-none sm:w-48"
          groups={[{ label: 'LGAs', items: options.lgas }]}
          selected={filters.lgas}
          onChange={filters.setLGAs}
          // The list is scoped to the chosen states, so say which scope is in
          // force — "All LGAs" over 305 entries and over 34 look identical.
          placeholder={
            filters.states.length ? `All in ${filters.states.length} state(s)` : 'All LGAs'
          }
          searchable
        />
      )}

      {visible.has('zone') && (
        <MultiSelectDropdown
          label="Zone"
          className="min-w-[9.5rem] flex-1 sm:flex-none sm:w-44"
          groups={[{ label: 'Geopolitical zones', items: options.zones }]}
          selected={filters.zones}
          onChange={filters.setZones}
          placeholder="All zones"
        />
      )}

      {visible.has('geography') && (
        <MultiSelectDropdown
          label="Setting"
          className="min-w-[9.5rem] flex-1 sm:flex-none sm:w-36"
          groups={[
            {
              label: 'Setting',
              items: options.geography.map((o) => ({
                ...o,
                label: GEOGRAPHY_LABELS[o.key] ?? o.label,
              })),
            },
          ]}
          selected={filters.geography}
          onChange={(next) => filters.setGeography(next as ('rural' | 'urban')[])}
          placeholder="All"
        />
      )}

      {visible.has('funding') && (
        <MultiSelectDropdown
          label="Funding"
          className="min-w-[9.5rem] flex-1 sm:flex-none sm:w-40"
          groups={[{ label: 'Funding', items: options.funding }]}
          selected={filters.funding}
          onChange={(next) => filters.setFunding(next as ('BHCPF' | 'non-BHCPF')[])}
          placeholder="All"
        />
      )}

      {visible.has('level') && (
        <MultiSelectDropdown
          label="Functionality"
          className="min-w-[9.5rem] flex-1 sm:flex-none sm:w-48"
          groups={[{ label: 'Functionality level', items: options.functionalityLevels }]}
          selected={filters.functionalityLevels}
          onChange={(next) => filters.setFunctionalityLevels(next as FunctionalityLevel[])}
          placeholder="All levels"
        />
      )}

      {visible.has('archetype') && (
        <MultiSelectDropdown
          label="Readiness"
          className="min-w-[9.5rem] flex-1 sm:flex-none sm:w-48"
          groups={[
            {
              label: 'Facility archetype',
              items: (['ready', 'moderately_ready', 'not_ready'] as Band[]).map((band) => ({
                key: band,
                label: BAND_LABEL[band],
                count: facilities.filter((f) => f.archetype === band).length,
              })),
            },
          ]}
          selected={filters.archetypes}
          onChange={(next) => filters.setArchetypes(next as Band[])}
          placeholder="All readiness levels"
        />
      )}

      {visible.has('search') && (
        <div className="min-w-[13rem] flex-1">
          <label
            htmlFor="facility-search"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Search
          </label>
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="facility-search"
              type="search"
              value={filters.search}
              onChange={(e) => filters.setSearch(e.target.value)}
              placeholder="Facility, LGA or state"
              className="h-10 w-full rounded-lg border border-input bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
        </div>
      )}

      {children}

      {active && (
        <button
          type="button"
          onClick={filters.reset}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-500/50 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <RotateCcw size={14} aria-hidden />
          Reset
        </button>
      )}

      <HiddenFilterChips show={visible} />
    </div>
  );
}

/**
 * Filters that are narrowing the page but have no control on it.
 *
 * Filter state is shared across modules and hydrated from the URL, so a link
 * carrying `?geo=urban` narrows a page whose bar shows no Setting dropdown. The
 * scope note says the count has changed but not why, and there is nothing to
 * click. These chips name each such filter and let it be cleared individually,
 * rather than leaving Reset as the only escape.
 */
function HiddenFilterChips({ show }: { show: Set<FilterKey> }) {
  const filters = useFilterStore();

  interface Chip {
    key: FilterKey;
    label: string;
    values: string[];
    clear: () => void;
  }

  const hidden: Chip[] = ([
    { key: 'state', label: 'State', values: filters.states, clear: () => filters.setStates([]) },
    { key: 'lga', label: 'LGA', values: filters.lgas, clear: () => filters.setLGAs([]) },
    { key: 'zone', label: 'Zone', values: filters.zones, clear: () => filters.setZones([]) },
    {
      key: 'geography',
      label: 'Setting',
      values: filters.geography.map((g) => GEOGRAPHY_LABELS[g] ?? g),
      clear: () => filters.setGeography([]),
    },
    { key: 'funding', label: 'Funding', values: filters.funding, clear: () => filters.setFunding([]) },
    {
      key: 'level',
      label: 'Functionality',
      values: filters.functionalityLevels,
      clear: () => filters.setFunctionalityLevels([]),
    },
    {
      key: 'archetype',
      label: 'Readiness',
      values: filters.archetypes.map((b) => BAND_LABEL[b]),
      clear: () => filters.setArchetypes([]),
    },
  ] satisfies Chip[]).filter((f) => !show.has(f.key) && f.values.length > 0);

  if (!hidden.length) return null;

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Also filtered by:</span>
      {hidden.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.clear}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 transition-colors hover:border-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {f.label}: {f.values.join(', ')}
          <X size={12} aria-hidden />
          <span className="sr-only">Clear {f.label.toLowerCase()} filter</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The "you are looking at a subset" line.
 *
 * Rendered next to any headline figure while filters are active. Without it a
 * filtered percentage reads exactly like a national one, which is the single
 * easiest way for this dashboard to be quoted wrongly.
 */
export function FilterScopeNote({
  shown,
  total,
  className,
}: {
  shown: number;
  total: number;
  className?: string;
}) {
  const active = useFilterStore((s) => s.isActive());
  if (!active) return null;

  return (
    <p className={cn('text-xs font-medium text-brand-600', className)}>
      Filtered — {shown.toLocaleString()} of {total.toLocaleString()} facilities. Every
      figure below is for this subset.
    </p>
  );
}
