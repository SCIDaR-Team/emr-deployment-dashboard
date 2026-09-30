/**
 * A small, fixed set of facilities for testing the dashboard's arithmetic.
 *
 * The calculation tests run on these rather than on `public/data`, so a new
 * revision of the workbook — facilities added, prices changed, a fix renamed —
 * never breaks them. Whether the published data agrees with the workbook's own
 * summaries is checked where the data is built instead: `npm run data:check`,
 * which `npm run data:sync` runs.
 *
 * The actions are the catalogue's own, found by what they do rather than by id
 * (an id is derived from the sheet's wording), and their prices are read from
 * the catalogue. So an expected figure is written as `price(ACTION.router) * 3`,
 * never as naira: a price revision moves the figure and the expectation
 * together.
 */

import { ACTIONS, type ActionDef } from '@/lib/gapCatalogue';
import type { Band, FacilitySummary, ScenarioComponentId, ThemeId } from '@/lib/types';

function find(what: string, test: (a: ActionDef) => boolean): ActionDef {
  const found = ACTIONS.find(test);
  if (!found) throw new Error(`The catalogue has no ${what} action`);
  return found;
}

const fix = (scenario: ScenarioComponentId, horizon?: ActionDef['horizon']) =>
  find(`${scenario} fix`, (a) => a.scenario === scenario && (!horizon || a.horizon === horizon));

const TI = 'technical_infrastructure';

/** The actions the sample uses. */
export const ACTION = {
  router: fix('router'),
  fibrex: fix('fibrex'),
  solarTopup: fix('solar_topup'),
  /** Full solar where power is missing: a Major gap, so Not ready. */
  fullSolar: fix('full_solar', 'major'),
  /** Full solar where power is too weak: a Moderate gap. */
  fullSolarModerate: fix('full_solar', 'moderate'),
  networkExtension: fix('network_extension'),
  satellite: fix('satellite'),
  /** Not a fix: wiring work done during deployment. */
  wiring: find('wiring', (a) => a.area === 'wiring' && a.unit === null && !!a.unitCostNGN),
  /** Not a fix: tablets, bought before go-live. */
  tablets: find('tablet', (a) => a.area === 'device_sufficiency' && !!a.unitCostNGN),
  /** Not a fix: a grid connection, after go-live. */
  grid: find('grid connection', (a) => a.domain === TI && a.horizon === 'long_term'),
};

/** An action's unit price. */
export const price = (a: ActionDef) => a.unitCostNGN ?? 0;

/**
 * The readiness rule, written out on its own here so the sample's bands do not
 * come from the code under test: any Major Technical Infrastructure action is
 * Not ready, any Moderate one Moderately ready, neither is Ready.
 */
function bandOf(actions: Record<string, number>): Band {
  const horizons = Object.keys(actions)
    .map((id) => ACTIONS.find((a) => a.id === id)!)
    .filter((a) => a.domain === TI)
    .map((a) => a.horizon);
  if (horizons.includes('major')) return 'not_ready';
  if (horizons.includes('moderate')) return 'moderately_ready';
  return 'ready';
}

const PLACES = {
  Kano: { stateId: 'kano', zone: 'North West' },
  Jigawa: { stateId: 'jigawa', zone: 'North West' },
  Lagos: { stateId: 'lagos', zone: 'South West' },
} as const;

export function facility(
  uuid: string,
  state: keyof typeof PLACES,
  actions: [ActionDef, number][],
  extra: Partial<Pick<FacilitySummary, 'isBHCPF' | 'functionalityLevel'>> = {},
): FacilitySummary {
  const byId = Object.fromEntries(actions.map(([a, qty]) => [a.id, qty]));
  const costByDomain: Record<ThemeId, number> = {
    technical_infrastructure: 0,
    workforce_capacity: 0,
    workflow_transition: 0,
    data_use_reporting: 0,
  };
  for (const [a, qty] of actions) costByDomain[a.domain] += price(a) * qty;
  const costNGN = Object.values(costByDomain).reduce((s, v) => s + v, 0);
  return {
    uuid,
    name: `Facility ${uuid}`,
    state,
    stateId: PLACES[state].stateId,
    lga: `${state} LGA`,
    lgaId: `${PLACES[state].stateId}-lga`,
    zone: PLACES[state].zone,
    lat: null,
    lon: null,
    functionalityLevel: extra.functionalityLevel ?? 'Functional L1',
    isBHCPF: extra.isBHCPF ?? true,
    geography: 'rural',
    deploymentBand: bandOf(byId),
    domainSeverity: {
      technical_infrastructure: 'none',
      workforce_capacity: 'none',
      workflow_transition: 'none',
      data_use_reporting: 'none',
    },
    gaps: [],
    actions: byId,
    gapCount: actions.length,
    costNGN,
    costByDomain,
    unpricedInterventions: 0,
    dailyClientLoad: null,
    mtnBaseStation: null,
    mtnDistanceKm: null,
    mtnServiceability: null,
    mtn4gSignal: null,
    airtelDistanceM: null,
  };
}

const {
  router,
  fibrex,
  solarTopup,
  fullSolar,
  fullSolarModerate,
  networkExtension,
  satellite,
  wiring,
  tablets,
  grid,
} = ACTION;

/**
 * Eleven facilities in three states: two Ready, six Moderately ready, three
 * Not ready — and among them every fix, a facility needing two, and work that
 * is no fix at all (wiring, tablets, a grid connection).
 */
export const SAMPLE: FacilitySummary[] = [
  facility('k1', 'Kano', [[wiring, 1]]),
  facility('k2', 'Kano', [[router, 1]]),
  facility('k3', 'Kano', [
    [router, 1],
    [tablets, 3],
  ]),
  facility('k4', 'Kano', [
    [solarTopup, 1],
    [router, 1],
  ]),
  facility('k5', 'Kano', [
    [fullSolar, 1],
    [router, 1],
  ]),
  facility('j1', 'Jigawa', [[router, 1]]),
  facility('j2', 'Jigawa', [[fibrex, 1]], { functionalityLevel: 'Partially Functional' }),
  facility('j3', 'Jigawa', [[satellite, 1]]),
  facility('l1', 'Lagos', [
    [networkExtension, 1],
    [grid, 1],
  ], { isBHCPF: false, functionalityLevel: 'Functional L2' }),
  facility('l2', 'Lagos', [], { isBHCPF: false, functionalityLevel: 'Functional L2' }),
  facility('l3', 'Lagos', [[fullSolarModerate, 1]]),
];

export const byUuid = (uuid: string) => SAMPLE.find((f) => f.uuid === uuid)!;
