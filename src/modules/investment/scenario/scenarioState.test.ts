import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPARE,
  decodeSpec,
  encodeSpec,
  fixesName,
  scenarioNames,
  stateId,
  type ScenarioSpec,
} from './scenarioState';

const ANY = { has: () => true } as unknown as ReadonlySet<string>;

describe('scenario links', () => {
  it('round-trips every default scenario', () => {
    for (const s of DEFAULT_COMPARE) expect(decodeSpec(encodeSpec(s), ANY)).toEqual(s);
  });

  it('keeps a name with dots and spaces, and states', () => {
    const s: ScenarioSpec = {
      name: 'Kano v2. routers + solar',
      fixes: ['router', 'full_solar'],
      target: { kind: 'facilities', n: 250 },
      states: ['kano', 'akwa_ibom'],
    };
    expect(decodeSpec(encodeSpec(s), ANY)).toEqual(s);
  });

  it('writes only characters a query string leaves alone, bar the name', () => {
    const raw = encodeSpec({ ...DEFAULT_COMPARE[1]!, name: 'x', states: ['akwa_ibom', 'fct'] });
    expect(raw).toBe('TSR.b1000000000.akwa_ibom-fct.x');
    expect(new URLSearchParams({ s: raw }).toString()).toBe(`s=${raw}`);
  });

  it('opens a hand-edited link rather than failing', () => {
    expect(decodeSpec('RQ.bnonsense..', ANY)).toEqual({
      name: '',
      fixes: ['router'],
      target: { kind: 'budget', ngn: null },
      states: [],
    });
  });

  it('makes state ids from names', () => {
    expect(stateId('Akwa Ibom')).toBe('akwa_ibom');
    expect(stateId('FCT')).toBe('fct');
  });
});

describe('scenario names', () => {
  const spec = (over: Partial<ScenarioSpec>): ScenarioSpec => ({
    name: '',
    fixes: ['router'],
    target: { kind: 'budget', ngn: null },
    states: [],
    ...over,
  });

  it('names a scenario from its fixes', () => {
    expect(fixesName(['router', 'solar_topup'])).toBe('Solar top-up + Router');
    expect(fixesName(['router', 'fibrex', 'solar_topup', 'full_solar', 'network_extension'])).toBe(
      'All but Starlink',
    );
    expect(fixesName(DEFAULT_COMPARE[2]!.fixes)).toBe('All six fixes');
    expect(fixesName([])).toBe('No fixes');
  });

  it('keeps a typed name, and replaces the old letter placeholders', () => {
    expect(
      scenarioNames([spec({ name: 'Kano first' }), spec({ name: 'Scenario B', fixes: ['satellite'] })]),
    ).toEqual(['Kano first', 'Starlink']);
  });

  it('tells two scenarios with the same fixes apart by target', () => {
    expect(
      scenarioNames([spec({}), spec({ target: { kind: 'share', pct: 50 } })]),
    ).toEqual(['Router · no limit', 'Router · 50% Ready']);
  });
});
