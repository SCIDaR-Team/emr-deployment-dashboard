import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_COMPARE,
  DEFAULT_SINGLE,
  MAX_COMPARE,
  decodeSpec,
  encodeSpec,
  type ScenarioSpec,
  type ScenarioView,
} from './scenarioState';

/**
 * The scenario builder's state, kept in the page link.
 *
 *   sv   the view — single, compare or states
 *   ss   the single scenario (also the one By state runs)
 *   sc   the compared scenarios, `*`-separated
 *
 * Read once on mount; written back with `replace`, so the Back button leaves
 * the page rather than stepping through every tile the reader clicked. Nothing
 * is written until the reader changes something, so opening the page does not
 * rewrite its own address. Other parameters — the filter row's — are left as
 * they are.
 */

interface ScenarioUrlState {
  view: ScenarioView;
  single: ScenarioSpec;
  compare: ScenarioSpec[];
}

/** Any id-shaped state token is accepted here; ids that match no facility in
 *  scope simply select nothing and the view says so. */
const ANY_STATE = {
  has: (s: string) => /^[a-z_]+$/.test(s),
} as ReadonlySet<string>;

function read(params: URLSearchParams): ScenarioUrlState {
  const view = params.get('sv');
  const single = params.get('ss');
  const compare = params.get('sc');
  return {
    view: view === 'compare' || view === 'states' ? view : 'single',
    single: (single && decodeSpec(single, ANY_STATE)) || DEFAULT_SINGLE,
    compare: compare
      ? compare
          .split('*')
          .map((c) => decodeSpec(c, ANY_STATE))
          .filter((c): c is ScenarioSpec => c !== null)
          .slice(0, MAX_COMPARE)
      : DEFAULT_COMPARE,
  };
}

export function useScenarioUrl() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<ScenarioUrlState>(() => read(params));
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('sv', state.view);
        next.set('ss', encodeSpec(state.single));
        next.set('sc', state.compare.map(encodeSpec).join('*'));
        return next;
      },
      { replace: true },
    );
  }, [state, setParams]);

  const update = useCallback((fn: (s: ScenarioUrlState) => ScenarioUrlState) => {
    touched.current = true;
    setState(fn);
  }, []);

  return {
    ...state,
    setView: (view: ScenarioView) => update((s) => ({ ...s, view })),
    setSingle: (single: ScenarioSpec) => update((s) => ({ ...s, single })),
    setCompare: (compare: ScenarioSpec[]) =>
      update((s) => ({ ...s, compare: compare.slice(0, MAX_COMPARE) })),
    /** Add a scenario to the comparison and switch to it. Past four, the
     *  oldest drops off. */
    addToCompare: (spec: ScenarioSpec) =>
      update((s) => ({
        ...s,
        view: 'compare',
        compare: [...s.compare, spec].slice(-MAX_COMPARE),
      })),
    /** Read one scenario in full in the single view. */
    openSingle: (spec: ScenarioSpec) => update((s) => ({ ...s, view: 'single', single: spec })),
  };
}
