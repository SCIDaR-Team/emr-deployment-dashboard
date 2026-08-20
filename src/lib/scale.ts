/**
 * Choropleth data builders shared by the map surfaces.
 *
 * Split out of the map components for the same reason `dataContext.ts` is split
 * out of `DataProvider.tsx`: Vite's Fast Refresh cannot preserve state across an
 * edit to a file that mixes components with other exports.
 *
 * Two encodings, and the choice between them is editorial rather than
 * technical — pick the one that matches the sentence the card is making:
 *
 *   buildBandMap    categorical. Each polygon fills from its own readiness
 *                   band. Says *what* a state is.
 *   buildShareMap   sequential. Each polygon fills from the share of its
 *                   facilities that are Not ready, on a five-step ramp fitted
 *                   to the states on screen. Says *how much* of a state is
 *                   still unready — which varies even where the band does not.
 */

import { stepFor } from '@/components/map/mapTypes';
import type { GeoDatum } from '@/components/map/mapTypes';
import { BAND_LABEL } from './bands';
import { formatCount } from './format';
import type { AreaProfile } from './types';

/**
 * State readiness band per state, keyed by state id.
 *
 * Ships **no** `step`, so each polygon fills from its band. Pair with
 * `BandLegend`, never `ScaleLegend`: there is no domain to print.
 */
export function buildBandMap(states: AreaProfile[]): Record<string, GeoDatum> {
  const data: Record<string, GeoDatum> = {};
  for (const s of states) {
    data[s.id] = {
      band: s.band,
      n: s.facilityCount,
      evidenceGrade: s.evidenceGrade,
      label: s.name,
      valueLabel: s.band
        ? s.facilityCount
          ? `${BAND_LABEL[s.band]} — ${formatCount(s.facilityCount)} facilities assessed`
          : `${BAND_LABEL[s.band]} — desk review, no facility survey`
        : undefined,
    };
  }
  return data;
}

/**
 * Share not ready per state, as a sequential ramp fitted to the assessed
 * states rather than to 0–100.
 *
 * Fitted because over a fixed 0–100 domain most of the twelve fall in one step,
 * which throws the variation away. The legend prints the fitted bounds, so
 * nothing is hidden by the fit.
 */
export function buildShareMap(states: AreaProfile[]) {
  const shares = new Map<string, number>();
  for (const s of states) {
    if (s.evidenceGrade !== 'primary' || !s.facilityCount) continue;
    shares.set(s.id, ((s.archetypeDistribution.not_ready ?? 0) / s.facilityCount) * 100);
  }
  const values = [...shares.values()];
  const lo = values.length ? Math.floor(Math.min(...values)) : 0;
  const hi = values.length ? Math.ceil(Math.max(...values)) : 100;

  const data: Record<string, GeoDatum> = {};
  for (const s of states) {
    const share = shares.get(s.id) ?? null;
    data[s.id] = {
      band: s.band,
      n: s.facilityCount,
      evidenceGrade: s.evidenceGrade,
      label: s.name,
      step: stepFor(share, lo, hi),
      valueLabel:
        share != null
          ? `${share.toFixed(1)}% not ready (${formatCount(
              s.archetypeDistribution.not_ready,
            )} of ${formatCount(s.facilityCount)})`
          : undefined,
    };
  }
  return { data, lo, hi };
}
