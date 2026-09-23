/**
 * The cost split by readiness, against the workbook's own Cost summary sheet.
 * Every figure below is that sheet's, rounded to the naira.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readinessCostBy, readinessTotals, type BreakdownId } from './costByReadiness';
import type { Band, FacilitySummary } from './types';

const facilities: FacilitySummary[] = JSON.parse(
  readFileSync(join(__dirname, '../../public/data/facilities-summary.json'), 'utf8'),
);

/** [ready, moderately ready, not ready] */
type Split = [number, number, number];

const expectSplit = (cost: Record<Band, number>, [r, m, n]: Split, what: string) => {
  expect(Math.round(cost.ready), `${what} ready`).toBe(r);
  expect(Math.round(cost.moderately_ready), `${what} moderately ready`).toBe(m);
  expect(Math.round(cost.not_ready), `${what} not ready`).toBe(n);
};

describe('readinessTotals', () => {
  it('splits the whole plan as the workbook does', () => {
    const t = readinessTotals(facilities);
    expectSplit(t.cost, [108_896_333, 3_603_089_667, 3_543_208_333], 'overall');
    expect(Math.round(t.total)).toBe(7_255_194_333);
    expect(t.facilities).toEqual({ ready: 170, moderately_ready: 1892, not_ready: 744 });
  });
});

describe('readinessCostBy', () => {
  const cases: [BreakdownId, Record<string, Split>][] = [
    [
      'category',
      {
        'Power and wiring': [12_388_000, 2_322_938_000, 2_426_835_000],
        'Connectivity and resilience': [0, 111_760_000, 594_880_000],
        'Devices and maintenance': [76_533_333, 933_566_667, 371_233_333],
        'Service-point furniture': [19_975_000, 234_825_000, 150_260_000],
        'Data backup': [0, 0, 0],
      },
    ],
    [
      'group',
      {
        BHCPF: [104_294_000, 3_339_113_000, 2_609_862_333],
        'Non-BHCPF': [4_602_333, 263_976_667, 933_346_000],
      },
    ],
    [
      'functionality',
      {
        'Functional L2': [32_553_667, 703_434_000, 230_983_667],
        'Functional L1': [62_156_333, 2_426_445_000, 1_696_695_333],
        'Partially Functional': [14_186_333, 473_210_667, 1_615_529_333],
      },
    ],
    [
      'zone',
      {
        'North West': [60_700_667, 741_203_333, 726_535_000],
        'North Central': [2_134_333, 581_546_667, 689_498_333],
        'North East': [6_512_667, 454_899_000, 549_903_333],
        'South West': [11_718_000, 576_624_667, 237_954_000],
        'South East': [24_012_333, 760_213_333, 566_232_667],
        'South South': [3_818_333, 488_602_667, 773_085_000],
      },
    ],
    [
      'state',
      {
        Kano: [55_702_333, 552_187_333, 560_906_667],
        'Akwa Ibom': [0, 360_204_000, 582_940_333],
        Lagos: [11_358_667, 256_937_667, 47_746_667],
        Imo: [0, 410_896_333, 331_524_333],
      },
    ],
  ];

  it.each(cases)('%s', (breakdown, expected) => {
    const rows = readinessCostBy(facilities, breakdown);
    for (const [label, split] of Object.entries(expected)) {
      const row = rows.find((r) => r.label === label);
      expect(row, `${breakdown}: ${label}`).toBeDefined();
      expectSplit(row!.cost, split, `${breakdown}: ${label}`);
    }
    // Every breakdown is the whole plan, cut differently.
    const sum = rows.reduce((s, r) => s + r.total, 0);
    expect(Math.round(sum), `${breakdown} total`).toBe(7_255_194_333);
  });
});
