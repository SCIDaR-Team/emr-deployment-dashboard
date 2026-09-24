import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSnapshot } from '@/lib/explain/charts';
import { facilityPaths } from '@/lib/scenarios';
import type { FacilitySummary } from '@/lib/types';
import { scenarioExplainTables } from './explainTables';
import { DEFAULT_COMPARE, DEFAULT_SINGLE, type ScenarioView } from './scenarioState';

const raw = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/data/facilities-summary.json'), 'utf8'),
) as FacilitySummary[] | { facilities: FacilitySummary[] };
const paths = facilityPaths(Array.isArray(raw) ? raw : raw.facilities);

describe('scenarioExplainTables', () => {
  it.each<ScenarioView>(['single', 'compare', 'states'])(
    'gives the %s view figures the endpoint accepts',
    (view) => {
      const tables = scenarioExplainTables(view, paths, DEFAULT_SINGLE, DEFAULT_COMPARE)!;
      const parsed = parseSnapshot({
        chart: `scenario-${view}`,
        title: 'Scenarios',
        scope: ['Area: All 12 assessed states'],
        tables,
      });
      expect(parsed).not.toHaveProperty('error');
    },
  );

  it('reads Ready before + Unlocked = Total Ready as the section does', () => {
    const [, result] = scenarioExplainTables('single', paths, DEFAULT_SINGLE, [])!;
    // Routers alone, no budget limit: 170 Ready before, 1,125 unlocked nationally.
    expect(result!.rows[0]!.slice(1, 4)).toEqual(['170', '1,125', '1,295 (46%)']);
  });

  it('lists the states A to Z in the by-state view', () => {
    const tables = scenarioExplainTables('states', paths, DEFAULT_SINGLE, [])!;
    const names = tables[2]!.rows.map((r) => r[0]!);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toHaveLength(12);
  });
});
