import {
  BatteryCharging,
  Cable,
  RadioTower,
  Router,
  Satellite,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { ACTIONS } from '@/lib/gapCatalogue';
import type { ScenarioComponentId } from '@/lib/types';

/**
 * The six fixes a scenario can fund, as the builder presents them.
 *
 * The unit cost is read from the catalogue — the price of the action the fix
 * is — so it cannot drift from the costs the plan is summed from. The blurb is
 * ours: a line saying which facilities the fix is for.
 */
export interface FixDef {
  id: ScenarioComponentId;
  label: string;
  short: string;
  blurb: string;
  group: 'power' | 'connectivity';
  icon: LucideIcon;
  unitCostNGN: number;
}

const unitCost = (id: ScenarioComponentId) =>
  ACTIONS.find((a) => a.scenario === id)?.unitCostNGN ?? 0;

export const FIXES: FixDef[] = [
  {
    id: 'full_solar',
    label: 'Full solar system',
    short: 'Full solar',
    blurb: 'Panels and batteries where power is absent or short',
    group: 'power',
    icon: Sun,
    unitCostNGN: unitCost('full_solar'),
  },
  {
    id: 'solar_topup',
    label: 'Solar top-up',
    short: 'Top-up',
    blurb: 'More panels or batteries to reach nine hours',
    group: 'power',
    icon: BatteryCharging,
    unitCostNGN: unitCost('solar_topup'),
  },
  {
    id: 'router',
    label: 'Router',
    short: 'Router',
    blurb: 'A facility-managed router or MiFi, 5 Mbps and up',
    group: 'connectivity',
    icon: Router,
    unitCostNGN: unitCost('router'),
  },
  {
    id: 'fibrex',
    label: 'FibreX',
    short: 'FibreX',
    blurb: 'Upgrade a slow facility-managed connection',
    group: 'connectivity',
    icon: Cable,
    unitCostNGN: unitCost('fibrex'),
  },
  {
    id: 'network_extension',
    label: 'Network extension',
    short: 'Network ext.',
    blurb: 'The provider extends coverage to the site',
    group: 'connectivity',
    icon: RadioTower,
    unitCostNGN: unitCost('network_extension'),
  },
  {
    id: 'satellite',
    label: 'Satellite',
    short: 'Satellite',
    blurb: 'Satellite internet where no network reaches',
    group: 'connectivity',
    icon: Satellite,
    unitCostNGN: unitCost('satellite'),
  },
];

export const FIX_BY_ID = Object.fromEntries(FIXES.map((f) => [f.id, f])) as Record<
  ScenarioComponentId,
  FixDef
>;

/** "Full solar + Router" — a need group, or a preset, in the tiles' words. */
export function groupLabel(ids: readonly ScenarioComponentId[]): string {
  return ids.map((id) => FIX_BY_ID[id].short).join(' + ') || 'nothing';
}

/** One-click starting points: the workbook's headline packages, and the ends. */
export const PRESETS: { label: string; fixes: ScenarioComponentId[] }[] = [
  { label: 'Router only', fixes: ['router'] },
  { label: 'Top-up + Router', fixes: ['solar_topup', 'router'] },
  { label: 'Full solar + Router', fixes: ['full_solar', 'router'] },
  { label: 'Every fix', fixes: FIXES.map((f) => f.id) },
];
