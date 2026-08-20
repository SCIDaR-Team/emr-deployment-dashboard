/**
 * The contract every data source satisfies.
 *
 * The UI depends only on this interface, never on the JSON paths directly. The
 * assessment is complete and the dataset fixed, so `StaticDataSource` (reading
 * precomputed JSON) is all that is needed today — but keeping the seam means an
 * `ApiDataSource` can be dropped in behind an env var if a live feed or backend
 * ever arrives, with no component changes.
 *
 * All methods are async so components handle static and network sources
 * identically.
 */

import type { AreaProfile, FacilitySummary, SnapshotMeta } from '@/lib/types';

export interface DataSource {
  readonly meta: { mode: 'static' | 'api'; label: string };

  getFacilitySummaries(): Promise<FacilitySummary[]>;

  getStates(): Promise<AreaProfile[]>;
  getLGAs(stateId?: string): Promise<AreaProfile[]>;
  getNational(): Promise<AreaProfile | null>;

  /** Provenance: when the dataset was generated. */
  getSnapshotMeta(): Promise<SnapshotMeta | null>;
}
