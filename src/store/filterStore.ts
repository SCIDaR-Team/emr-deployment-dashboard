/**
 * Global filter state.
 *
 * Filters restrict the facility population *before* aggregation, so every
 * number on screen — KPI tiles, map fills, explorer cells, ranked tables —
 * must reflect them. See useFilteredData.
 */

import { create } from 'zustand';
import { GAP_AREA_BY_ID } from '@/lib/gapCatalogue';
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
  /** Point every readiness reading at another set of domains. The chosen bands
   *  stay put: the reader asked "which facilities are not ready", and changing
   *  the domains re-asks that question rather than starting over. */
  setDomains: (domains: FacilityThemeId[]) => void;
  setGapAreas: (areas: string[]) => void;
  setSearch: (search: string) => void;
  /** Apply a partial state wholesale — used once, by useFilterUrlSync. */
  hydrate: (patch: Partial<FilterState>) => void;
  reset: () => void;
  /** True when anything is narrowing the population — drives the "filters
   *  active" badge, without which a filtered figure reads as a national one. */
  isActive: () => boolean;
  /** True when anything is off its default, narrowing or not. Reset's
   *  question; see the implementation for why it is not `isActive`'s. */
  isDirty: () => boolean;
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
  domains: [],
  gapAreas: [],
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
      // Nothing to move: `archetypes` holds the band selection whatever the
      // domains are, because `facilityBandUnder` reads the band *through* them.
      // Domain and Readiness are one filter with two controls.
      // Ticked gap areas that the new domain selection no longer offers are
      // dropped rather than kept invisibly: a filter the reader cannot see,
      // cannot clear, and did not knowingly set is the worst kind. Narrowing
      // only — widening the domains keeps every tick, because none of them has
      // gone out of scope.
      setDomains: (domains) =>
        set((s) => ({
          domains,
          gapAreas: domains.length
            ? s.gapAreas.filter((id) =>
                domains.includes(GAP_AREA_BY_ID[id]?.domain as FacilityThemeId),
              )
            : s.gapAreas,
        })),

      setGapAreas: (gapAreas) => set({ gapAreas }),

      setSearch: (search) => set({ search }),

      // A shared link must land the recipient on the sender's view, so the URL
      // replaces the persisted state rather than merging into it — otherwise the
      // recipient's own last-session filters would silently narrow it further.
      hydrate: (patch) => set({ ...initialState, ...patch }),

      reset: () => set(initialState),

      /**
       * Reset's question: has the reader moved anything at all?
       *
       * Wider than `isActive`, and deliberately a second predicate rather than
       * a clause added to it. Domain narrows nothing on its own — with no Gap
       * bands chosen, Workforce Capacity counts the same facilities Overall
       * does — so folding it into `isActive` would put "Filtered — 2,825 of
       * 2,825" over a page that is filtering nothing, which is the one thing
       * the scope note exists to prevent.
       *
       * But the reader still moved a control, and Reset is the way back. With
       * it hidden the only route to `overall` is finding the dropdown again and
       * remembering which entry was the default — and a URL carrying
       * `?domain=workforce_capacity` hands someone that state with no way out
       * of it on screen.
       */
      isDirty: () => {
        const s = get();
        return s.isActive() || s.domains.length > 0;
      },

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
          s.gapAreas.length > 0 ||
          Object.values(s.bandByTheme).some((b) => b && b.length > 0) ||
          s.search.trim() !== ''
        );
      },
    }),
    {
      name: 'emr-filters',
      version: 3,
      // v3 replaced `gaps` — a flat list of the 73 conditions — with
      // `gapAreas`, the twenty areas above them. A v2 payload holds condition
      // ids, and mapping them up to their areas would silently widen the
      // reader's saved filter: three ticked power conditions would come back as
      // "any power gap", which selects 1,248 facilities where they had 571.
      //
      // v2 itself replaced the single `domain` with the `domains` array and
      // moved the Gap bands into `archetypes`, and a v1 payload was not
      // convertible either. So the migration stays what it was: drop it.
      // Spelled out rather than left to the default, which logs the discard as
      // an error in the console of every reader who had used a filter before
      // today.
      migrate: () => initialState,
    },
  ),
);
