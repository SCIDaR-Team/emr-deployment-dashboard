import { describe, expect, it } from 'vitest';
import { unverifiedFigures } from '../figures';
import { CHARTS, EXPLAIN_LIMITS, isChartId, parseSnapshot } from './charts';

const ok = {
  chart: 'coverage-maturity',
  title: 'Maturity band',
  scope: ['Area: Nigeria, all 37 states'],
  tables: [{ columns: ['Band', 'States'], rows: [['Mature', '5']] }],
};

describe('parseSnapshot', () => {
  it('accepts a snapshot within the limits', () => {
    expect(parseSnapshot(ok)).toEqual(ok);
  });

  it('turns away anything outside them', () => {
    expect(parseSnapshot({ ...ok, chart: 'nope' })).toHaveProperty('error');
    expect(parseSnapshot({ ...ok, tables: [] })).toHaveProperty('error');
    expect(parseSnapshot({ ...ok, scope: 'Kano' })).toHaveProperty('error');
    const rows = Array.from({ length: EXPLAIN_LIMITS.rows + 1 }, () => ['a', '1']);
    expect(parseSnapshot({ ...ok, tables: [{ columns: ['x', 'y'], rows }] })).toHaveProperty(
      'error',
    );
    expect(
      parseSnapshot({ ...ok, tables: [{ columns: ['x', 'y'], rows: [['a', 1]] }] }),
    ).toHaveProperty('error');
  });

  it('knows only its own charts', () => {
    expect(isChartId('scenario-states')).toBe(true);
    expect(isChartId('assessment-gap-domain')).toBe(true);
    expect(isChartId('toString')).toBe(false);
    expect(Object.keys(CHARTS)).toHaveLength(12);
  });
});

describe('unverifiedFigures against a snapshot', () => {
  it('flags only the figures the snapshot does not hold', () => {
    const source = [ok, { note: '₦1.2bn and 16.4%' }];
    expect(
      unverifiedFigures('5 states are Mature; the plan is ₦1.2bn, 16.4 per cent.', source),
    ).toEqual([]);
    expect(unverifiedFigures('6 states, ₦1.3bn.', source)).toEqual(['6', '₦1.3bn']);
  });
});
