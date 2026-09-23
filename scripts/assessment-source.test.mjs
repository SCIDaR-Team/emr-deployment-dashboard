/**
 * The parts of the ingest that make claims about the source file.
 *
 * These test the *reading*, not the dataset: a fixture stands in for the real
 * 8.6 MB CSV so the behaviour can be pinned without a build. The dataset's own
 * invariants are checked in `ingest-assessment.mjs`, against every row, on
 * every run — that is where "does the sheet still mean what the doc says"
 * belongs. What belongs here is the machinery those checks depend on.
 *
 * Four things are worth pinning, and each has a real failure behind it:
 *
 *   **Positional parsing.** `Intervention 1`, `When action is needed` and
 *   `Cost 1 (₦)` repeat twenty-odd times in the real header and mean different
 *   things each time, and the sheet puts helper and scenario columns between
 *   them. A parser that looks a column up by name, or walks a fixed stride,
 *   reads a plausible, wrong value. The fixture reproduces both.
 *
 *   **Unit actions.** One cell can buy two desks and a fan, or five tablets,
 *   for one cost. The split into unit actions must add back to that cost
 *   exactly, or a total quietly stops reconciling with the sheet.
 *
 *   **Severity is per condition.** The deployment band is computed from it, so
 *   a condition that blocks at one facility and not at another must stop the
 *   build rather than keep whichever row it read last.
 *
 *   **Blank costs are not zero.** The source writes a real `₦0` for work that
 *   costs nothing and leaves the cell *empty* where the price is unknown.
 */

import { describe, expect, it } from 'vitest';
import {
  UNRECORDED_LABEL,
  extractCatalogue,
  extractGapAreas,
  interventionsCost,
  interventionsInRow,
  parseAssessmentCsv,
  parseMoney,
  resolveLga,
  splitAction,
} from './assessment-source.mjs';

/** As wide as the real sheet's fixed columns reach. */
const WIDTH = 138;

/** The columns the parser asserts, at their real positions. */
const FIXED = {
  0: 'Facility UUID',
  1: 'State',
  2: 'LGA',
  3: 'Facility name',
  4: 'Facility group',
  5: 'Functionality',
  6: 'Zone',
  7: 'Overall readiness for EMR deployment',
  8: 'Highest Technical Infrastructure gap severity',
  9: 'Highest Workforce Capacity gap severity',
  10: 'Highest Workflow and Transition gap severity',
  11: 'Highest Data Use and Reporting gap severity',
  75: 'MTN base station',
  76: 'MTN base-station distance (km)',
  77: 'MTN serviceability',
  78: 'MTN 4G signal',
  79: 'Average Airtel site distance (m)',
  86: 'Technical intervention cost (₦)',
  103: 'Workforce intervention cost (₦)',
  116: 'Workflow intervention cost (₦)',
  129: 'Data-use intervention cost (₦)',
  132: 'Moderate gaps (e.g. power or connectivity work)',
  133: 'Major gaps (e.g. no power or usable connection)',
  134: 'Long-term gaps (e.g. optional maintenance or improvement)',
  135: 'Typical daily client load',
  137: 'Total facility intervention cost (₦)',
};

/**
 * Three technical blocks and one workforce block. Power carries a helper and a
 * scenario column between its slot columns, the way the real sheet does.
 */
const BLOCKS = {
  12: 'Power gap',
  13: 'Intervention 1',
  14: 'Power intervention helper column',
  15: 'When action is needed',
  16: 'Solar top-up  only scenario',
  17: 'Cost 1 (₦)',
  18: 'Intervention 2',
  19: 'When action is needed',
  20: 'Cost 2 (₦)',
  21: 'Physical service-point gap',
  22: 'Intervention 1',
  23: 'When action is needed',
  24: 'Cost 1 (₦)',
  25: 'Device-sufficiency gap',
  26: 'Intervention 1',
  27: 'When action is needed',
  28: 'Cost 1 (₦)',
  87: 'Training gap',
  88: 'Intervention 1',
  89: 'When action is needed',
  90: 'Cost 1 (₦)',
};

const DOMAIN_ROW = {
  12: 'Technical Infrastructure',
  87: 'Workforce Capacity',
  104: 'Workflow and Transition',
  117: 'Data Use and Reporting',
  130: 'Baseline Summary',
};

const csvCell = (c) => {
  const v = String(c ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const line = (cells) => {
  const out = Array(WIDTH).fill('');
  for (const [k, v] of Object.entries(cells)) out[Number(k)] = v;
  return out.map(csvCell).join(',');
};

function fixture(rows, header = { ...FIXED, ...BLOCKS }) {
  return ['title', 'scope note', line(DOMAIN_ROW), line(header), ...rows].join('\n');
}

const MAJOR = 'Major gap to fix before EMR deployment';
const MINOR_BEFORE = 'Minor gap to fix before EMR deployment';
const MINOR_DURING = 'Minor action to complete during EMR deployment';
const LONG_TERM = 'Optional long-term improvement after EMR deployment';

/** One data row, with any cells overridden by column. */
const row = (cells = {}) =>
  line({
    0: 'u1',
    1: 'kano',
    2: 'dala',
    3: 'some_health_post',
    4: 'BHCPF',
    5: 'Functional L1',
    6: 'north_west',
    7: 'Not Ready for EMR deployment',
    12: 'No gap',
    21: 'No gap',
    25: 'No gap',
    87: 'No gap',
    ...cells,
  });

const POWER_NONE = {
  12: 'No functional electricity source or 0 hours/day',
  13: 'Install solar panels and batteries.',
  14: 'Full solar system',
  15: MAJOR,
  16: MAJOR,
  17: '3085000',
  18: 'Connect the facility to the electricity grid.',
  19: LONG_TERM,
  20: '500000',
};

const parse = (...rows) => parseAssessmentCsv(fixture(rows));

describe('parseAssessmentCsv', () => {
  it('locates each slot by walking forward, past helper and scenario columns', () => {
    const { blocks } = parse(row());

    expect(blocks.map((b) => b.subDomain)).toEqual([
      'Power',
      'Physical service-point',
      'Device-sufficiency',
      'Training',
    ]);
    expect(blocks[0]).toMatchObject({ col: 12, domain: 'technical_infrastructure' });
    // The helper at 14 and the scenario at 16 are skipped: a fixed stride of
    // three would read the helper as the urgency and the scenario as the cost.
    expect(blocks[0].slots).toEqual([
      { label: 13, when: 15, cost: 17 },
      { label: 18, when: 19, cost: 20 },
    ]);
    expect(blocks[3].slots).toEqual([{ label: 88, when: 89, cost: 90 }]);
  });

  it('forward-fills the sparse domain row', () => {
    const { blocks } = parse(row());
    expect(blocks[3].domain).toBe('workforce_capacity');
  });

  it('refuses a sheet whose fixed columns have moved', () => {
    const moved = { ...FIXED, ...BLOCKS, 137: 'Something else' };
    expect(() => parseAssessmentCsv(fixture([row()], moved))).toThrow(/layout has changed/);
  });
});

describe('extractGapAreas', () => {
  it('gives every gap column an id, its domain and the sheet\u2019s order', () => {
    const { blocks } = parse(row());
    expect(extractGapAreas(blocks).map((a) => [a.id, a.domain, a.order])).toEqual([
      ['power', 'technical_infrastructure', 0],
      ['physical_service_point', 'technical_infrastructure', 1],
      ['device_sufficiency', 'technical_infrastructure', 2],
      ['training', 'workforce_capacity', 3],
    ]);
  });
});

describe('urgency', () => {
  it('reads the two Minor wordings as one urgency, keeping their phases apart', () => {
    const { blocks, rows } = parse(
      row({
        25: 'No supported computing devices are available',
        26: 'Procure EMR-capable tablets to close the immediate device gap.',
        27: MINOR_BEFORE,
        28: '466666.6667',
        21: '0% of applicable service points meet all minimum conditions',
        22: 'Procure 1 desk',
        23: MINOR_DURING,
        24: '35000',
      }),
    );
    const tablets = interventionsInRow(rows[0], blocks[2]);
    const desks = interventionsInRow(rows[0], blocks[1]);
    expect(tablets[0]).toMatchObject({ horizon: 'minor', phase: 'before' });
    expect(desks[0]).toMatchObject({ horizon: 'minor', phase: 'during' });
  });

  it('rejects an unrecognised urgency rather than guessing', () => {
    const { blocks, rows } = parse(row({ ...POWER_NONE, 15: 'Sometime soon' }));
    expect(() => extractCatalogue(rows, blocks)).toThrow(/Sometime soon/);
  });
});

describe('splitAction', () => {
  it('splits a service-point cell into unit actions that add back to its cost', () => {
    const parts = splitAction(
      'Procure 2 desks\nProcure 1 electric fan\nConfirm whether a lockable door is required for 3 affected service points before costing.',
      130000,
      'test',
    );
    expect(parts.map((p) => [p.key, p.quantity, p.unitCostNGN])).toEqual([
      ['desk', 2, 35000],
      ['electric_fan', 1, 60000],
      ['lockable_door', 3, null],
    ]);
  });

  it('prices the plain action as whatever the unit items do not account for', () => {
    const parts = splitAction(
      'Fix unsafe or inadequate wiring where EMR equipment will be used.\nInstall 4 socket points',
      400000,
      'test',
    );
    expect(parts.map((p) => [p.key, p.quantity, p.unitCostNGN])).toEqual([
      [null, 1, 388000],
      ['socket', 4, 3000],
    ]);
  });

  it('reads the number of tablets off the cost', () => {
    const [tablets] = splitAction(
      'Procure EMR-capable tablets to close the immediate device gap.',
      1166666.667,
      'test',
    );
    expect(tablets).toMatchObject({ key: 'tablet', quantity: 5, unit: 'tablet' });
  });

  it('refuses a cell whose items do not add up to its cost', () => {
    expect(() => splitAction('Procure 2 desks', 80000, 'test')).toThrow(/add to ₦70000/);
  });
});

describe('extractCatalogue', () => {
  it('makes one entry per (area, condition), naming the action types it calls for', () => {
    const { blocks, rows } = parse(row(POWER_NONE));
    const { gaps, actions } = extractCatalogue(rows, blocks);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      domain: 'technical_infrastructure',
      area: 'power',
      label: 'No functional electricity source or 0 hours/day',
      severity: 'blocking',
      recorded: true,
    });
    expect(gaps[0].actions).toHaveLength(2);
    expect(actions.map((a) => [a.horizon, a.phase, a.unitCostNGN])).toEqual([
      ['major', 'before', 3_085_000],
      ['long_term', 'after', 500_000],
    ]);
  });

  it('collapses the same condition across rows into one entry', () => {
    const { blocks, rows } = parse(row({ ...POWER_NONE, 0: 'u1' }), row({ ...POWER_NONE, 0: 'u2' }));
    expect(extractCatalogue(rows, blocks).gaps).toHaveLength(1);
  });

  it('throws when one condition is blocking at one facility and not at another', () => {
    const { blocks, rows } = parse(
      row({ ...POWER_NONE, 0: 'u1' }),
      row({ ...POWER_NONE, 0: 'u2', 15: LONG_TERM }),
    );
    expect(() => extractCatalogue(rows, blocks)).toThrow(/blocking at facility/);
    // The message has to name both rows, or nobody can find the disagreement
    // in a 2,806-row sheet.
    expect(() => extractCatalogue(rows, blocks)).toThrow(/u1[\s\S]*u2/);
  });

  it('keeps a gap that has no action at all, as one that cannot block', () => {
    const { blocks, rows } = parse(row({ 87: 'Training over 1 year ago' }));
    const { gaps } = extractCatalogue(rows, blocks);
    expect(gaps[0]).toMatchObject({ severity: 'partial', actions: [], recorded: true });
  });

  it('files work costed under "No gap" as the area\u2019s unrecorded condition', () => {
    const { blocks, rows } = parse(
      row({ 21: 'No gap', 22: 'Procure 1 electric fan', 23: MINOR_DURING, 24: '60000' }),
    );
    const { gaps } = extractCatalogue(rows, blocks);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ label: UNRECORDED_LABEL, recorded: false });
  });

  it('reads an action cell of "No gap" as no action', () => {
    const { blocks, rows } = parse(
      row({ 21: '0% of applicable service points meet all minimum conditions', 22: 'No gap' }),
    );
    expect(interventionsInRow(rows[0], blocks[1])).toEqual([]);
  });
});

describe('the source repair', () => {
  it('holds the `0` repair to its own column', () => {
    expect(() => parse(row({ 87: '0' }))).toThrow(/appears as a Training gap value/);
  });
});

describe('parseMoney', () => {
  it('separates a real zero from an unpriced blank', () => {
    // The distinction the whole of Query B rests on.
    expect(parseMoney('₦0')).toBe(0);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
  });

  it('reads the sheet’s formatting', () => {
    expect(parseMoney('₦3,000,000')).toBe(3_000_000);
    expect(parseMoney('54378')).toBe(54_378);
  });

  it('throws on something that is not a number', () => {
    expect(() => parseMoney('about ₦3m')).toThrow(/Unparseable/);
  });
});

describe('interventionsCost', () => {
  it('reports an unpriced intervention rather than counting it as zero', () => {
    const actions = [{ costNGN: 40_000 }, { costNGN: null }, { costNGN: 0 }];
    expect(interventionsCost(actions)).toEqual({ costNGN: 40_000, unpriced: 1 });
  });
});

describe('resolveLga', () => {
  const index = {
    kano: [
      { lgaId: 'dala', name: 'Dala' },
      { lgaId: 'kano_municipal', name: 'Kano Municipal' },
      { lgaId: 'nasarawa', name: 'Nasarawa' },
    ],
  };

  it('matches a slug the two sources spell the same way', () => {
    expect(resolveLga('kano', 'dala', index).lgaId).toBe('dala');
  });

  it('applies the alias table for the 25 that differ', () => {
    expect(resolveLga('kano', 'kano_minicipal_council', index).lgaId).toBe('kano_municipal');
  });

  it('scopes aliases to their state, so a name shared with a state is safe', () => {
    // `nassarawa` is an LGA of Kano and, differently spelled, a state of its
    // own. The alias is keyed by state so it cannot leak between them.
    expect(resolveLga('kano', 'nassarawa', index).lgaId).toBe('nasarawa');
  });

  it('throws rather than dropping a facility it cannot place', () => {
    // A silent drop is a state quietly losing facilities and its investment
    // total going with them: a plausible dashboard, and a wrong one.
    expect(() => resolveLga('kano', 'nowhere', index)).toThrow(/does not match the boundary layer/);
  });
});
