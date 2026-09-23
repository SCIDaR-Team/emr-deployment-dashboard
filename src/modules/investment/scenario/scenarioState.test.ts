import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPARE,
  decodeSpec,
  encodeSpec,
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
      name: 'Scenario',
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
