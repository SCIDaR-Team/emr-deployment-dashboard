/**
 * Combine several AreaProfiles (states) into one.
 *
 * Needed wherever a page lets a reader narrow to an arbitrary *subset* of
 * states — not just "all" (the precomputed national profile) or "exactly one"
 * (a single precomputed state profile), both of which already exist in
 * `states.json`/`national.json`. Selecting two states, or filtering by a
 * readiness band that several states happen to share, lands in between —
 * without this, that combination silently falls back to the full national
 * figures, which reads as the filter doing nothing.
 *
 * Everything here is a **sum or a count**, never a mean. Bands do not average:
 * the combined band comes from the pooled facility counts via `dominantBand`,
 * which is the same rule the data layer used to band each state in the first
 * place, so a subset and a precomputed profile agree by construction.
 */

import { BANDS, dominantBand } from './bands';
import type { AreaProfile, Band, InvestmentItem } from './types';

function sumInvestments(profiles: AreaProfile[]): InvestmentItem[] {
  const byId = new Map<string, InvestmentItem>();
  for (const p of profiles) {
    for (const item of p.investments) {
      const existing = byId.get(item.id);
      if (existing) {
        existing.quantity += item.quantity;
        existing.facilityCount += item.facilityCount;
        if (existing.totalCostNGN != null && item.totalCostNGN != null) {
          existing.totalCostNGN += item.totalCostNGN;
        }
      } else {
        byId.set(item.id, { ...item });
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.quantity - a.quantity);
}

/**
 * A partial AreaProfile — enough for every panel that reads one. Not a real
 * geography, so no `id`/`level`/`parentId`/`evidenceGrade`: callers that need
 * those already have the individual profiles this was built from.
 */
export interface AggregatedProfile {
  facilityCount: number;
  /** The overall reading, pooled across the profiles. */
  deploymentBand: Band | null;
  deploymentDistribution: Record<Band, number>;
  investments: InvestmentItem[];
}

/** Pool one distribution across profiles. A sum, like everything else here. */
function pooledDistribution(
  profiles: AreaProfile[],
  key: 'deploymentDistribution',
): Record<Band, number> {
  const dist: Record<Band, number> = { ready: 0, moderately_ready: 0, not_ready: 0 };
  for (const p of profiles) {
    for (const band of BANDS) dist[band] += p[key][band] ?? 0;
  }
  return dist;
}

export function aggregateAreaProfiles(profiles: AreaProfile[]): AggregatedProfile {
  const facilityCount = profiles.reduce((sum, p) => sum + p.facilityCount, 0);

  const deploymentDistribution = pooledDistribution(profiles, 'deploymentDistribution');

  return {
    facilityCount,
    deploymentBand: dominantBand(deploymentDistribution),
    deploymentDistribution,
    investments: sumInvestments(profiles),
  };
}
