import { BAND_LABEL, MATURITY_LABEL, MATURITY_NO_DATA, PHASE_LABEL } from '../../src/lib/bands';
import { readinessCostBy, readinessTotals, type BreakdownId } from '../../src/lib/costByReadiness';
import { formatNaira, formatShare } from '../../src/lib/format';
import {
  ACTION_BY_ID,
  GAP_AREAS,
  GAP_AREA_BY_ID,
  GAP_BY_ID,
  GAP_DOMAIN_LABEL,
  HORIZON_LABEL,
} from '../../src/lib/gapCatalogue';
import {
  facilityPaths,
  planComposition,
  planForTarget,
  type ScenarioTarget,
} from '../../src/lib/scenarios';
import type {
  AreaProfile,
  Band,
  FacilitySummary,
  FunctionalityLevel,
  Horizon,
  ScenarioComponentId,
} from '../../src/lib/types';
import { encodeSpec, stateId } from '../../src/modules/investment/scenario/scenarioState';
import { findState, type DashboardData } from './data';

/**
 * The assistant's tools: every figure it gives comes from one of these.
 *
 * Each is a JSON-schema definition the model sees and a function over the
 * dashboard's data. They reuse the pages' own arithmetic — the scenario
 * engine, the readiness cost split, the catalogue's prices — so an answer and
 * the page it links to cannot disagree. Results are small and pre-formatted
 * (a naira figure comes with its compact form) so the model quotes rather than
 * computes, and each carries `links` into the page that shows it.
 *
 * Schemas are strict: every property is required, optional ones are nullable.
 */

// ---------------------------------------------------------------------------
// Shared vocabularies
// ---------------------------------------------------------------------------

const BANDS: Band[] = ['ready', 'moderately_ready', 'not_ready'];
const FIXES: ScenarioComponentId[] = [
  'router',
  'fibrex',
  'solar_topup',
  'full_solar',
  'network_extension',
  'satellite',
];
const FIX_LABEL: Record<ScenarioComponentId, string> = {
  router: 'Router',
  fibrex: 'FibreX',
  solar_topup: 'Solar top-up',
  full_solar: 'Full solar system',
  network_extension: 'Network extension',
  satellite: 'Satellite',
};
const HORIZONS: Horizon[] = ['major', 'moderate', 'minor', 'long_term'];
const LEVELS: FunctionalityLevel[] = ['Functional L1', 'Functional L2', 'Partially Functional'];
const naira = (n: number) => formatNaira(n, true);

// ---------------------------------------------------------------------------
// Links into the dashboard
// ---------------------------------------------------------------------------

export interface ToolLink {
  label: string;
  href: string;
}

function href(path: string, params: Record<string, string | undefined> = {}, hash?: string) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const q = p.toString();
  return `${path}${q ? `?${q}` : ''}${hash ? `#${hash}` : ''}`;
}

// ---------------------------------------------------------------------------
// Tool plumbing
// ---------------------------------------------------------------------------

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (data: DashboardData, args: Record<string, unknown>) => unknown;
}

/** A tool the model called with arguments that do not fit; returned to it as
 *  the tool's result so it can correct itself. */
export class ToolInputError extends Error {}

const nullable = (schema: Record<string, unknown>) => ({
  ...schema,
  type: [schema.type as string, 'null'],
});
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const STATE_ARG = nullable({
  type: 'string',
  description: 'A state name, e.g. "Kano". Null for all 12 assessed states.',
});

function scopeFacilities(
  data: DashboardData,
  state: unknown,
): {
  name: string;
  area: AreaProfile;
  facilities: FacilitySummary[];
  filter?: string;
} {
  if (state === null || state === undefined || state === '') {
    return { name: 'All 12 assessed states', area: data.national, facilities: data.facilities };
  }
  const s = findState(data, String(state));
  if (!s) throw new ToolInputError(`No state called "${String(state)}".`);
  const facilities = data.facilitiesByState.get(s.name) ?? [];
  return { name: s.name, area: s, facilities, filter: s.name };
}

function bandCounts(facilities: readonly FacilitySummary[]) {
  const counts: Record<Band, number> = { ready: 0, moderately_ready: 0, not_ready: 0 };
  for (const f of facilities) if (f.deploymentBand) counts[f.deploymentBand] += 1;
  const total = facilities.length;
  return Object.fromEntries(
    BANDS.map((b) => [
      b,
      { label: BAND_LABEL[b], facilities: counts[b], share: formatShare(counts[b], total) },
    ]),
  );
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

const getOverview: ToolDef = {
  name: 'get_overview',
  description:
    'Headline figures for the 12 assessed states together, or one state: facilities by readiness band, the investment plan (total, by readiness band, by phase), how many facilities each power/connectivity fix would unblock, and — for any of the 37 states — its State Maturity band and leadership scores. Use first for any "how is X doing" or "tell me about X" question.',
  parameters: obj({ state: STATE_ARG }),
  run(data, { state }) {
    const scope = scopeFacilities(data, state);
    if (scope.filter && !scope.facilities.length) {
      return {
        scope: scope.name,
        assessed: false,
        note: 'This state was not in the facility assessment; only its State Maturity is known.',
        maturity: maturityOf(scope.area),
        links: [
          {
            label: `${scope.name} on National Coverage`,
            href: href('/states', { state: scope.name }),
          },
        ],
      };
    }
    const totals = readinessTotals(scope.facilities);
    const comp = planComposition(scope.facilities);
    const paths = facilityPaths(scope.facilities);
    const blockedBy = Object.fromEntries(FIXES.map((f) => [FIX_LABEL[f], 0]));
    for (const p of paths)
      for (const n of p.needs) blockedBy[FIX_LABEL[n]] = (blockedBy[FIX_LABEL[n]] ?? 0) + 1;
    return {
      scope: scope.name,
      assessed: true,
      facilities: scope.facilities.length,
      readiness: bandCounts(scope.facilities),
      plan: {
        total: naira(comp.totalNGN),
        totalNGN: comp.totalNGN,
        byReadiness: Object.fromEntries(
          BANDS.map((b) => [
            BAND_LABEL[b],
            {
              cost: naira(totals.cost[b]),
              perFacility: totals.facilities[b]
                ? naira(totals.cost[b] / totals.facilities[b])
                : null,
            },
          ]),
        ),
        byPhase: {
          [PHASE_LABEL.before]: naira(comp.readinessFixesNGN + comp.otherBeforeNGN),
          [PHASE_LABEL.during]: naira(comp.duringNGN),
          [PHASE_LABEL.after]: naira(comp.afterNGN),
        },
        readinessFixes: {
          cost: naira(comp.readinessFixesNGN),
          note: "The power and connectivity fixes — the only part of the plan that changes a facility's readiness band.",
        },
      },
      facilitiesWaitingOnEachFix: blockedBy,
      maturity: scope.filter ? maturityOf(scope.area) : undefined,
      links: [
        { label: 'Assessed States', href: href('/assessment', { state: scope.filter }) },
        { label: 'Investment Plan', href: href('/investment', { state: scope.filter }) },
      ] satisfies ToolLink[],
    };
  },
};

function maturityOf(area: AreaProfile) {
  const c = area.coverage;
  const leadership = c?.leadership
    ? Object.fromEntries(
        Object.entries(c.leadership).map(([k, v]) => [
          k.replace(/_/g, ' '),
          v ? MATURITY_LABEL[v as Band] : MATURITY_NO_DATA,
        ]),
      )
    : null;
  return {
    band: c?.band ? MATURITY_LABEL[c.band] : MATURITY_NO_DATA,
    leadership,
    electricityAccessPct: c?.measures?.electricityAccessPct ?? null,
    internetSubscriptionPct: c?.measures?.internetSubscriptionPct ?? null,
  };
}

const METRICS = [
  'facilities',
  'ready_count',
  'ready_share',
  'not_ready_count',
  'not_ready_share',
  'plan_cost',
  'cost_per_facility',
  'maturity',
] as const;

const compareStates: ToolDef = {
  name: 'compare_states',
  description:
    'Rank states on one measure. Facility and cost measures cover the 12 assessed states; "maturity" covers all 37 states in the State Maturity assessment. Optionally limited to one geopolitical zone.',
  parameters: obj({
    metric: { type: 'string', enum: [...METRICS] },
    zone: nullable({
      type: 'string',
      description: 'A geopolitical zone, e.g. "North West". Null for all.',
    }),
  }),
  run(data, { metric, zone }) {
    if (!METRICS.includes(metric as (typeof METRICS)[number])) {
      throw new ToolInputError(`Unknown metric "${String(metric)}".`);
    }
    const inZone = (s: AreaProfile) =>
      !zone || (s.zone ?? '').toLowerCase() === String(zone).toLowerCase();
    if (metric === 'maturity') {
      const order: Record<string, number> = { ready: 0, moderately_ready: 1, not_ready: 2 };
      const rows = data.states
        .filter(inZone)
        .map((s) => ({
          state: s.name,
          zone: s.zone,
          maturity: maturityOf(s).band,
          band: s.coverage?.band ?? null,
        }))
        .sort(
          (a, b) =>
            (order[a.band ?? ''] ?? 3) - (order[b.band ?? ''] ?? 3) ||
            a.state.localeCompare(b.state),
        )
        .map(({ band: _band, ...r }) => r);
      return { metric, rows, links: [{ label: 'National Coverage', href: '/states' }] };
    }
    const rows = data.states
      .filter((s) => inZone(s) && (data.facilitiesByState.get(s.name)?.length ?? 0) > 0)
      .map((s) => {
        const fs = data.facilitiesByState.get(s.name) ?? [];
        const t = readinessTotals(fs);
        const n = fs.length;
        const value = (() => {
          switch (metric) {
            case 'facilities':
              return n;
            case 'ready_count':
              return t.facilities.ready;
            case 'ready_share':
              return n ? t.facilities.ready / n : 0;
            case 'not_ready_count':
              return t.facilities.not_ready;
            case 'not_ready_share':
              return n ? t.facilities.not_ready / n : 0;
            case 'plan_cost':
              return t.total;
            default:
              return n ? t.total / n : 0;
          }
        })();
        const shown =
          metric === 'plan_cost' || metric === 'cost_per_facility'
            ? naira(value)
            : String(metric).endsWith('share')
              ? `${Math.round(value * 100)}%`
              : value;
        return { state: s.name, zone: s.zone, value: shown, raw: value };
      })
      .sort((a, b) => b.raw - a.raw)
      .map(({ raw: _raw, ...r }) => r);
    return { metric, rows, links: [{ label: 'Assessed States', href: '/assessment' }] };
  },
};

const findFacilities: ToolDef = {
  name: 'find_facilities',
  description:
    'Count and list assessed facilities matching filters. Returns the total that match and up to `limit` of them with their LGA, readiness band, plan cost and the power/connectivity fixes they wait on. No coordinates.',
  parameters: obj({
    state: STATE_ARG,
    lga: nullable({ type: 'string', description: 'An LGA name within the state.' }),
    band: nullable({ type: 'string', enum: [...BANDS, null] }),
    gap_area: nullable({
      type: 'string',
      enum: [...GAP_AREAS.map((a) => a.id), null],
      description: 'Only facilities with a recorded gap in this area.',
    }),
    waiting_on_fix: nullable({
      type: 'string',
      enum: [...FIXES, null],
      description: 'Only facilities that need this power/connectivity fix to become Ready.',
    }),
    functionality_level: nullable({ type: 'string', enum: [...LEVELS, null] }),
    bhcpf: nullable({
      type: 'boolean',
      description: 'True for BHCPF facilities only, false for non-BHCPF.',
    }),
    sort: { type: 'string', enum: ['cost_desc', 'cost_asc', 'name'] },
    limit: { type: 'integer', minimum: 1, maximum: 25 },
  }),
  run(data, args) {
    const scope = scopeFacilities(data, args.state);
    const paths = new Map(facilityPaths(scope.facilities).map((p) => [p.facility.uuid, p]));
    const lga = args.lga ? String(args.lga).toLowerCase() : null;
    let rows = scope.facilities.filter((f) => {
      if (lga && f.lga.toLowerCase() !== lga) return false;
      if (args.band && f.deploymentBand !== args.band) return false;
      if (args.functionality_level && f.functionalityLevel !== args.functionality_level)
        return false;
      if (typeof args.bhcpf === 'boolean' && f.isBHCPF !== args.bhcpf) return false;
      if (
        args.gap_area &&
        !f.gaps.some((g) => GAP_BY_ID[g]?.area === args.gap_area && GAP_BY_ID[g]?.recorded)
      ) {
        return false;
      }
      if (
        args.waiting_on_fix &&
        !paths.get(f.uuid)?.needs.includes(args.waiting_on_fix as ScenarioComponentId)
      ) {
        return false;
      }
      return true;
    });
    if (lga && !rows.length && !scope.facilities.some((f) => f.lga.toLowerCase() === lga)) {
      throw new ToolInputError(`No LGA called "${String(args.lga)}" in ${scope.name}.`);
    }
    const total = rows.length;
    const cost = rows.reduce((s, f) => s + f.costNGN, 0);
    rows = [...rows].sort((a, b) =>
      args.sort === 'name'
        ? a.name.localeCompare(b.name)
        : args.sort === 'cost_asc'
          ? a.costNGN - b.costNGN
          : b.costNGN - a.costNGN,
    );
    const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
    return {
      scope: scope.name,
      matching: total,
      planCostOfMatching: naira(cost),
      shown: Math.min(limit, total),
      facilities: rows.slice(0, limit).map((f) => ({
        name: f.name,
        lga: f.lga,
        state: f.state,
        band: f.deploymentBand ? BAND_LABEL[f.deploymentBand] : null,
        functionality: f.functionalityLevel,
        bhcpf: f.isBHCPF,
        planCost: naira(f.costNGN),
        waitingOn: (paths.get(f.uuid)?.needs ?? []).map((n) => FIX_LABEL[n]),
      })),
      links: [
        {
          label: 'Assessed States',
          href: href('/assessment', {
            state: scope.filter,
            lga: args.lga ? String(args.lga) : undefined,
          }),
        },
      ],
    };
  },
};

const getFacility: ToolDef = {
  name: 'get_facility',
  description:
    'One assessed facility in detail: readiness band, severity by domain, recorded gaps and the costed actions that close them. Matches on part of the name; returns candidates when more than one facility matches.',
  parameters: obj({ name: { type: 'string' }, state: STATE_ARG }),
  run(data, { name, state }) {
    const scope = scopeFacilities(data, state);
    const q = String(name).trim().toLowerCase();
    if (q.length < 3) throw new ToolInputError('Give at least three letters of the facility name.');
    const matches = scope.facilities.filter((f) => f.name.toLowerCase().includes(q));
    const exact = matches.filter((f) => f.name.toLowerCase() === q);
    const hits = exact.length ? exact : matches;
    if (!hits.length)
      return { found: 0, note: `No facility name contains "${String(name)}" in ${scope.name}.` };
    if (hits.length > 1) {
      return {
        found: hits.length,
        candidates: hits.slice(0, 12).map((f) => ({ name: f.name, lga: f.lga, state: f.state })),
        note: 'Several facilities match; ask which one, or narrow by state.',
      };
    }
    const f = hits[0]!;
    const path = facilityPaths([f])[0]!;
    return {
      found: 1,
      name: f.name,
      state: f.state,
      lga: f.lga,
      zone: f.zone,
      functionality: f.functionalityLevel,
      bhcpf: f.isBHCPF,
      geography: f.geography,
      dailyClientLoad: f.dailyClientLoad,
      band: f.deploymentBand ? BAND_LABEL[f.deploymentBand] : null,
      severityByDomain: Object.fromEntries(
        Object.entries(f.domainSeverity).map(([d, v]) => [
          GAP_DOMAIN_LABEL[d as keyof typeof GAP_DOMAIN_LABEL] ?? d,
          v,
        ]),
      ),
      gaps: f.gaps
        .map((g) => GAP_BY_ID[g])
        .filter((g) => g?.recorded)
        .map((g) => ({
          area: GAP_AREA_BY_ID[g!.area]?.label ?? g!.area,
          condition: g!.label,
          severity: g!.severity,
        })),
      actions: Object.entries(f.actions).map(([id, qty]) => {
        const a = ACTION_BY_ID[id];
        return {
          action: a?.label ?? id,
          urgency: a ? HORIZON_LABEL[a.horizon] : null,
          quantity: qty,
          cost: a?.unitCostNGN === null || !a ? 'unpriced' : naira(a.unitCostNGN * qty),
        };
      }),
      planCost: naira(f.costNGN),
      toBecomeReady: path.needs.length
        ? `Needs ${path.needs.map((n) => FIX_LABEL[n]).join(' + ')} (${naira(path.costNGN)})`
        : f.deploymentBand === 'ready'
          ? 'Already Ready'
          : 'No power or connectivity fix recorded',
      links: [
        {
          label: `${f.state} on Assessed States`,
          href: href('/assessment', { state: f.state, lga: f.lga }),
        },
      ],
    };
  },
};

const BREAKDOWNS = [
  'category',
  'facility_group',
  'functionality',
  'zone',
  'state',
  'urgency',
  'phase',
  'domain',
] as const;

const costBreakdown: ToolDef = {
  name: 'cost_breakdown',
  description:
    'Split the investment plan by one dimension — cost category, BHCPF vs non-BHCPF, functionality level, zone, state, urgency (Major/Moderate/Minor/Long-term), phase (before/during/after deployment) or domain — with each row split by the readiness of the facilities it is spent on.',
  parameters: obj({ by: { type: 'string', enum: [...BREAKDOWNS] }, state: STATE_ARG }),
  run(data, { by, state }) {
    const scope = scopeFacilities(data, state);
    const fmtRow = (label: string, cost: Record<Band, number>, total: number) => ({
      label,
      total: naira(total),
      ...Object.fromEntries(BANDS.map((b) => [BAND_LABEL[b], naira(cost[b])])),
    });
    if (by === 'urgency' || by === 'phase' || by === 'domain') {
      const rows = new Map<string, { cost: Record<Band, number>; total: number }>();
      for (const f of scope.facilities) {
        const band = f.deploymentBand;
        if (!band) continue;
        for (const [id, qty] of Object.entries(f.actions)) {
          const a = ACTION_BY_ID[id];
          if (!a || a.unitCostNGN === null) continue;
          const key =
            by === 'urgency'
              ? HORIZON_LABEL[a.horizon]
              : by === 'phase'
                ? PHASE_LABEL[a.phase]
                : GAP_DOMAIN_LABEL[a.domain];
          const r = rows.get(key) ?? {
            cost: { ready: 0, moderately_ready: 0, not_ready: 0 },
            total: 0,
          };
          r.cost[band] += a.unitCostNGN * qty;
          r.total += a.unitCostNGN * qty;
          rows.set(key, r);
        }
      }
      return {
        scope: scope.name,
        by,
        rows: [...rows]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([k, r]) => fmtRow(k, r.cost, r.total)),
        links: [
          {
            label: 'Investment Plan',
            href: href('/investment', { state: scope.filter }, 'interventions'),
          },
        ],
      };
    }
    if (!BREAKDOWNS.includes(by as (typeof BREAKDOWNS)[number])) {
      throw new ToolInputError(`Unknown breakdown "${String(by)}".`);
    }
    const id: BreakdownId = by === 'facility_group' ? 'group' : (by as BreakdownId);
    return {
      scope: scope.name,
      by,
      rows: readinessCostBy(scope.facilities, id).map((r) => fmtRow(r.label, r.cost, r.total)),
      links: [
        {
          label: 'Where the money goes',
          href: href('/investment', { state: scope.filter }, 'cost-by-readiness'),
        },
      ],
    };
  },
};

const listInterventions: ToolDef = {
  name: 'list_interventions',
  description:
    'The costed intervention lines of the plan — what is bought, how many facilities need it, quantity, unit cost and total — largest first, optionally by urgency or phase.',
  parameters: obj({
    state: STATE_ARG,
    urgency: nullable({ type: 'string', enum: [...HORIZONS, null] }),
    phase: nullable({ type: 'string', enum: ['before', 'during', 'after', null] }),
    limit: { type: 'integer', minimum: 1, maximum: 30 },
  }),
  run(data, { state, urgency, phase, limit }) {
    const scope = scopeFacilities(data, state);
    const lines = (scope.area.investments ?? [])
      .filter((i) => (!urgency || i.horizon === urgency) && (!phase || i.phase === phase))
      .sort((a, b) => (b.totalCostNGN ?? -1) - (a.totalCostNGN ?? -1));
    const n = Math.min(30, Math.max(1, Number(limit) || 10));
    return {
      scope: scope.name,
      lines: lines.length,
      total: naira(lines.reduce((s, i) => s + (i.totalCostNGN ?? 0), 0)),
      shown: lines.slice(0, n).map((i) => ({
        action: i.label,
        domain: GAP_DOMAIN_LABEL[i.themeId] ?? i.themeId,
        urgency: HORIZON_LABEL[i.horizon],
        phase: PHASE_LABEL[i.phase],
        facilities: i.facilityCount,
        quantity: i.unit ? `${i.quantity} ${i.unit}` : i.quantity,
        unitCost: i.unitCostNGN === null ? 'unpriced' : naira(i.unitCostNGN),
        total: i.totalCostNGN === null ? 'unpriced' : naira(i.totalCostNGN),
      })),
      links: [
        {
          label: 'Costed interventions',
          href: href('/investment', { state: scope.filter }, 'interventions'),
        },
      ],
    };
  },
};

const FIXES_ARG = {
  type: 'array',
  items: { type: 'string', enum: FIXES },
  minItems: 1,
  description: 'The power and connectivity fixes to fund. All six unless the question names some.',
};
const TARGET_ARGS = {
  target_kind: {
    type: 'string',
    enum: ['budget', 'facilities', 'share'],
    description:
      'budget: spend up to target_value naira (null for no limit). facilities: make target_value MORE facilities Ready. share: reach target_value percent of facilities Ready, counting those Ready already.',
  },
  target_value: nullable({
    type: 'number',
    description: 'Naira, a count, or a percent. Null only for an unlimited budget.',
  }),
};

function parseScenario(args: Record<string, unknown>): {
  fixes: ScenarioComponentId[];
  target: ScenarioTarget;
} {
  const fixes = (Array.isArray(args.fixes) ? args.fixes : []).filter(
    (f): f is ScenarioComponentId => FIXES.includes(f as ScenarioComponentId),
  );
  if (!fixes.length) throw new ToolInputError('Choose at least one fix.');
  const v =
    args.target_value === null || args.target_value === undefined
      ? null
      : Number(args.target_value);
  if (v !== null && (!Number.isFinite(v) || v < 0))
    throw new ToolInputError('target_value must be a positive number.');
  const target: ScenarioTarget =
    args.target_kind === 'facilities'
      ? { kind: 'facilities', n: Math.round(v ?? 0) }
      : args.target_kind === 'share'
        ? { kind: 'share', pct: Math.min(100, Math.round(v ?? 0)) }
        : { kind: 'budget', ngn: v === null ? null : Math.round(v) };
  return { fixes, target };
}

function summarisePlan(plan: ReturnType<typeof planForTarget>, total: number) {
  return {
    readyBefore: plan.readyBefore,
    unlocked: plan.newlyReady,
    totalReady: plan.readyBefore + plan.newlyReady,
    totalReadyShare: formatShare(plan.readyBefore + plan.newlyReady, total),
    spend: naira(plan.spendNGN),
    perFacilityUnlocked: plan.newlyReady ? naira(plan.spendNGN / plan.newlyReady) : null,
    shortfall: plan.shortfall || undefined,
    reachableWithTheseFixes: plan.reachable.facilities,
  };
}

/**
 * How a plan's money is spent, so an answer can go past the totals: per fix,
 * the facilities it goes to and its cost (these add up to the spend; a
 * facility needing two fixes counts under both), and the order the money
 * reaches facilities — grouped by the fixes they need, cheapest first, as the
 * Scenarios section's spending queue shows it.
 */
function spendBreakdown(plan: ReturnType<typeof planForTarget>) {
  const order = new Map<string, { fixes: string; facilities: number; eachNGN: number }>();
  for (const p of plan.funded) {
    const g = order.get(p.groupKey) ?? {
      fixes: p.needs.map((f) => FIX_LABEL[f]).join(' + '),
      facilities: 0,
      eachNGN: p.costNGN,
    };
    g.facilities += 1;
    order.set(p.groupKey, g);
  }
  const budget = plan.target.kind === 'budget' ? plan.target.ngn : null;
  return {
    spentOnEachFix: FIXES.filter((f) => plan.bought[f].facilities).map((f) => ({
      fix: FIX_LABEL[f],
      facilities: plan.bought[f].facilities,
      cost: naira(plan.bought[f].costNGN),
    })),
    spendingOrder: [...order.values()].map((g) => ({
      fixesNeeded: g.fixes,
      facilities: g.facilities,
      costEach: naira(g.eachNGN),
      cost: naira(g.eachNGN * g.facilities),
    })),
    budgetLeftOver: budget === null ? undefined : naira(budget - plan.spendNGN),
  };
}

const runScenario: ToolDef = {
  name: 'run_scenario',
  description:
    'Fund power and connectivity fixes toward a target and see what it unlocks: Ready before, Unlocked, Total Ready, spend and cost per facility, and how the money is spent — per fix and in the order it reaches facilities. Money goes to the cheapest facilities to make Ready first. Optionally limited to some states.',
  parameters: obj({
    fixes: FIXES_ARG,
    ...TARGET_ARGS,
    states: nullable({
      type: 'array',
      items: { type: 'string' },
      description: 'Limit to these states. Null for all 12.',
    }),
  }),
  run(data, args) {
    const { fixes, target } = parseScenario(args);
    const names = Array.isArray(args.states) ? args.states.map(String) : [];
    const states = names.map((n) => {
      const s = findState(data, n);
      if (!s || !data.facilitiesByState.get(s.name)?.length)
        throw new ToolInputError(`"${n}" is not an assessed state.`);
      return s.name;
    });
    const facilities = states.length
      ? data.facilities.filter((f) => states.includes(f.state))
      : data.facilities;
    const plan = planForTarget(facilityPaths(facilities), new Set(fixes), target);
    const byState = new Map<string, number>();
    for (const p of plan.funded)
      byState.set(p.facility.state, (byState.get(p.facility.state) ?? 0) + 1);
    const spec = { name: 'Asked', fixes, target, states: states.map(stateId) };
    return {
      scope: states.length ? states.join(', ') : 'All 12 assessed states',
      fixes: fixes.map((f) => FIX_LABEL[f]),
      ...summarisePlan(plan, facilities.length),
      ...spendBreakdown(plan),
      unlockedByState: Object.fromEntries([...byState].sort((a, b) => b[1] - a[1])),
      links: [
        {
          label: 'Open this scenario',
          href: href('/investment', { sv: 'single', ss: encodeSpec(spec) }, 'scenarios'),
        },
      ],
    };
  },
};

const rankStates: ToolDef = {
  name: 'rank_states_for_scenario',
  description:
    'Run the same scenario in each assessed state on its own and rank them — e.g. "with ₦20m in one state, which unlocks the most?" Each state says what the money buys per fix; the top three also give the order it is spent in. Also gives the same target spread across all states for comparison.',
  parameters: obj({ fixes: FIXES_ARG, ...TARGET_ARGS }),
  run(data, args) {
    const { fixes, target } = parseScenario(args);
    const allowed = new Set(fixes);
    const rows = [...data.facilitiesByState]
      .map(([state, fs]) => {
        const plan = planForTarget(facilityPaths(fs), allowed, target);
        return { state, facilities: fs.length, ...summarisePlan(plan, fs.length), raw: plan };
      })
      .sort((a, b) =>
        target.kind === 'budget'
          ? b.unlocked - a.unlocked || a.raw.spendNGN - b.raw.spendNGN
          : Number(!!a.shortfall) - Number(!!b.shortfall) || a.raw.spendNGN - b.raw.spendNGN,
      )
      // What the money buys in every state; the order it is spent in only for
      // the top three, which are the ones an answer goes into.
      .map(({ raw, ...r }, i) => {
        const { spentOnEachFix, spendingOrder, budgetLeftOver } = spendBreakdown(raw);
        return { ...r, spentOnEachFix, ...(i < 3 ? { spendingOrder, budgetLeftOver } : {}) };
      });
    const all = planForTarget(facilityPaths(data.facilities), allowed, target);
    const spec = { name: 'Asked', fixes, target, states: [] };
    return {
      fixes: fixes.map((f) => FIX_LABEL[f]),
      rankedBy: target.kind === 'budget' ? 'most unlocked' : 'least spend to reach the target',
      states: rows,
      spreadAcrossAllStates: summarisePlan(all, data.facilities.length),
      links: [
        {
          label: 'Open By state',
          href: href('/investment', { sv: 'states', ss: encodeSpec(spec) }, 'scenarios'),
        },
      ],
    };
  },
};

export const TOOLS: ToolDef[] = [
  getOverview,
  compareStates,
  findFacilities,
  getFacility,
  costBreakdown,
  listInterventions,
  runScenario,
  rankStates,
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Run a tool by name on parsed arguments, turning bad input into a result the
 *  model can read and correct from rather than an exception. */
export function runTool(data: DashboardData, name: string, args: Record<string, unknown>): unknown {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { error: `No tool called "${name}".` };
  try {
    return tool.run(data, args);
  } catch (e) {
    if (e instanceof ToolInputError) return { error: e.message };
    throw e;
  }
}
