/**
 * DataProvider — fetches each dataset once and shares it via context.
 *
 * Without it, every card that needs facilities triggers its own request on
 * mount.
 *
 * Four datasets, all fetched up front and none route-scoped. That is a
 * deliberate simplification over the sibling assessment dashboard, which had to
 * lazily scope a 6.7 MB explorer cube away from its landing route: nothing here
 * is anywhere near that weight. The facility summary is the largest at roughly
 * 400 kB, every page under the shell reads it, and it backs the filter bar's
 * option counts on all three — so scoping it would trade a marginally faster
 * landing page for a stall on the first navigation that actually matters.
 */

import { type ReactNode } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DataContext } from './dataContext';
import { DATA_PATHS } from '@/lib/constants';
import type { AreaProfile, FacilitySummary, SnapshotMeta } from '@/lib/types';

export function DataProvider({ children }: { children: ReactNode }) {
  const facilities = useFetchJSON<FacilitySummary[]>({
    path: DATA_PATHS.facilitiesSummary,
    fallback: [],
  });
  const states = useFetchJSON<AreaProfile[]>({
    path: DATA_PATHS.states,
    fallback: [],
  });
  const lgas = useFetchJSON<AreaProfile[]>({
    path: DATA_PATHS.lgas,
    fallback: [],
  });
  const national = useFetchJSON<AreaProfile | null>({
    path: DATA_PATHS.national,
    fallback: null,
  });
  const snapshot = useFetchJSON<SnapshotMeta | null>({
    path: DATA_PATHS.snapshot,
    fallback: null,
  });

  return (
    <DataContext.Provider value={{ facilities, states, lgas, national, snapshot }}>
      {children}
    </DataContext.Provider>
  );
}
