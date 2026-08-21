/**
 * The readiness rule, pinned to the assessment it was derived from.
 *
 * `classifyFacility` was not designed — it was fitted. The costing workbook
 * classifies 2,695 facilities, and the four domain bands determine the overall
 * band exactly: all 67 combinations that occur map to one value each, with no
 * contradictions anywhere in the file. `__fixtures__/readiness-combinations.json`
 * is that mapping, extracted once so this test does not need the 26 MB workbook.
 *
 * Two rules are checked here, and the difference between them is a decision the
 * programme made rather than a bug:
 *
 *   `sourceRule`      what the workbook does — four domains, data use able to
 *                     veto Ready. Reproduces the fixture exactly, which is the
 *                     evidence that the rule below was read off real data and
 *                     not invented.
 *
 *   `classifyFacility` what ships — three domains, data use dropped. Data use
 *                     carries gaps but no cost, so under the source rule 203
 *                     facilities sat one band below Ready with no funded work
 *                     left to do. The dashboard cannot offer a plan that closes
 *                     a facility's gaps and then declines to call it ready.
 *
 * The second test holds that difference to exactly that: the shipped rule may
 * differ from the source only by promoting Moderately ready to Ready, and only
 * where data use was the thing holding it down. Any other divergence is a bug
 * in the rule, not a policy choice, and should fail here.
 */

import { describe, expect, it } from 'vitest';
import { classifyFacility } from './gap-catalogue.mjs';
import fixture from './__fixtures__/readiness-combinations.json';

/** The workbook's own rule, including the data-use veto. */
function sourceRule(b) {
  const rank = { not_ready: 1, moderately_ready: 2, ready: 3 };
  const infra = rank[b.technical_infrastructure];
  const workforce = rank[b.workforce_capacity];
  if (infra === 1 || workforce === 1) return 'not_ready';
  if (
    infra === 3 &&
    workforce === 3 &&
    rank[b.workflow_transition] > 1 &&
    rank[b.data_use_reporting] > 1
  ) {
    return 'ready';
  }
  return 'moderately_ready';
}

describe('readiness classification', () => {
  it('has a fixture covering every combination in the assessment', () => {
    expect(fixture.combinations).toHaveLength(67);
    expect(fixture.facilities).toBe(2695);
  });

  it('reproduces the source model on all 67 combinations', () => {
    const wrong = fixture.combinations.filter((c) => sourceRule(c) !== c.overall);
    expect(wrong).toEqual([]);
  });

  it('differs from the source only by promoting Moderately ready to Ready', () => {
    const diffs = fixture.combinations.filter((c) => classifyFacility(c) !== c.overall);

    for (const c of diffs) {
      // Only ever upward, and only ever by one band.
      expect(c.overall).toBe('moderately_ready');
      expect(classifyFacility(c)).toBe('ready');
      // And only where data use was the sole thing holding it down.
      expect(c.data_use_reporting).toBe('not_ready');
      expect(c.technical_infrastructure).toBe('ready');
      expect(c.workforce_capacity).toBe('ready');
      expect(c.workflow_transition).not.toBe('not_ready');
    }

    // The size of the decision, so a change to it is visible in the diff.
    const moved = diffs.reduce((sum, c) => sum + c.facilities, 0);
    expect(moved).toBe(203);
  });

  it('never lets a supporting domain sink a facility', () => {
    for (const c of fixture.combinations) {
      if (c.technical_infrastructure !== 'not_ready' && c.workforce_capacity !== 'not_ready') {
        expect(classifyFacility(c)).not.toBe('not_ready');
      }
    }
  });

  it('sinks a facility whenever either core domain is not ready', () => {
    for (const c of fixture.combinations) {
      if (c.technical_infrastructure === 'not_ready' || c.workforce_capacity === 'not_ready') {
        expect(classifyFacility(c)).toBe('not_ready');
      }
    }
  });
});
