import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AreaProfile, FacilitySummary } from '../../src/lib/types';

/**
 * The dashboard's own published data, as the assistant reads it.
 *
 * The same JSON the pages load from `public/data`, so every figure the
 * assistant gives is one a reader can find on a page. Loaded once per server
 * instance and indexed for the tools.
 *
 * What never leaves this module for the model: facility coordinates and the
 * assessors' free-text notes. The tools return names, places, bands, gaps and
 * costs — enough to answer questions about the plan — and nothing that pins a
 * facility to a map point or quotes a field report. Until there is a data
 * policy for sending facility data to a model provider, that is the line.
 */

export interface DashboardData {
  facilities: FacilitySummary[];
  /** All 37 states — 12 assessed, the rest National Coverage only. */
  states: AreaProfile[];
  national: AreaProfile;
  /** Lower-cased state name or id → the state. */
  stateByKey: Map<string, AreaProfile>;
  /** Assessed state name → its facilities. */
  facilitiesByState: Map<string, FacilitySummary[]>;
}

const FILES = {
  facilities: 'facilities-summary.json',
  states: 'states.json',
  national: 'national.json',
} as const;

export async function loadDashboardData(dir: string): Promise<DashboardData> {
  const read = async <T>(name: string): Promise<T> =>
    JSON.parse(await readFile(join(dir, name), 'utf8')) as T;
  const [facilitiesRaw, states, national] = await Promise.all([
    read<FacilitySummary[] | { facilities: FacilitySummary[] }>(FILES.facilities),
    read<AreaProfile[]>(FILES.states),
    read<AreaProfile>(FILES.national),
  ]);
  const facilities = Array.isArray(facilitiesRaw) ? facilitiesRaw : facilitiesRaw.facilities;
  return indexData(facilities, states, national);
}

export function indexData(
  facilities: FacilitySummary[],
  states: AreaProfile[],
  national: AreaProfile,
): DashboardData {
  const stateByKey = new Map<string, AreaProfile>();
  for (const s of states) {
    stateByKey.set(s.name.toLowerCase(), s);
    stateByKey.set(s.id.toLowerCase(), s);
  }
  // Common ways of writing the two states whose names people vary.
  const alias = (from: string, to: string) => {
    const s = stateByKey.get(to);
    if (s) stateByKey.set(from, s);
  };
  alias('federal capital territory', 'fct');
  alias('abuja', 'fct');
  alias('akwa-ibom', 'akwa ibom');
  alias('akwaibom', 'akwa ibom');

  const facilitiesByState = new Map<string, FacilitySummary[]>();
  for (const f of facilities) {
    const list = facilitiesByState.get(f.state) ?? [];
    list.push(f);
    facilitiesByState.set(f.state, list);
  }
  return { facilities, states, national, stateByKey, facilitiesByState };
}

/** A state by name or id, forgiving case and the usual spellings. */
export function findState(data: DashboardData, name: string): AreaProfile | undefined {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/\s+state$/, '');
  return data.stateByKey.get(key) ?? data.stateByKey.get(key.replace(/[-_]/g, ' '));
}
