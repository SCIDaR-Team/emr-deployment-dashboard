import { formatCount, formatNaira } from '@/lib/format';
import type { ScenarioTarget, TargetPlan } from '@/lib/scenarios';
import type { ScenarioComponentId } from '@/lib/types';

/**
 * What a scenario is, and how it rides in the page's link.
 *
 * A scenario is a set of fixes, a target (money, a number of facilities, or a
 * share Ready), the states it is limited to (none means every state the page
 * is showing), and a name. The builder's three views share the shape: Single
 * and By state read one scenario, Compare up to four.
 *
 * Kept in the URL so a comparison survives a reload and can be sent to a
 * colleague as a link. The encoding is short and readable rather than opaque —
 * `RS.b250000000.kano.Kano+routers` — so a link in a message says roughly
 * what it holds. Fields are joined by `.` and scenarios by `*`, two of the
 * few characters a query string carries unescaped:
 *
 *   fixes    one letter each: R router, F FibreX, T solar top-up,
 *            S full solar system, N network extension, X satellite
 *   target   b<naira> budget, b alone for no limit; f<count> facilities;
 *            p<percent> share Ready, whole per cent
 *   states   state ids joined by `-`; empty for every state
 *   name     last, so it may hold a `.` of its own; `*` is dropped from it
 */

export type ScenarioView = 'single' | 'compare' | 'states';

export interface ScenarioSpec {
  name: string;
  fixes: ScenarioComponentId[];
  target: ScenarioTarget;
  /** State ids. Empty means every state in the page's scope. */
  states: string[];
}

export const MAX_COMPARE = 4;
export const LETTERS = ['A', 'B', 'C', 'D'] as const;

const CODE: Record<ScenarioComponentId, string> = {
  router: 'R',
  fibrex: 'F',
  solar_topup: 'T',
  full_solar: 'S',
  network_extension: 'N',
  satellite: 'X',
};
const FROM_CODE = Object.fromEntries(
  Object.entries(CODE).map(([id, c]) => [c, id as ScenarioComponentId]),
);

export const DEFAULT_SINGLE: ScenarioSpec = {
  name: 'Scenario',
  fixes: ['router'],
  target: { kind: 'budget', ngn: null },
  states: [],
};

/** A fresh comparison: three different ways into the same question. */
export const DEFAULT_COMPARE: ScenarioSpec[] = [
  {
    name: 'Routers',
    fixes: ['router'],
    target: { kind: 'budget', ngn: null },
    states: [],
  },
  {
    name: 'Power + routers',
    fixes: ['solar_topup', 'full_solar', 'router'],
    target: { kind: 'budget', ngn: 1_000_000_000 },
    states: [],
  },
  {
    name: 'Half the facilities',
    fixes: ['router', 'fibrex', 'solar_topup', 'full_solar', 'network_extension', 'satellite'],
    target: { kind: 'share', pct: 50 },
    states: [],
  },
];

export function encodeSpec(s: ScenarioSpec): string {
  const fixes = s.fixes.map((f) => CODE[f]).join('');
  const t = s.target;
  const target =
    t.kind === 'budget'
      ? `b${t.ngn === null ? '' : Math.round(t.ngn)}`
      : t.kind === 'facilities'
        ? `f${t.n}`
        : `p${t.pct}`;
  return [fixes, target, s.states.join('-'), s.name.replace(/\*/g, '')].join('.');
}

/** Read a scenario back, dropping anything it does not recognise rather than
 *  failing — a hand-edited link should still open. */
export function decodeSpec(raw: string, knownStates: ReadonlySet<string>): ScenarioSpec | null {
  const [fixes = '', target = '', states = '', ...rest] = raw.split('.');
  const name = rest.join('.').trim();
  const ids = [...new Set([...fixes].map((c) => FROM_CODE[c]).filter(Boolean))];
  let t: ScenarioTarget = { kind: 'budget', ngn: null };
  const m = target.match(/^([bfp])(\d*)$/);
  if (m) {
    const n = m[2] ? Number(m[2]) : null;
    if (m[1] === 'b') t = { kind: 'budget', ngn: n };
    else if (m[1] === 'f' && n !== null) t = { kind: 'facilities', n };
    else if (m[1] === 'p' && n !== null) t = { kind: 'share', pct: Math.min(100, n) };
  }
  return {
    name: (name || 'Scenario').slice(0, 40),
    fixes: ids as ScenarioComponentId[],
    target: t,
    states: states ? states.split('-').filter((s) => knownStates.has(s)) : [],
  };
}

export function targetLabel(t: ScenarioTarget): string {
  if (t.kind === 'budget') return t.ngn === null ? 'No limit' : formatNaira(t.ngn, true);
  if (t.kind === 'facilities') return formatCount(t.n);
  return `${t.pct}%`;
}

/** Switch a target to another kind, keeping the plan where it is: a budget
 *  becomes the facilities it buys, a count becomes its cost, and so on. */
export function convertTarget(
  kind: ScenarioTarget['kind'],
  plan: TargetPlan,
  total: number,
): ScenarioTarget {
  if (kind === 'budget') return { kind, ngn: Math.round(plan.spendNGN / 1e6) * 1e6 || null };
  if (kind === 'facilities') return { kind, n: plan.newlyReady };
  return {
    kind,
    pct: total ? Math.round(((plan.readyBefore + plan.newlyReady) / total) * 100) : 0,
  };
}

/** A state's id in a link: its name, lower-cased, words joined by `_`. */
export function stateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_|_$/g, '');
}
