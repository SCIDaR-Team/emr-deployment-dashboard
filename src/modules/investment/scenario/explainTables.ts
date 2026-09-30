import type { ExplainTable } from '@/lib/explain/charts';
import { formatCount, formatNaira, formatShare } from '@/lib/format';
import { needGroups, planForTarget, type FacilityPath, type TargetPlan } from '@/lib/scenarios';
import { FIXES, groupLabel } from './fixes';
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

/** Ready before + Unlocked = Total Ready, spend and the average per facility unlocked. */
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
  'Average per facility unlocked',
];

function single(paths: readonly FacilityPath[], spec: ScenarioSpec): ExplainTable[] {
  const { plan, paths: scoped } = planSpec(paths, spec);
  const landing = new Map<string, number>();
  for (const p of plan.funded)
    landing.set(p.facility.state, (landing.get(p.facility.state) ?? 0) + 1);
  const chosen = new Set(spec.fixes);
  // How many of each need group the money reaches — the queue lists every
  // facility waiting, and without this a reader (or a model) takes the whole
  // queue for what is bought.
  const fundedByGroup = new Map<string, number>();
  for (const p of plan.funded) fundedByGroup.set(p.groupKey, (fundedByGroup.get(p.groupKey) ?? 0) + 1);
  const bought = FIXES.filter((f) => plan.bought[f.id].facilities);
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
    ...(bought.length
      ? [
          {
            title: 'How the money is spent, per fix',
            columns: ['Fix', 'Facilities it goes to', 'Cost'],
            rows: bought.map((f) => [
              f.label,
              formatCount(plan.bought[f.id].facilities),
              naira(plan.bought[f.id].costNGN),
            ]),
          },
        ]
      : []),
    {
      title: 'Spending queue: every facility not yet Ready, by the fixes it needs, cheapest first',
      columns: ['Needs', 'In the group', 'Funded by this scenario', 'Cost each', 'All its fixes chosen'],
      rows: needGroups(scoped)
        .slice(0, 16)
        .map((g) => [
          groupLabel(g.needs),
          formatCount(g.facilities),
          formatCount(fundedByGroup.get(g.key) ?? 0),
          naira(g.costEachNGN),
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
      title: `${specs.length} ${specs.length === 1 ? 'scenario' : 'scenarios'} side by side`,
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

/**
 * The highest and lowest state on each measure, worked out here rather than
 * left to the model: picking extremes out of twelve rows, it named the wrong
 * state — Lagos the fewest unlocked at 142 when Rivers is at 126. Ties go by
 * the figure as the reader sees it (two states at ₦170.2m are tied, whatever
 * the naira behind them), and a measure every state shares says so.
 */
function extremes(rows: { state: string; plan: TargetPlan; facilities: number }[]): ExplainTable {
  const measures: [string, (r: (typeof rows)[number]) => number, (r: (typeof rows)[number]) => string][] = [
    ['Unlocked', (r) => r.plan.newlyReady, (r) => formatCount(r.plan.newlyReady)],
    ['Ready before', (r) => r.plan.readyBefore, (r) => formatCount(r.plan.readyBefore)],
    [
      'Share Ready after',
      (r) => (r.plan.readyBefore + r.plan.newlyReady) / Math.max(1, r.facilities),
      (r) => formatShare(r.plan.readyBefore + r.plan.newlyReady, r.facilities),
    ],
    ['Spend', (r) => r.plan.spendNGN, (r) => naira(r.plan.spendNGN)],
    [
      'Average per facility unlocked',
      (r) => (r.plan.newlyReady ? r.plan.spendNGN / r.plan.newlyReady : NaN),
      (r) => (r.plan.newlyReady ? naira(r.plan.spendNGN / r.plan.newlyReady) : '—'),
    ],
  ];
  const pick = (value: (r: (typeof rows)[number]) => number, show: (r: (typeof rows)[number]) => string, dir: 1 | -1) => {
    const valid = rows.filter((r) => Number.isFinite(value(r)));
    if (!valid.length) return '—';
    if (new Set(valid.map(show)).size === 1) return `All states (${show(valid[0]!)})`;
    const best = valid.reduce((a, r) => (dir * value(r) > dir * value(a) ? r : a));
    const at = valid.filter((r) => show(r) === show(best));
    return `${at.map((r) => r.state).join(', ')} (${show(best)})`;
  };
  return {
    title: 'Highest and lowest state on each measure (ties named together)',
    columns: ['Measure', 'Highest', 'Lowest'],
    rows: measures.map(([name, value, show]) => [name, pick(value, show, 1), pick(value, show, -1)]),
  };
}

function byState(paths: readonly FacilityPath[], spec: ScenarioSpec): ExplainTable[] {
  const chosen = new Set(spec.fixes);
  const groups = new Map<string, FacilityPath[]>();
  for (const p of paths) groups.set(p.facility.state, [...(groups.get(p.facility.state) ?? []), p]);
  const perState = [...groups]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([state, list]) => ({
      state,
      facilities: list.length,
      plan: planForTarget(list, chosen, spec.target),
    }));
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
      rows: perState.map((r) => [r.state, ...outcome(r.plan, r.facilities)]),
    },
    extremes(perState),
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
