/**
 * The facility point dataset, and getting it onto the map.
 *
 * Split from `FacilityLayer.tsx` for the reason `mapTypes.ts` and
 * `coordinates.ts` are split from their components: a module that exports both
 * components and plain functions loses fast refresh. The types live here too,
 * so a caller that only needs the shape does not pull in the renderer.
 */

import { gx, gy } from '@/lib/mapProjection';
import type { Band } from '@/lib/types';

export interface FacilityPoint {
  uuid: string;
  name: string;
  /** Null where the survey recorded no position — see `projectFacilities`. */
  lat: number | null;
  lon: number | null;
  band: Band | null;
  score?: number | null;
  /**
   * Where the facility is, administratively.
   *
   * Optional on the type but not optional in practice above LGA level: a marker
   * on the national map carries a name and nothing else to say which of the
   * twelve surveyed states it belongs to, and "Sumaila Basic Health Clinic 9"
   * is not an answer to that.
   */
  state?: string;
  lga?: string;
  /** Free-text status line — functionality level, on this page. */
  status?: string;
}

/** A facility that *has* a fix, so `lat`/`lon` are known non-null here. */
export interface PlottedFacility extends FacilityPoint {
  lat: number;
  lon: number;
  x: number;
  y: number;
}

/**
 * Project a facility list into viewBox units, once.
 *
 * Drops anything without a usable fix. A facility with no coordinate is not a
 * facility that is nowhere — it is one the survey did not record a position
 * for, and it belongs in the pane's list rather than plotted at the origin of
 * the map, which is in the Gulf of Guinea.
 */
export function projectFacilities(facilities: FacilityPoint[]): PlottedFacility[] {
  const plotted: PlottedFacility[] = [];
  for (const f of facilities) {
    const { lat, lon } = f;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    plotted.push({ ...f, lat: lat as number, lon: lon as number, x: gx(lon as number), y: gy(lat as number) });
  }
  return plotted;
}
