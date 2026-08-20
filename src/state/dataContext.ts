/**
 * The data context and its hook, split out from DataProvider.tsx.
 *
 * Kept in a separate module purely so the provider file exports a component and
 * nothing else — Vite's Fast Refresh cannot preserve state across an edit to a
 * file that mixes components with other exports.
 */

import { createContext, useContext } from 'react';
import type { FetchState } from '@/hooks/useFetchJSON';
import type { AreaProfile, FacilitySummary, SnapshotMeta } from '@/lib/types';

export interface DataContextValue {
  facilities: FetchState<FacilitySummary[]>;
  states: FetchState<AreaProfile[]>;
  lgas: FetchState<AreaProfile[]>;
  national: FetchState<AreaProfile | null>;
  snapshot: FetchState<SnapshotMeta | null>;
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error('useDataContext must be called inside <DataProvider>');
  }
  return ctx;
}
