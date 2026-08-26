import { useMemo } from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BAND_CSS_COLOR, BAND_LABEL } from '@/lib/bands';
import {
  GAPS,
  GAP_DOMAINS,
  GAP_BY_ID,
  GAP_DOMAIN_LABEL,
  SEVERITY_BAND,
  gapsForDomains,
} from '@/lib/gapCatalogue';
import { facilityBandUnder } from '@/lib/archetype';
import { THEME_BY_ID } from '@/lib/themes';
import { buildFilterOptions } from '@/hooks/useFilteredData';
import { useFilterStore } from '@/store/filterStore';
import { MultiSelectDropdown, type DropdownGroup } from '@/components/ui';
import type { Band, FacilitySummary, FacilityThemeId, FunctionalityLevel } from '@/lib/types';


/** Which controls a page shows. Every page uses a subset. */
export type FilterKey =
  | 'state'
  | 'lga'
  | 'zone'
  | 'funding'
  | 'level'
  | 'archetype'
  | 'domain'
  | 'gap'
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
  /**
   * The same, but ahead of the shared controls.
   *
   * For controls that set *scope* rather than narrow it. On Assessed States the
   * State and LGA pickers navigate — they write the path, exactly as clicking
   * the map does — and a control that decides what the row is filtering has to
   * come before the row, not after it.
   */
  leading?: React.ReactNode;
  /**
   * The rest of Reset's job, for a page whose scope lives outside the filter
   * store.
   *
   * Assessed States keeps State and LGA in the path, because there they are
   * navigation — so `filters.reset()` alone leaves the row reading "Kano" and
   * the reader looking at a page that just told them it was reset. `active`
   * says that scope is off its default, which is enough on its own to show the
   * button; `clear` runs alongside the store reset.
   */
  scopeReset?: { active: boolean; clear: () => void };
  className?: string;
}


/**
 * The filter row, rendered under the page title.
 *
 * Labelled dropdowns in a horizontal row, following the ERA prototype rather
 * than the left rail the SRH dashboard uses — the Figma puts the map at full
 * page width, which a rail would eat into.
 *
 * Every control is labelled above the trigger and carries its option counts, so
 * a user can see that "Rivers + Functional L2" is 14 facilities before applying
 * it rather than after wondering where the chart went. Reset appears as soon as
 * any control is off its default and returns every one of them at once —
 * including the ones this page does not show, and, via `scopeReset`, the ones
 * that are not in the filter store at all.
 *
 * Each control keeps its designed width from `sm` up. Below that it grows to
 * share the row instead: at 375px a fixed 12rem trigger sits in a column with
 * 150px of dead space beside it and every filter takes a whole row, which is
 * five rows before the reader reaches the page.
 */
export function FilterBar({
  facilities,
  show = DEFAULT_KEYS,
  children,
  leading,
  scopeReset,
  className,
}: FilterBarProps) {
  const filters = useFilterStore();
  const visible = new Set(show);

  const options = useMemo(
    () => buildFilterOptions(facilities, filters.states),
    [facilities, filters.states],
  );

  // Reset asks whether anything moved, not whether the population narrowed —
  // Domain does the first without the second, and so does a page whose scope
  // is in the path.
  const active = filters.isDirty() || Boolean(scopeReset?.active);

  // Gap and Readiness are the same selection — `archetypes` — read through
  // whichever domains are ticked. The heading says which, because "Foundational
  // gap" means something different under Workforce Capacity than it does over
  // the facility as a whole.
  const bandGroupLabel =
    filters.domains.length === 0
      ? 'Overall readiness'
      : filters.domains.length === 1
        ? `Gap in ${THEME_BY_ID[filters.domains[0]!].label}`
        : `Gap in the weakest of ${filters.domains.length} domains`;

  /** Counted the way the page filters: one rule, in `facilityBandUnder`. */
  const bandCount = (band: Band) =>
    facilities.filter((f) => facilityBandUnder(f, filters.domains) === band).length;

  /**
   * The Gap control's options — the leaves of whatever branch Domain selected.
   *
   * Grouped by sub-domain rather than listed flat, because the catalogue has
   * four levels and a flat list of 23 throws away two of them: "No national
   * grid connection" and "No functioning backup power" belong together under
   * Power infrastructure, and a reader looking for a power problem should find
   * them in one place. With no domain ticked the list is every facility-level
   * gap; leadership's only appear when its domain is asked for, because they
   * are a state's and select no facility.
   */
  const gapGroups = useMemo<DropdownGroup[]>(() => {
    const offered = gapsForDomains(filters.domains);
    const bySub = new Map<string, typeof offered>();
    for (const gap of offered) {
      const key = `${GAP_DOMAIN_LABEL[gap.domain]} · ${gap.subDomain}`;
      bySub.set(key, [...(bySub.get(key) ?? []), gap]);
    }
    return [...bySub.entries()].map(([label, gaps]) => ({
      label,
      items: gaps.map((gap) => ({
        key: gap.id,
        label: gap.label,
        // How many facilities carry it — the count that says whether ticking it
        // is worth doing. Leadership gaps carry none: they are not a facility's.
        count: facilities.filter((f) => f.gaps?.includes(gap.id)).length,
        // Colour by what the gap does to its domain, not by how common it is:
        // red for a gap that puts the domain in Not ready on its own.
        color: BAND_CSS_COLOR[SEVERITY_BAND[gap.severity]],
      })),
    }));
  }, [filters.domains, facilities]);

  return (
    <div className={cn('flex w-full flex-wrap items-end gap-3', className)}>
      {leading}

      {visible.has('state') && (
        <MultiSelectDropdown
            label="State"
          className="min-w-[8rem] flex-1 sm:flex-none sm:w-[140px]"
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
          className="min-w-[8rem] flex-1 sm:flex-none sm:w-[140px]"
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
          className="min-w-[8rem] flex-1 sm:flex-none sm:w-[140px]"
          groups={[{ label: 'Geopolitical zones', items: options.zones }]}
          selected={filters.zones}
          onChange={filters.setZones}
          placeholder="All zones"
        />
      )}





      {visible.has('level') && (
        <MultiSelectDropdown
            label="Functionality"
          className="min-w-[8rem] flex-1 sm:flex-none sm:w-[140px]"
          groups={[{ label: 'Functionality level', items: options.functionalityLevels }]}
          selected={filters.functionalityLevels}
          onChange={(next) => filters.setFunctionalityLevels(next as FunctionalityLevel[])}
          placeholder="All levels"
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

      {visible.has('domain') && (
        <MultiSelectDropdown
          label="Domain"
          className="min-w-[8rem] flex-1 sm:flex-none sm:w-[156px]"
          groups={[
            {
              label: 'Assessment domains',
              // Counts are gap counts, not facility counts. A domain selects no
              // facility — every one of them is scored in all of these — so the
              // useful number beside a domain is how many distinct things can
              // be wrong inside it.
              items: GAP_DOMAINS.map((d) => ({
                key: d.id,
                label: d.costed ? d.label : `${d.label} · no cost`,
                count: GAPS.filter((g) => g.domain === d.id).length,
              })),
            },
          ]}
          selected={filters.domains}
          onChange={(next) => filters.setDomains(next as FacilityThemeId[])}
          placeholder="All domains"
          panelWidth="w-72"
        />
      )}

      {visible.has('gap') && (
        <MultiSelectDropdown
          label="Gap"
          className="min-w-[8rem] flex-1 sm:flex-none sm:w-[180px]"
          groups={gapGroups}
          selected={filters.gaps}
          onChange={filters.setGaps}
          placeholder={
            filters.domains.length ? `Any gap in ${filters.domains.length} domain(s)` : 'Any gap'
          }
          panelWidth="w-[22rem]"
          searchable
        />
      )}

      {visible.has('archetype') && (
        <MultiSelectDropdown
            label="Readiness"
          className="min-w-[8rem] flex-1 sm:flex-none sm:w-[140px]"
          groups={[
            {
              // Named for the domains in force, the same as Gap — this control
              // and that one are two ways into `archetypes`, and both are read
              // through `facilityBandUnder`.
              label: filters.domains.length ? bandGroupLabel : 'Facility archetype',
              items: (['ready', 'moderately_ready', 'not_ready'] as Band[]).map((band) => ({
                key: band,
                label: BAND_LABEL[band],
                count: bandCount(band),
              })),
            },
          ]}
          selected={filters.archetypes}
          onChange={(next) => filters.setArchetypes(next as Band[])}
          placeholder="All readiness levels"
        />
      )}

      {visible.has('search') && (
        <div className="min-w-[7.5rem] flex-1">
          <label
            htmlFor="facility-search"
            className="mono mb-1 block text-[9.5px] uppercase tracking-[0.11em] text-muted-foreground"
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
          onClick={() => {
            filters.reset();
            scopeReset?.clear();
          }}
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
/**
 * Is this filter already answerable on the page?
 *
 * Not the same question as "is its own control shown", because Gap and
 * Readiness are two controls over one field: a page showing Gap is showing the
 * reader everything they need to change `archetypes`, and a chip reading
 * "Readiness: Not ready" beside it is the row reporting a filter that is
 * visibly on screen.
 */
function covered(key: FilterKey, show: Set<FilterKey>): boolean {
  if (key === 'archetype') return show.has('archetype') || show.has('gap');
  return show.has(key);
}

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
    {
      key: 'gap',
      label: 'Gap',
      values: filters.gaps.map((id) => GAP_BY_ID[id]?.label ?? id),
      clear: () => filters.setGaps([]),
    },
    {
      // Not narrowing anything by itself, but changing what every band on the
      // page means — a Readiness filter reading through Workforce Capacity on a
      // page with no Domain control is the sort of thing this row exists for.
      key: 'domain',
      label: 'Domain',
      values: filters.domains.map((d) => THEME_BY_ID[d].label),
      clear: () => filters.setDomains([]),
    },
  ] satisfies Chip[]).filter((f) => !covered(f.key, show) && f.values.length > 0);

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
