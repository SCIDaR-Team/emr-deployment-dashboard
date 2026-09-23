/**
 * The scoping invariants, checked against the real dataset.
 *
 * The Gap area filter narrows *which gaps are counted*, not only which
 * facilities are in scope. Get that wrong and the pane prints the national
 * total under a Technical Infrastructure heading — which it did: 30,200 gaps
 * and ₦6.0bn where the domain's own row two lines below read 18,310 and
 * ₦5.9bn.
 *
 * So these are not unit tests of a helper. They assert the arithmetic the
 * screen shows, at every level the screen shows it — national, state, LGA and
 * facility — and against the aggregates `public/data` publishes independently.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const facilities = read('public/data/facilities-summary.json');
const national = read('public/data/national.json');
const states = read('public/data/states.json');
const lgas = read('public/data/lgas.json');

/**
 * The catalogue, lifted out of the generated module.
 *
 * `src/lib/gapCatalogue.ts` is TypeScript and this is a plain node test, so the
 * arrays are parsed out of it rather than imported. Reading the generated file
 * is the point: a test importing its own copy of the catalogue would pass while
 * the app used a different one.
 */
function catalogueFromModule() {
  const text = readFileSync(join(ROOT, 'src/lib/gapCatalogue.ts'), 'utf8');
  const slice = (name) => {
    const start = text.indexOf(`export const ${name}`);
    // The assignment, not the `GapDef[]` type annotation between the two — the
    // first `[` after the name is that annotation's, and it closes immediately.
    const open = text.indexOf('= [', start) + 2;
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === '[') depth += 1;
      else if (text[i] === ']') {
        depth -= 1;
        if (depth === 0) return JSON.parse(text.slice(open, i + 1));
      }
    }
    throw new Error(`Could not slice ${name} out of gapCatalogue.ts`);
  };
  return { GAPS: slice('GAPS'), GAP_AREAS: slice('GAP_AREAS'), ACTIONS: slice('ACTIONS') };
}

const { GAPS, GAP_AREAS, ACTIONS } = catalogueFromModule();
const GAP_BY_ID = new Map(GAPS.map((g) => [g.id, g]));
const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
const DOMAIN_IDS = [
  'technical_infrastructure',
  'workforce_capacity',
  'workflow_transition',
  'data_use_reporting',
];

/**
 * What a gap costs *at one facility* — `facilityGapCost`, reimplemented.
 *
 * The facility's own quantities matter: one buys two tablets and another
 * five, so a price read off the catalogue alone would be wrong at nearly every
 * facility — which is exactly the drift these tests exist to catch.
 */
const gapCost = (f, g) =>
  g.actions.reduce((sum, id) => {
    const qty = f.actions[id];
    const unit = ACTION_BY_ID.get(id).unitCostNGN;
    return qty && unit !== null ? sum + unit * qty : sum;
  }, 0);

/** `offeredGapIds`, reimplemented from the catalogue the app ships. */
function offeredGapIds(domains, gapAreas) {
  const areas = gapAreas.length ? new Set(gapAreas) : null;
  const ids = new Set();
  for (const g of GAPS) {
    if (domains.length && !domains.includes(g.domain)) continue;
    if (areas && !areas.has(g.area)) continue;
    ids.add(g.id);
  }
  return ids;
}

/** What the pane's three headline tiles compute, for one population. */
function scopeTotals(rows, domains, gapAreas) {
  const offered = offeredGapIds(domains, gapAreas);
  let gaps = 0;
  let costNGN = 0;
  let affected = 0;
  for (const f of rows) {
    let hit = false;
    for (const id of f.gaps) {
      if (!offered.has(id)) continue;
      const gap = GAP_BY_ID.get(id);
      costNGN += gapCost(f, gap);
      // "No gap recorded" carries cost and is not a gap — `isRecordedGap`.
      if (!gap.recorded) continue;
      gaps += 1;
      hit = true;
    }
    if (hit) affected += 1;
  }
  return { gaps, costNGN, affected };
}

const areasOf = (domain) => GAP_AREAS.filter((a) => a.domain === domain).map((a) => a.id);

// Every level the pane renders, as populations of facilities.
const LEVELS = [
  { level: 'national', name: 'All assessed states', rows: facilities },
  ...[...new Set(facilities.map((f) => f.stateId))].map((id) => ({
    level: 'state',
    name: id,
    rows: facilities.filter((f) => f.stateId === id),
  })),
  ...[...new Set(facilities.map((f) => `${f.stateId}.${f.lgaId}`))].map((key) => ({
    level: 'lga',
    name: key,
    rows: facilities.filter((f) => `${f.stateId}.${f.lgaId}` === key),
  })),
];

describe('the catalogue is a clean three-level tree', () => {
  it('puts every gap in exactly one area, and every area in one domain', () => {
    for (const g of GAPS) {
      const area = GAP_AREAS.find((a) => a.id === g.area);
      expect(area, `gap ${g.id} names area ${g.area}`).toBeDefined();
      expect(area.domain, `gap ${g.id} disagrees with its area's domain`).toBe(g.domain);
    }
    expect(GAP_AREAS).toHaveLength(20);
    expect(new Set(GAP_AREAS.map((a) => a.id)).size).toBe(20);
  });

  it('ties every facility action to a condition the facility carries', () => {
    for (const f of facilities) {
      const areas = new Set(f.gaps.map((id) => GAP_BY_ID.get(id).area));
      for (const [id, qty] of Object.entries(f.actions)) {
        const action = ACTION_BY_ID.get(id);
        expect(action, `${f.uuid} names unknown action ${id}`).toBeDefined();
        expect(areas.has(action.area), `${f.uuid}: ${id} has no condition in ${action.area}`).toBe(true);
        expect(Number.isInteger(qty) && qty > 0, `${f.uuid}: ${id} × ${qty}`).toBe(true);
        const gap = f.gaps.map((g) => GAP_BY_ID.get(g)).find((g) => g.area === action.area);
        expect(gap.actions, `${f.uuid}: ${gap.id} does not list ${id}`).toContain(id);
      }
    }
  });

  it('gives every facility at most one condition per area', () => {
    for (const f of facilities) {
      const seen = new Set();
      for (const id of f.gaps) {
        const area = GAP_BY_ID.get(id).area;
        expect(seen.has(area), `${f.uuid} carries two conditions in ${area}`).toBe(false);
        seen.add(area);
      }
    }
  });
});

describe('selecting a domain’s areas equals selecting the domain', () => {
  it.each(DOMAIN_IDS)('%s, at every level', (domain) => {
    for (const { level, name, rows } of LEVELS) {
      const byDomain = scopeTotals(rows, [domain], []);
      const byAreas = scopeTotals(rows, [], areasOf(domain));
      expect(byAreas, `${level} ${name}`).toEqual(byDomain);
    }
  });

  it('holds for each facility on its own', () => {
    for (const domain of DOMAIN_IDS) {
      for (const f of facilities) {
        expect(scopeTotals([f], [], areasOf(domain)), `${f.uuid} · ${domain}`).toEqual(
          scopeTotals([f], [domain], []),
        );
      }
    }
  });
});

describe('the parts sum to the whole', () => {
  it('every area, added up, is the unfiltered total — at every level', () => {
    for (const { level, name, rows } of LEVELS) {
      const whole = scopeTotals(rows, [], []);
      const summed = GAP_AREAS.reduce(
        (acc, a) => {
          const part = scopeTotals(rows, [], [a.id]);
          return { gaps: acc.gaps + part.gaps, costNGN: acc.costNGN + part.costNGN };
        },
        { gaps: 0, costNGN: 0 },
      );
      expect(summed.gaps, `${level} ${name} gaps`).toBe(whole.gaps);
      expect(summed.costNGN, `${level} ${name} cost`).toBeCloseTo(whole.costNGN, 2);
    }
  });

  it('every domain, added up, is the unfiltered total — at every level', () => {
    for (const { level, name, rows } of LEVELS) {
      const whole = scopeTotals(rows, [], []);
      const summed = DOMAIN_IDS.reduce(
        (acc, d) => {
          const part = scopeTotals(rows, [d], []);
          return { gaps: acc.gaps + part.gaps, costNGN: acc.costNGN + part.costNGN };
        },
        { gaps: 0, costNGN: 0 },
      );
      expect(summed.gaps, `${level} ${name} gaps`).toBe(whole.gaps);
      expect(summed.costNGN, `${level} ${name} cost`).toBeCloseTo(whole.costNGN, 2);
    }
  });
});

describe('the screen agrees with the published aggregates', () => {
  // `deployment.costByDomain` and `costByHorizon` are **naira, not counts** — the ingest
  // accumulates `iv.costNGN` into both. Compared to the kobo, not exactly: the
  // tablet price is a third of a naira off whole, and two sums of the same
  // thirds in a different order differ in the last floating-point bits. Worth stating here because the field
  // names do not, and `gapCount` beside them is a count.
  const check = (label, rows, deployment) => {
    const whole = scopeTotals(rows, [], []);
    expect(whole.gaps, `${label} gapCount`).toBe(deployment.gapCount);
    expect(whole.costNGN, `${label} costNGN`).toBeCloseTo(deployment.costNGN, 2);
    for (const d of DOMAIN_IDS) {
      expect(scopeTotals(rows, [d], []).costNGN, `${label} costByDomain.${d}`).toBeCloseTo(
        deployment.costByDomain[d],
        2,
      );
    }
  };

  it('national', () => check('national', facilities, national.deployment));

  it('every state', () => {
    for (const s of states) {
      if (!s.deployment) continue;
      check(s.id, facilities.filter((f) => f.stateId === s.id), s.deployment);
    }
  });

  it('every LGA', () => {
    for (const l of lgas) {
      if (!l.deployment) continue;
      check(l.id, facilities.filter((f) => `${f.stateId}.${f.lgaId}` === l.id), l.deployment);
    }
  });

  it('every facility’s own stored totals', () => {
    for (const f of facilities) {
      expect(scopeTotals([f], [], []).gaps, `${f.uuid} gapCount`).toBe(f.gapCount);
      expect(scopeTotals([f], [], []).costNGN, `${f.uuid} costNGN`).toBeCloseTo(f.costNGN, 2);
      for (const d of DOMAIN_IDS) {
        expect(scopeTotals([f], [d], []).costNGN, `${f.uuid} costByDomain.${d}`).toBeCloseTo(
          f.costByDomain[d],
          2,
        );
      }
    }
  });
});
