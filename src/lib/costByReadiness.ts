/**
 * Where the plan's money goes, by the readiness of the facilities it is spent
 * on — the workbook's Cost summary, computed from the facilities in scope.
 *
 * Every naira belongs to one facility, and every facility is Ready, Moderately
 * ready or Not ready, so the plan splits cleanly three ways. The split answers
 * a question the itemised schedule cannot: how much of the money is going to
 * facilities that could deploy today, and how much to the ones that need their
 * foundations built first.
 *
 * Each figure is the facility's own actions, in its own quantities, priced at
 * the catalogue's unit costs — the same arithmetic as every other total on the
 * page, and checked against the workbook's own table in `costByReadiness.test`.
 */

import { ACTION_BY_ID } from './gapCatalogue';
import type { Band, FacilitySummary } from './types';

/**
 * The workbook's broad cost categories, as groups of gap areas.
 *
 * Only the Technical Infrastructure ones carry money; the categories under
 * the other three domains all total ₦0 and are left out rather than listed as
 * a column of zeroes. Data backup is kept because it is an infrastructure
 * category the workbook names — it totals ₦0 too, and says so.
 */
export const COST_CATEGORIES = [
  {
    id: 'power_wiring',
    label: 'Power and wiring',
    areas: ['power', 'wiring', 'backup_power'],
  },
  {
    id: 'connectivity',
    label: 'Connectivity and resilience',
    areas: ['facility_connectivity', 'backup_connectivity', 'mobile_network_feasibility'],
  },
  {
    id: 'devices',
    label: 'Devices and maintenance',
    areas: ['device_sufficiency', 'device_maintenance'],
  },
  {
    id: 'service_points',
    label: 'Service-point furniture',
    areas: ['physical_service_point'],
  },
  { id: 'data_backup', label: 'Data backup', areas: ['data_backup'] },
] as const;

export type BreakdownId = 'category' | 'group' | 'functionality' | 'zone' | 'state';

export const BREAKDOWNS: { id: BreakdownId; label: string }[] = [
  { id: 'category', label: 'Category' },
  { id: 'group', label: 'Facility group' },
  { id: 'functionality', label: 'Functionality' },
  { id: 'zone', label: 'Zone' },
  { id: 'state', label: 'State' },
];

export interface ReadinessCostRow {
  id: string;
  label: string;
  cost: Record<Band, number>;
  total: number;
}

const emptyCost = (): Record<Band, number> => ({ ready: 0, moderately_ready: 0, not_ready: 0 });

const CATEGORY_OF_AREA = new Map<string, string>(
  COST_CATEGORIES.flatMap((c) => c.areas.map((a) => [a, c.id] as [string, string])),
);

/** What each of a facility's actions costs, with the area it closes. */
function actionCosts(f: FacilitySummary): { area: string; cost: number }[] {
  const out: { area: string; cost: number }[] = [];
  for (const [id, qty] of Object.entries(f.actions)) {
    const action = ACTION_BY_ID[id];
    if (!action || action.unitCostNGN === null) continue;
    out.push({ area: action.area, cost: action.unitCostNGN * qty });
  }
  return out;
}

/** The plan split three ways, with the facilities in each group. */
export function readinessTotals(facilities: readonly FacilitySummary[]): {
  cost: Record<Band, number>;
  facilities: Record<Band, number>;
  total: number;
} {
  const cost = emptyCost();
  const count = emptyCost();
  for (const f of facilities) {
    if (!f.deploymentBand) continue;
    count[f.deploymentBand] += 1;
    cost[f.deploymentBand] += f.costNGN;
  }
  return { cost, facilities: count, total: cost.ready + cost.moderately_ready + cost.not_ready };
}

/**
 * The split, one row per group of a breakdown.
 *
 * Facility breakdowns put each facility's whole cost in its row. The category
 * breakdown works per action instead, because one facility's money spans
 * several categories. Rows are ordered by total, largest first, except the
 * categories, which keep the workbook's own order.
 */
export function readinessCostBy(
  facilities: readonly FacilitySummary[],
  breakdown: BreakdownId,
): ReadinessCostRow[] {
  const rows = new Map<string, ReadinessCostRow>();
  const row = (id: string, label: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { id, label, cost: emptyCost(), total: 0 };
      rows.set(id, r);
    }
    return r;
  };

  for (const f of facilities) {
    const band = f.deploymentBand;
    if (!band) continue;

    if (breakdown === 'category') {
      for (const { area, cost } of actionCosts(f)) {
        const id = CATEGORY_OF_AREA.get(area);
        if (!id) continue;
        const r = row(id, COST_CATEGORIES.find((c) => c.id === id)!.label);
        r.cost[band] += cost;
        r.total += cost;
      }
      continue;
    }

    const key =
      breakdown === 'group'
        ? f.isBHCPF
          ? 'BHCPF'
          : 'Non-BHCPF'
        : breakdown === 'functionality'
          ? f.functionalityLevel
          : breakdown === 'zone'
            ? f.zone
            : f.state;
    const r = row(key, key);
    r.cost[band] += f.costNGN;
    r.total += f.costNGN;
  }

  if (breakdown === 'category') {
    return COST_CATEGORIES.map(
      (c) => rows.get(c.id) ?? { id: c.id, label: c.label, cost: emptyCost(), total: 0 },
    );
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}
