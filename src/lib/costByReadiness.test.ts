/**
 * The cost split by readiness, against the workbook's own Cost summary sheet.
 * Every figure below is that sheet's, rounded to the naira — as of the
 * workbook's September 2026 revision (Starlink, the new FibreX and wiring
 * prices).
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
    expectSplit(t.cost, [105_532_333, 3_505_383_667, 3_113_599_333], 'overall');
    expect(Math.round(t.total)).toBe(6_724_515_333);
    expect(t.facilities).toEqual({ ready: 170, moderately_ready: 1892, not_ready: 744 });
  });
});

describe('readinessCostBy', () => {
  const cases: [BreakdownId, Record<string, Split>][] = [
    [
      'category',
      {
        'Power and wiring': [9_024_000, 2_263_662_000, 2_369_531_000],
        'Connectivity and resilience': [0, 73_330_000, 222_575_000],
        'Devices and maintenance': [76_533_333, 933_566_667, 371_233_333],
        'Service-point furniture': [19_975_000, 234_825_000, 150_260_000],
        'Data backup': [0, 0, 0],
      },
    ],
    [
      'group',
      {
        BHCPF: [101_162_000, 3_247_290_000, 2_320_762_333],
        'Non-BHCPF': [4_370_333, 258_093_667, 792_837_000],
      },
    ],
    [
      'functionality',
      {
        'Functional L2': [31_625_667, 681_737_000, 203_320_667],
        'Functional L1': [60_184_333, 2_362_419_000, 1_484_129_333],
        'Partially Functional': [13_722_333, 461_227_667, 1_426_149_333],
      },
    ],
    [
      'zone',
      {
        'North West': [59_540_667, 714_249_333, 664_520_000],
        'North Central': [2_018_333, 569_763_667, 519_484_333],
        'North East': [6_396_667, 443_216_000, 452_729_333],
        'South West': [11_138_000, 560_879_667, 196_030_000],
        'South East': [22_620_333, 738_500_333, 555_460_667],
        'South South': [3_818_333, 478_774_667, 725_375_000],
      },
    ],
    [
      'state',
      {
        Kano: [54_542_333, 529_609_333, 520_723_667],
        'Akwa Ibom': [0, 354_172_000, 561_584_333],
        Lagos: [10_778_667, 247_937_667, 46_702_667],
        Imo: [0, 407_648_333, 326_536_333],
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
    expect(Math.round(sum), `${breakdown} total`).toBe(6_724_515_333);
  });
});
