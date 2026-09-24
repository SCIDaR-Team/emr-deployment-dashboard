import type OpenAI from 'openai';
import { formatNaira } from '../../src/lib/format';
import type { ScenarioTarget } from '../../src/lib/scenarios';
import type { ScenarioComponentId } from '../../src/lib/types';
import {
  MAX_COMPARE,
  stateId,
  type ScenarioSpec,
  type ScenarioView,
} from '../../src/modules/investment/scenario/scenarioState';
import type { AssistantConfig } from './agent';
import { findState, type DashboardData } from './data';

/**
 * A scenario described in words, turned into the Scenarios section's own
 * settings — "₦20m on routers in the North West", "compare solar with
 * connectivity at ₦500m", "which state gets most with ₦50m?".
 *
 * The model only interprets. It returns fixes, a target and places in a fixed
 * JSON shape; this module checks every one of them against the data — a state
 * must be one of the twelve assessed, a zone becomes the assessed states in
 * it, fixes must be the six the builder has — and the section's own engine
 * then computes the result. So a misread can put the wrong settings on the
 * page, where the reader sees them and the summary says what was understood,
 * but it cannot put a wrong figure there.
 */

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
  full_solar: 'Full solar',
  network_extension: 'Network extension',
  satellite: 'Satellite',
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['understood', 'view', 'scenarios', 'note'],
  properties: {
    understood: {
      type: 'boolean',
      description: 'False when the text does not describe a scenario the builder can set up.',
    },
    view: {
      type: 'string',
      enum: ['single', 'compare', 'states'],
      description:
        'single: one scenario. compare: two to four scenarios side by side. states: one scenario run in each state on its own, to find which state gets the most.',
    },
    scenarios: {
      type: 'array',
      description: 'One scenario for single or states; two to four for compare.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'fixes', 'target_kind', 'target_value', 'states', 'zones'],
        properties: {
          name: { type: 'string', description: 'Two to four words, e.g. "Routers, ₦20m".' },
          fixes: { type: 'array', items: { type: 'string', enum: FIXES } },
          target_kind: { type: 'string', enum: ['budget', 'facilities', 'share'] },
          target_value: {
            type: ['number', 'null'],
            description:
              'Naira for budget (null for no limit); a count for facilities; a percent for share.',
          },
          states: { type: 'array', items: { type: 'string' } },
          zones: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    note: {
      type: 'string',
      description: 'When not understood, one short sentence saying what to add. Otherwise empty.',
    },
  },
} as const;

function instructions(data: DashboardData): string {
  const assessed = data.states.filter((s) => data.facilitiesByState.get(s.name)?.length);
  const zones = [...new Set(assessed.map((s) => s.zone).filter(Boolean))].sort();
  return `Turn a description of an EMR-readiness funding scenario into settings for the dashboard's scenario builder. Output only the JSON.

The builder funds six power and connectivity fixes: router, fibrex, solar_topup, full_solar, network_extension, satellite. "Power" or "solar" means solar_topup and full_solar. "Connectivity" or "internet" means router, fibrex, network_extension and satellite. If no fix is named, use all six.

A target is one of:
- budget: spend up to target_value naira. "₦20m" = 20000000, "1.5bn" = 1500000000. No amount or "no limit" means target_value null.
- facilities: make target_value MORE facilities Ready.
- share: reach target_value percent of facilities Ready overall.

Places: the twelve assessed states are ${assessed.map((s) => s.name).join(', ')}. Zones: ${zones.join(', ')}. Put named states in "states" and named zones in "zones"; leave both empty for all states. Never invent a state.

View: "states" when the question asks which state or where the money goes furthest; "compare" when it names two or more alternatives (then one scenario each, at most four); otherwise "single".

If the text is not about funding these fixes, set understood to false and say briefly in "note" what the builder can do.`;
}

export interface InterpretedScenario {
  view: ScenarioView;
  specs: ScenarioSpec[];
  /** What was understood, one line per scenario, for the reader to check. */
  summary: string[];
  /** Names given that are not assessed states or zones. */
  ignored: string[];
}

export type InterpretResult = InterpretedScenario | { error: string };

interface RawScenario {
  name?: unknown;
  fixes?: unknown;
  target_kind?: unknown;
  target_value?: unknown;
  states?: unknown;
  zones?: unknown;
}

/** Check what the model returned against the data, and turn it into specs. */
export function toSpecs(data: DashboardData, raw: unknown): InterpretResult {
  const r = raw as { understood?: unknown; view?: unknown; scenarios?: unknown; note?: unknown };
  if (!r || r.understood === false || !Array.isArray(r.scenarios) || !r.scenarios.length) {
    const note = typeof r?.note === 'string' && r.note.trim() ? r.note.trim() : '';
    return {
      error:
        note ||
        'Describe the fixes, a budget or a number of facilities, and where — e.g. "₦20m on routers in Kano".',
    };
  }
  const view: ScenarioView = r.view === 'compare' || r.view === 'states' ? r.view : 'single';
  const assessed = data.states.filter((s) => data.facilitiesByState.get(s.name)?.length);
  const ignored = new Set<string>();

  const specs = (r.scenarios as RawScenario[])
    .slice(0, view === 'compare' ? MAX_COMPARE : 1)
    .map((s, i) => {
      const fixes = (Array.isArray(s.fixes) ? s.fixes : []).filter((f): f is ScenarioComponentId =>
        FIXES.includes(f as ScenarioComponentId),
      );
      const value =
        typeof s.target_value === 'number' && Number.isFinite(s.target_value) && s.target_value >= 0
          ? s.target_value
          : null;
      const target: ScenarioTarget =
        s.target_kind === 'facilities' && value !== null
          ? { kind: 'facilities', n: Math.round(value) }
          : s.target_kind === 'share' && value !== null
            ? { kind: 'share', pct: Math.min(100, Math.round(value)) }
            : { kind: 'budget', ngn: value === null ? null : Math.round(value) };

      const names = new Set<string>();
      for (const n of Array.isArray(s.states) ? s.states : []) {
        const st = findState(data, String(n));
        if (st && data.facilitiesByState.get(st.name)?.length) names.add(st.name);
        else ignored.add(String(n));
      }
      for (const z of Array.isArray(s.zones) ? s.zones : []) {
        const inZone = assessed.filter(
          (st) => (st.zone ?? '').toLowerCase() === String(z).trim().toLowerCase(),
        );
        if (inZone.length) inZone.forEach((st) => names.add(st.name));
        else ignored.add(String(z));
      }
      // A states view ranks every state, so a scope would only hide the answer.
      const states = view === 'states' ? [] : [...names].sort();
      const name =
        typeof s.name === 'string' && s.name.trim()
          ? s.name.trim().slice(0, 40)
          : `Scenario ${i + 1}`;
      return {
        name,
        fixes: fixes.length ? fixes : [...FIXES],
        target,
        states: states.map(stateId),
        _states: states,
      };
    });

  const summary = specs.map((s) => {
    const fixes =
      s.fixes.length === FIXES.length
        ? 'All six fixes'
        : s.fixes.map((f) => FIX_LABEL[f]).join(' + ');
    const t = s.target;
    const target =
      t.kind === 'budget'
        ? t.ngn === null
          ? 'no budget limit'
          : `${formatNaira(t.ngn, true)} budget`
        : t.kind === 'facilities'
          ? `${t.n.toLocaleString()} more facilities Ready`
          : `${t.pct}% of facilities Ready`;
    const where =
      view === 'states'
        ? 'in each state'
        : s._states.length
          ? s._states.join(', ')
          : 'all 12 states';
    return `${fixes} · ${target} · ${where}`;
  });

  return {
    view,
    specs: specs.map(({ _states: _s, ...spec }) => spec),
    summary,
    ignored: [...ignored],
  };
}

export async function interpretScenario(
  config: AssistantConfig,
  data: DashboardData,
  text: string,
  signal?: AbortSignal,
): Promise<InterpretResult> {
  const response = await config.client.responses.create(
    {
      model: config.model,
      instructions: instructions(data),
      input: [{ role: 'user', content: text }],
      store: false,
      max_output_tokens: 800,
      text: { format: { type: 'json_schema', name: 'scenario', schema: SCHEMA, strict: true } },
      ...(config.reasoningEffort ? { reasoning: { effort: 'low' as const } } : {}),
    },
    { signal },
  );
  let raw: unknown;
  try {
    raw = JSON.parse((response as OpenAI.Responses.Response).output_text);
  } catch {
    return { error: 'That could not be read as a scenario. Try rephrasing it.' };
  }
  return toSpecs(data, raw);
}
