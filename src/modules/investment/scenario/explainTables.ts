import type { ExplainTable } from '@/lib/explain/charts';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import { needGroups, planForTarget, type FacilityPath, type TargetPlan } from '@/lib/scenarios';
import { groupLabel } from './fixes';
import { planSpec } from './planning';
import {
  LETTERS,
  stateId,
  targetLabel,
  type ScenarioSpec,
  type ScenarioView,
} from './scenarioState';

/**
 * The Scenarios section's figures for "Explain this chart", per view — the
 * same plans the views draw, from the same `planSpec` / `planForTarget`, as
 * the strings they print.
 */

const naira = (n: number) => formatNaira(n, true);

function target(spec: ScenarioSpec): string {
  const t = spec.target;
  if (t.kind === 'budget')
    return t.ngn === null ? 'No budget limit' : `Budget of ${targetLabel(t)}`;
  if (t.kind === 'facilities') return `${targetLabel(t)} more facilities Ready`;
  return `${targetLabel(t)} of facilities Ready`;
}

function stateNames(spec: ScenarioSpec, paths: readonly FacilityPath[]): string {
  if (!spec.states.length) return 'All states in view';
  const names = new Map(paths.map((p) => [stateId(p.facility.state), p.facility.state]));
  return spec.states.map((id) => names.get(id) ?? id).join(', ');
}

/** Ready before + Unlocked = Total Ready, spend and cost per facility unlocked. */
function outcome(plan: TargetPlan, total: number): string[] {
  const after = plan.readyBefore + plan.newlyReady;
  return [
    formatCount(total),
    formatCount(plan.readyBefore),
    formatCount(plan.newlyReady),
    `${formatCount(after)} (${formatShare(after, total)})`,
    naira(plan.spendNGN),
    plan.newlyReady ? naira(plan.spendNGN / plan.newlyReady) : '—',
  ];
}
const OUTCOME = [
  'Facilities',
  'Ready before',
  'Unlocked',
  'Total Ready',
  'Spend',
  'Per facility unlocked',
];

function single(paths: readonly FacilityPath[], spec: ScenarioSpec): ExplainTable[] {
  const { plan, paths: scoped } = planSpec(paths, spec);
  const landing = new Map<string, number>();
  for (const p of plan.funded)
    landing.set(p.facility.state, (landing.get(p.facility.state) ?? 0) + 1);
  const chosen = new Set(spec.fixes);
  return [
    {
      title: 'Scenario',
      columns: ['Setting', 'Value'],
      rows: [
        ['Fixes funded', groupLabel(spec.fixes)],
        ['Target', target(spec)],
        ['States', stateNames(spec, paths)],
      ],
    },
    {
      title: 'Result',
      columns: OUTCOME,
      rows: [outcome(plan, scoped.length)],
    },
    {
      title: 'Reach',
      columns: ['Measure', 'Facilities', 'Cost'],
      rows: [
        [
          'Every facility these fixes can make Ready (no budget limit)',
          formatCount(plan.reachable.facilities),
          naira(plan.reachable.costNGN),
        ],
        [
          'Reachable with these fixes but beyond the target',
          formatCount(plan.overBudget.facilities),
          naira(plan.overBudget.costNGN),
        ],
        ...(plan.shortfall
          ? [['Asked for but out of reach of these fixes', formatCount(plan.shortfall), '']]
          : []),
      ],
    },
    {
      title: 'Spending queue: facilities not yet Ready, by the fixes they need, cheapest first',
      columns: ['Needs', 'Facilities', 'Cost each', 'Cost for all', 'All its fixes chosen'],
      rows: needGroups(scoped)
        .slice(0, 16)
        .map((g) => [
          groupLabel(g.needs),
          formatCount(g.facilities),
          naira(g.costEachNGN),
          naira(g.costNGN),
          g.needs.every((n) => chosen.has(n)) ? 'Yes' : 'No',
        ]),
    },
    ...(landing.size
      ? [
          {
            title: 'Where the facilities unlocked are',
            columns: ['State', 'Unlocked'],
            rows: [...landing]
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([state, n]) => [state, formatCount(n)]),
          },
        ]
      : []),
  ];
}

function compare(paths: readonly FacilityPath[], specs: ScenarioSpec[]): ExplainTable[] {
  return [
    {
      title: 'Scenarios side by side',
      columns: ['Scenario', 'Fixes funded', 'Target', 'States', ...OUTCOME.slice(1)],
      rows: specs.map((spec, i) => {
        const { plan, paths: scoped } = planSpec(paths, spec);
        return [
          `${LETTERS[i]} · ${spec.name || 'Scenario'}`,
          groupLabel(spec.fixes),
          target(spec),
          stateNames(spec, paths),
          ...outcome(plan, scoped.length).slice(1),
        ];
      }),
    },
  ];
}

function byState(paths: readonly FacilityPath[], spec: ScenarioSpec): ExplainTable[] {
  const chosen = new Set(spec.fixes);
  const groups = new Map<string, FacilityPath[]>();
  for (const p of paths) groups.set(p.facility.state, [...(groups.get(p.facility.state) ?? []), p]);
  return [
    {
      title: 'Scenario',
      columns: ['Setting', 'Value'],
      rows: [
        ['Fixes funded', groupLabel(spec.fixes)],
        ['Target, applied to each state on its own', target(spec)],
      ],
    },
    {
      title: 'All the states together',
      columns: OUTCOME,
      rows: [outcome(planForTarget(paths, chosen, spec.target), paths.length)],
    },
    {
      title: 'Each state on its own, A to Z',
      columns: ['State', ...OUTCOME],
      rows: [...groups]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([state, list]) => [
          state,
          ...outcome(planForTarget(list, chosen, spec.target), list.length),
        ]),
    },
  ];
}

export function scenarioExplainTables(
  view: ScenarioView,
  paths: readonly FacilityPath[],
  singleSpec: ScenarioSpec,
  compareSpecs: ScenarioSpec[],
): ExplainTable[] | null {
  if (!paths.length) return null;
  if (view === 'compare') return compareSpecs.length ? compare(paths, compareSpecs) : null;
  if (view === 'states') return byState(paths, singleSpec);
  return single(paths, singleSpec);
}
