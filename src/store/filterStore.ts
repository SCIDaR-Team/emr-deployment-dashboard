/**
 * Global filter state.
 *
 * Filters restrict the facility population *before* aggregation, so every
 * number on screen — KPI tiles, map fills, explorer cells, ranked tables —
 * must reflect them. See useFilteredData.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Band,
  FacilityThemeId,
  FilterState,
  FunctionalityLevel,
  ThemeId,
} from '@/lib/types';

interface FilterActions {
  setStates: (states: string[]) => void;
  setLGAs: (lgas: string[]) => void;
  setZones: (zones: string[]) => void;
  setGeography: (values: ('rural' | 'urban')[]) => void;
  setFunding: (values: ('BHCPF' | 'non-BHCPF')[]) => void;
  setFunctionalityLevels: (levels: FunctionalityLevel[]) => void;
  setArchetypes: (bands: Band[]) => void;
  setBandForTheme: (theme: ThemeId, bands: Band[]) => void;
  /** Move the Gap question to another domain, carrying the chosen bands with
   *  it — the reader asked "which facilities have this gap", and changing the
   *  domain re-asks that question rather than starting over. */
  setDomain: (domain: FacilityThemeId | 'overall') => void;
  /** The bands Gap is currently selecting, whichever domain it is pointed at. */
  gapBands: () => Band[];
  setGapBands: (bands: Band[]) => void;
  setSearch: (search: string) => void;
  /** Apply a partial state wholesale — used once, by useFilterUrlSync. */
  hydrate: (patch: Partial<FilterState>) => void;
  reset: () => void;
  /** True when anything is narrowing the population — drives the "filters
   *  active" badge, without which a filtered figure reads as a national one. */
  isActive: () => boolean;
}

const initialState: FilterState = {
  states: [],
  lgas: [],
  zones: [],
  geography: [],
  funding: [],
  functionalityLevels: [],
  archetypes: [],
  bandByTheme: {},
  domain: 'overall',
  search: '',
};

export const useFilterStore = create<FilterState & FilterActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStates: (states) => set({ states, lgas: [] }), // LGA choices depend on state
      setLGAs: (lgas) => set({ lgas }),
      setZones: (zones) => set({ zones }),
      setGeography: (geography) => set({ geography }),
      setFunding: (funding) => set({ funding }),
      setFunctionalityLevels: (functionalityLevels) => set({ functionalityLevels }),
      setArchetypes: (archetypes) => set({ archetypes }),
      setBandForTheme: (theme, bands) =>
        set((s) => ({ bandByTheme: { ...s.bandByTheme, [theme]: bands } })),
      setDomain: (domain) =>
        set((s) => {
          const carried = s.domain === 'overall' ? s.archetypes : (s.bandByTheme[s.domain] ?? []);
          return {
            domain,
            archetypes: domain === 'overall' ? carried : [],
            bandByTheme: domain === 'overall' ? {} : { [domain]: carried },
          };
        }),

      gapBands: () => {
        const s = get();
        return s.domain === 'overall' ? s.archetypes : (s.bandByTheme[s.domain] ?? []);
      },

      setGapBands: (bands) =>
        set((s) =>
          s.domain === 'overall'
            ? { archetypes: bands, bandByTheme: {} }
            : { archetypes: [], bandByTheme: { [s.domain]: bands } },
        ),

      setSearch: (search) => set({ search }),

      // A shared link must land the recipient on the sender's view, so the URL
      // replaces the persisted state rather than merging into it — otherwise the
      // recipient's own last-session filters would silently narrow it further.
      hydrate: (patch) => set({ ...initialState, ...patch }),

      reset: () => set(initialState),

      isActive: () => {
        const s = get();
        return (
          s.states.length > 0 ||
          s.lgas.length > 0 ||
          s.zones.length > 0 ||
          s.geography.length > 0 ||
          s.funding.length > 0 ||
          s.functionalityLevels.length > 0 ||
          s.archetypes.length > 0 ||
          Object.values(s.bandByTheme).some((b) => b && b.length > 0) ||
          s.search.trim() !== ''
        );
      },
    }),
    { name: 'emr-filters', version: 1 },
  ),
);
