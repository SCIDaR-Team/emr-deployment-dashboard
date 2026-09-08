/**
 * The parts of the ingest that make claims about the source file.
 *
 * These test the *reading*, not the dataset: a fixture stands in for the real
 * 7.8 MB CSV so the behaviour can be pinned without a build. The dataset's own
 * invariants are checked in `ingest-assessment.mjs`, against every row, on
 * every run — that is where "does the sheet still mean what the doc says"
 * belongs. What belongs here is the machinery those checks depend on.
 *
 * Three things are worth pinning, and each has a real failure behind it:
 *
 *   **Positional parsing.** `Intervention 1`, `When action is needed` and
 *   `Cost 1 (₦)` repeat twenty-odd times in the real header and mean different
 *   things each time. A parser that looks a column up by name reads a
 *   plausible, wrong value — the worst kind of bug this pipeline can have,
 *   because nothing downstream can detect it. The fixture reproduces the
 *   duplicate headers so a regression to name-lookup fails here.
 *
 *   **Determinism.** The catalogue is extracted rather than declared, which is
 *   only sound while one gap value implies one set of interventions. If that
 *   stops being true the extraction is ill-defined and the build must stop
 *   rather than keep whichever row it read last.
 *
 *   **Blank costs are not zero.** The source writes a real `₦0` for work that
 *   costs nothing and leaves the cell *empty* where the price is unknown. Those
 *   are different claims and the dashboard reports them differently.
 */

import { describe, expect, it } from 'vitest';
import {
  catalogueInterventions,
  extractCatalogue,
  extractGapAreas,
  interventionsCost,
  parseAssessmentCsv,
  parseMoney,
  resolveLga,
} from './assessment-source.mjs';

/**
 * A miniature of the real file: same four header rows, same duplicate column
 * names, one two-intervention gap and one single-intervention gap.
 */
function fixture(rows) {
  const header = [
    'Facility and readiness overview,,,,,,,,,,,,Technical Infrastructure,,,,,,,Workforce Capacity,,,,Summary',
    [
      'Facility UUID',
      'State',
      'LGA',
      'Facility name',
      'Facility group',
      'Functionality',
      'Zone',
      'Overall readiness for EMR deployment',
      'Technical infrastructure readiness for EMR use',
      'Workforce readiness for EMR use',
      'Workflow readiness for EMR use',
      'Data-use readiness for EMR use',
      'Power gap',
      'Intervention 1',
      'When action is needed',
      'Cost 1 (₦)',
      'Intervention 2',
      'When action is needed',
      'Cost 2 (₦)',
      'Training gap',
      'Intervention 1',
      'When action is needed',
      'Cost 1 (₦)',
      'Total gaps',
    ].join(','),
  ];
  return ['title', 'scope note', header[0], header[1], ...rows].join('\n');
}

/** One data row. `power` and `training` are [value, ...interventions]. */
const row = ({ uuid = 'u1', power = ['No gap', '', '', '₦0', '', '', '₦0'], training = ['No gap', '', '', '₦0'] } = {}) =>
  [
    uuid,
    'kano',
    'dala',
    'some_health_post',
    'BHCPF',
    'Functional L1',
    'north_west',
    'Not Ready for EMR deployment',
    'Not Ready for EMR use',
    'Ready for EMR use',
    'Ready for EMR use',
    'Ready for EMR use',
    ...power,
    ...training,
    '1',
  ]
    .map((c) => (String(c).includes(',') ? `"${c}"` : c))
    .join(',');

const CRITICAL = 'Critical gap to fix before EMR deployment';
const LONG_TERM = 'Optional long-term improvement after EMR deployment';

const POWER_NONE = [
  'No functional electricity source or 0 hours/day',
  'Install solar panels and batteries.',
  CRITICAL,
  '₦3000000',
  'Connect the facility to the electricity grid.',
  LONG_TERM,
  '₦500000',
];

describe('parseAssessmentCsv', () => {
  it('locates gap blocks positionally, not by header name', () => {
    const { blocks } = parseAssessmentCsv(fixture([row()]));

    expect(blocks.map((b) => b.subDomain)).toEqual(['Power', 'Training']);
    expect(blocks[0]).toMatchObject({ col: 12, domain: 'technical_infrastructure' });
    expect(blocks[1]).toMatchObject({ col: 19, domain: 'workforce_capacity' });

    // The point of the whole exercise: two blocks, both with columns headed
    // `Intervention 1` / `When action is needed` / `Cost 1 (₦)`, resolved to
    // different positions. A name lookup would collapse these.
    expect(blocks[0].slots).toEqual([
      { label: 13, when: 14, cost: 15 },
      { label: 16, when: 17, cost: 18 },
    ]);
    expect(blocks[1].slots).toEqual([{ label: 20, when: 21, cost: 22 }]);
  });

  it('forward-fills the sparse domain row', () => {
    const { blocks } = parseAssessmentCsv(fixture([row()]));
    // "Workforce Capacity" is named once, above column 19; Training inherits it.
    expect(blocks[1].domain).toBe('workforce_capacity');
  });

  it('rejects a file with no gap columns', () => {
    const noGaps = ['title', 'note', 'Overview', 'Facility UUID,State', 'u1,kano'].join('\n');
    expect(() => parseAssessmentCsv(noGaps)).toThrow(/No gap columns/);
  });
});

describe('extractGapAreas', () => {
  it('gives every gap column an id, its domain and the sheet\u2019s order', () => {
    const { blocks } = parseAssessmentCsv(fixture([row()]));

    expect(extractGapAreas(blocks)).toEqual([
      { id: 'power', domain: 'technical_infrastructure', label: 'Power', order: 0 },
      { id: 'training', domain: 'workforce_capacity', label: 'Training', order: 1 },
    ]);
  });
});

describe('extractCatalogue', () => {
  it('makes one entry per (area, condition), carrying its interventions', () => {
    const { blocks, rows } = parseAssessmentCsv(fixture([row({ power: POWER_NONE })]));
    const catalogue = extractCatalogue(rows, blocks);

    expect(catalogue).toHaveLength(1);
    expect(catalogue[0]).toMatchObject({
      domain: 'technical_infrastructure',
      area: 'power',
      label: 'No functional electricity source or 0 hours/day',
      severity: 'blocking',
    });
    expect(catalogue[0].variants).toHaveLength(1);
    const actions = catalogueInterventions(catalogue[0]);
    expect(actions.map((i) => i.horizon)).toEqual(['critical', 'long_term']);
    expect(actions.map((i) => i.costNGN)).toEqual([3_000_000, 500_000]);
  });

  it('collapses the same condition across rows into one entry', () => {
    const { blocks, rows } = parseAssessmentCsv(
      fixture([row({ uuid: 'u1', power: POWER_NONE }), row({ uuid: 'u2', power: POWER_NONE })]),
    );
    const catalogue = extractCatalogue(rows, blocks);
    expect(catalogue).toHaveLength(1);
    expect(catalogue[0].variants).toHaveLength(1);
  });

  it('keeps both ways a condition is costed, as variants of one condition', () => {
    // The revised costing model's central move: the same gap draws the full
    // solar install at one facility and a cheaper top-up at another. Two
    // variants of one condition, not two conditions and not a conflict — a
    // reader filtering on "no power" must still find both facilities.
    const cheaper = [...POWER_NONE];
    cheaper[1] = 'Add solar panels or batteries so EMR equipment has power for at least nine hours.';
    cheaper[3] = '₦1200000';
    const { blocks, rows } = parseAssessmentCsv(
      fixture([row({ uuid: 'u1', power: POWER_NONE }), row({ uuid: 'u2', power: cheaper })]),
    );
    const catalogue = extractCatalogue(rows, blocks);

    expect(catalogue).toHaveLength(1);
    expect(catalogue[0].variants).toHaveLength(2);
    expect(catalogue[0].variants.map((v) => interventionsCost(v).costNGN)).toEqual([
      3_500_000, 1_700_000,
    ]);
  });

  it('throws when one condition is blocking at one facility and not at another', () => {
    // Severity is what the deployment band is computed from, so this is the one
    // disagreement between variants that cannot be carried. Price may vary;
    // whether the gap stops a deployment may not.
    const softened = [...POWER_NONE];
    softened[2] = LONG_TERM;
    const { blocks, rows } = parseAssessmentCsv(
      fixture([row({ uuid: 'u1', power: POWER_NONE }), row({ uuid: 'u2', power: softened })]),
    );

    expect(() => extractCatalogue(rows, blocks)).toThrow(/blocking at facility/);
    // The message has to name both rows, or nobody can find the disagreement
    // in a 2,806-row sheet.
    expect(() => extractCatalogue(rows, blocks)).toThrow(/u1[\s\S]*u2/);
  });

  it('keeps a gap that has no intervention at all', () => {
    // 81 real facilities carry a partly working backup power supply with no
    // action behind it. It still counts toward Total gaps, so it stays in the
    // catalogue — as a gap that cannot block anything.
    const { blocks, rows } = parseAssessmentCsv(
      fixture([row({ training: ['Training over 1 year ago', '', '', '₦0'] })]),
    );
    const [gap] = extractCatalogue(rows, blocks);

    expect(catalogueInterventions(gap)).toEqual([]);
    expect(gap.severity).toBe('partial');
    expect(interventionsCost(catalogueInterventions(gap))).toEqual({ costNGN: 0, unpriced: 0 });
  });

  it('rejects an unrecognised urgency rather than guessing', () => {
    const bad = [...POWER_NONE];
    bad[2] = 'Sometime soon';
    const { blocks, rows } = parseAssessmentCsv(fixture([row({ power: bad })]));
    expect(() => extractCatalogue(rows, blocks)).toThrow(/Sometime soon/);
  });
});

describe('the two source repairs', () => {
  it('holds the missing-urgency repair to its own column', () => {
    // A blank urgency is read as `minor` for Physical service-point and nowhere
    // else. Applied to a power action it would be a guess about a critical
    // blocker, so the parse stops instead.
    const blank = [...POWER_NONE];
    blank[2] = '';
    expect(() => parseAssessmentCsv(fixture([row({ power: blank })]))).toThrow(
      /no "when action is needed" value/,
    );
  });

  it('holds the `0` repair to its own column', () => {
    expect(() => parseAssessmentCsv(fixture([row({ training: ['0', '', '', '₦0'] })]))).toThrow(
      /appears as a Training gap value/,
    );
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
