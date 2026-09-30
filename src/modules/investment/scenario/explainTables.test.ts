import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSnapshot } from '@/lib/explain/charts';
import { formatCount, formatShare } from '@/lib/format';
import { facilityPaths, planScenario } from '@/lib/scenarios';
import type { FacilitySummary } from '@/lib/types';
import { scenarioExplainTables } from './explainTables';
import { DEFAULT_COMPARE, DEFAULT_SINGLE, type ScenarioView } from './scenarioState';

const raw = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/data/facilities-summary.json'), 'utf8'),
) as FacilitySummary[] | { facilities: FacilitySummary[] };
const facilities = Array.isArray(raw) ? raw : raw.facilities;
const paths = facilityPaths(facilities);

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
    // The default is routers alone, with no budget limit, nationally.
    const plan = planScenario(paths, new Set(['router'] as const), null);
    const total = plan.readyBefore + plan.newlyReady;
    expect(result!.rows[0]!.slice(1, 4)).toEqual([
      formatCount(plan.readyBefore),
      formatCount(plan.newlyReady),
      `${formatCount(total)} (${formatShare(total, paths.length)})`,
    ]);
  });

  it('lists the states A to Z in the by-state view', () => {
    const tables = scenarioExplainTables('states', paths, DEFAULT_SINGLE, [])!;
    const names = tables[2]!.rows.map((r) => r[0]!);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toHaveLength(new Set(facilities.map((f) => f.state)).size);
  });
});
