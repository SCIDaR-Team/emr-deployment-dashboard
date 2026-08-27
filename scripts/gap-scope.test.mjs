/**
 * The scoping invariants, checked against the real dataset.
 *
 * The Gap area filter narrows *which gaps are counted*, not only which
 * facilities are in scope. Get that wrong and the pane prints the national
 * total under a Technical Infrastructure heading — which it did: 30,557 gaps
 * and ₦16.3bn where the domain's own row two lines below read 18,667 and
 * ₦12.9bn.
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
  return { GAPS: slice('GAPS'), GAP_AREAS: slice('GAP_AREAS') };
}

const { GAPS, GAP_AREAS } = catalogueFromModule();
const GAP_BY_ID = new Map(GAPS.map((g) => [g.id, g]));
const DOMAIN_IDS = [
  'technical_infrastructure',
  'workforce_capacity',
  'workflow_transition',
  'data_use_reporting',
];

const gapCost = (g) =>
  g.interventions.reduce((sum, iv) => sum + (iv.costNGN ?? 0), 0);

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
      gaps += 1;
      costNGN += gapCost(GAP_BY_ID.get(id));
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
      expect(summed.costNGN, `${level} ${name} cost`).toBe(whole.costNGN);
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
      expect(summed.costNGN, `${level} ${name} cost`).toBe(whole.costNGN);
    }
  });
});

describe('the screen agrees with the published aggregates', () => {
  // `deployment.costByDomain` and `costByHorizon` are **naira, not counts** — the ingest
  // accumulates `iv.costNGN` into both. Worth stating here because the field
  // names do not, and `gapCount` beside them is a count.
  const check = (label, rows, deployment) => {
    const whole = scopeTotals(rows, [], []);
    expect(whole.gaps, `${label} gapCount`).toBe(deployment.gapCount);
    expect(whole.costNGN, `${label} costNGN`).toBe(deployment.costNGN);
    for (const d of DOMAIN_IDS) {
      expect(scopeTotals(rows, [d], []).costNGN, `${label} costByDomain.${d}`).toBe(
        deployment.costByDomain[d],
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
      expect(scopeTotals([f], [], []).costNGN, `${f.uuid} costNGN`).toBe(f.costNGN);
      for (const d of DOMAIN_IDS) {
        expect(scopeTotals([f], [d], []).costNGN, `${f.uuid} costByDomain.${d}`).toBe(
          f.costByDomain[d],
        );
      }
    }
  });
});
