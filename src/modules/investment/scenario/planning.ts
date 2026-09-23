import { useMemo } from 'react';
import {
  planForTarget,
  type FacilityPath,
  type ScenarioTarget,
  type TargetPlan,
} from '@/lib/scenarios';
import type { ScenarioComponentId } from '@/lib/types';
import { FIXES } from './fixes';
import { stateId, type ScenarioSpec } from './scenarioState';

/** Every fix — the grey curve behind the chosen one. */
export const ALL_FIXES: ReadonlySet<ScenarioComponentId> = new Set(FIXES.map((f) => f.id));

/** The facilities a scenario covers: its states, or all of them. */
export function scopedPaths(paths: readonly FacilityPath[], states: readonly string[]) {
  if (!states.length) return paths;
  const want = new Set(states);
  return paths.filter((p) => want.has(stateId(p.facility.state)));
}

export interface SpecPlan {
  paths: readonly FacilityPath[];
  chosen: ReadonlySet<ScenarioComponentId>;
  plan: TargetPlan;
}

export function planSpec(paths: readonly FacilityPath[], spec: ScenarioSpec): SpecPlan {
  const scoped = scopedPaths(paths, spec.states);
  const chosen = new Set(spec.fixes);
  return {
    paths: scoped,
    chosen,
    plan: planForTarget(scoped, chosen, spec.target),
  };
}

/**
 * What adding each unchosen fix would make newly Ready. Under a budget, at that
 * budget. Under a count or a share the count is already fixed, so the hint is
 * how many more facilities the fixes could reach at all.
 */
export function useGains(
  paths: readonly FacilityPath[],
  chosen: ReadonlySet<ScenarioComponentId>,
  target: ScenarioTarget,
): Partial<Record<ScenarioComponentId, number>> {
  return useMemo(() => {
    const t: ScenarioTarget = target.kind === 'budget' ? target : { kind: 'budget', ngn: null };
    const base = planForTarget(paths, chosen, t).newlyReady;
    const out: Partial<Record<ScenarioComponentId, number>> = {};
    for (const f of FIXES) {
      if (chosen.has(f.id)) continue;
      const next = new Set(chosen);
      next.add(f.id);
      out[f.id] = Math.max(0, planForTarget(paths, next, t).newlyReady - base);
    }
    return out;
  }, [paths, chosen, target]);
}

/** The states in view, as options for a scenario's state picker. */
export function useStateItems(paths: readonly FacilityPath[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of paths) counts.set(p.facility.state, (counts.get(p.facility.state) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ key: stateId(name), label: name, count }));
  }, [paths]);
}
