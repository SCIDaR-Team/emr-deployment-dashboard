/**
 * Check the dashboard's figures against the workbook's own summaries.
 *
 *     npm run data:check                    # the last `data:sync` download
 *     npm run data:check -- --local <path>  # another copy of the workbook
 *
 * The ERA dashboard workbook summarises its own facility sheet: readiness by
 * facility group, functionality, state and zone; the plan's cost split by
 * readiness and by category; and what each of its fourteen fix packages makes
 * Ready, nationally and per state. This works the same figures out from
 * `public/data/` — with the dashboard's own code, the functions its pages call
 * — and compares them, so a figure the dashboard shows that the workbook does
 * not stops the sync.
 *
 * These checks used to be tests with the workbook's figures written into them,
 * which every new revision of the workbook broke. Here the figures are read
 * from the workbook itself, so a revision needs no code change — only a
 * disagreement does.
 *
 * The tables are found by their headings, not their positions. A heading the
 * check cannot find stops it and names the heading, as a moved column stops
 * the other builds. Package costs are not compared: the workbook prices its
 * packages differently (per facility needing the fix, not per facility made
 * Ready).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import {
  COST_CATEGORIES,
  readinessCostBy,
  readinessTotals,
  type BreakdownId,
} from '../src/lib/costByReadiness';
import { SCENARIO_PACKAGES } from '../src/lib/gapCatalogue';
import { scenarioBand, scenarioFor } from '../src/lib/scenarios';
import type { Band, FacilitySummary, ScenarioComponentId } from '../src/lib/types';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_WORKBOOK = resolve(ROOT, 'scripts/source-data/era-dashboard.xlsx');
const SUMMARY = 'Summary of gaps and readiness';
const COSTS = 'Cost summary';

/** How far a naira figure may sit from the workbook's: the tablet price is
 *  ₦700,000 ÷ 3, which the sheet rounds and the dashboard carries exactly. */
const NAIRA_TOLERANCE = 1;

type Cell = string | number;
type Grid = Cell[][];

const norm = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');

// ---------------------------------------------------------------------------
// Reading the workbook
// ---------------------------------------------------------------------------

class Missing extends Error {}

/** The first cell matching `test`, scanning row by row. */
function findCell(grid: Grid, test: (v: string, r: number, c: number) => boolean) {
  for (let r = 0; r < grid.length; r += 1) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c += 1) if (test(norm(row[c]), r, c)) return { r, c };
  }
  return null;
}

const at = (grid: Grid, r: number, c: number) => grid[r]?.[c] ?? '';

/** The breakdowns the workbook's tables list, and the dashboard's key for each. */
const BREAKDOWN_KEY: Record<string, (f: FacilitySummary) => string> = {
  overall: () => 'all facilities',
  'facility group': (f) => (f.isBHCPF ? 'bhcpf' : 'non-bhcpf'),
  functionality: (f) => norm(f.functionalityLevel),
  state: (f) => norm(f.state),
  zone: (f) => norm(f.zone),
};
const BREAKDOWN_ID: Record<string, BreakdownId | null> = {
  overall: null,
  'facility group': 'group',
  functionality: 'functionality',
  state: 'state',
  zone: 'zone',
};

interface Row {
  breakdown: string;
  group: string;
  /** As the workbook writes it, for the report: "State: Kano". */
  label: string;
  values: number[];
}

/**
 * A "Breakdown | Group | Ready | Moderately ready | Not ready | …" table whose
 * header's Breakdown cell is at (r, c): its rows, until the Breakdown column
 * holds something that is not a breakdown.
 */
function breakdownRows(grid: Grid, r: number, c: number, where: string): Row[] {
  const heads = [2, 3, 4].map((i) => norm(at(grid, r, c + i)));
  if (
    !heads[0]?.startsWith('ready') ||
    !heads[1]?.startsWith('moderately ready') ||
    !heads[2]?.startsWith('not ready')
  ) {
    throw new Missing(
      `${where}: expected Ready, Moderately Ready and Not Ready columns after ` +
        `"Breakdown | Group", found ${heads.map((h) => JSON.stringify(h)).join(', ')}.`,
    );
  }
  const rows: Row[] = [];
  for (let i = r + 1; i < grid.length; i += 1) {
    const breakdown = norm(at(grid, i, c));
    if (!(breakdown in BREAKDOWN_KEY)) break;
    rows.push({
      breakdown,
      group: norm(at(grid, i, c + 1)),
      label: `${String(at(grid, i, c)).trim()}: ${String(at(grid, i, c + 1)).trim()}`,
      values: [2, 3, 4].map((k) => Number(at(grid, i, c + k))),
    });
  }
  if (!rows.length) throw new Missing(`${where}: the table has no rows.`);
  return rows;
}

/** The fixes a package or block heading names, by the words it uses. */
function fixesNamed(text: string): Set<ScenarioComponentId> {
  const t = norm(text);
  const found = new Set<ScenarioComponentId>();
  if (t.includes('router')) found.add('router');
  if (t.includes('fibrex')) found.add('fibrex');
  if (t.includes('solar top')) found.add('solar_topup');
  if (t.includes('full solar')) found.add('full_solar');
  if (t.includes('network extension')) found.add('network_extension');
  if (t.includes('starlink') || t.includes('satellite')) found.add('satellite');
  return found;
}

const sameFixes = (a: Set<string>, b: readonly string[]) =>
  a.size === b.length && b.every((x) => a.has(x));

// ---------------------------------------------------------------------------
// Comparing
// ---------------------------------------------------------------------------

interface Check {
  name: string;
  compared: number;
  mismatches: string[];
}

const BANDS: Band[] = ['ready', 'moderately_ready', 'not_ready'];
const BAND_NAME: Record<Band, string> = {
  ready: 'Ready',
  moderately_ready: 'Moderately ready',
  not_ready: 'Not ready',
};

function compare(
  check: Check,
  label: string,
  workbook: number[],
  dashboard: number[],
  tolerance = 0,
) {
  BANDS.forEach((band, i) => {
    check.compared += 1;
    const w = workbook[i]!;
    const d = dashboard[i]!;
    if (!Number.isFinite(w) || Math.abs(w - d) > tolerance) {
      const fmt = (n: number) => (tolerance ? Math.round(n).toLocaleString('en-GB') : String(n));
      check.mismatches.push(
        `${label}, ${BAND_NAME[band]}: workbook ${Number.isFinite(w) ? fmt(w) : JSON.stringify(workbook[i])}, dashboard ${fmt(d)}`,
      );
    }
  });
}

/** Facilities in a breakdown's group, keyed as the workbook names groups. */
function groupsOf(facilities: FacilitySummary[], breakdown: string) {
  const key = BREAKDOWN_KEY[breakdown]!;
  const groups = new Map<string, FacilitySummary[]>();
  for (const f of facilities) {
    const k = key(f);
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  return groups;
}

const countBands = (fs: FacilitySummary[], band: (f: FacilitySummary) => Band | null) =>
  BANDS.map((b) => fs.filter((f) => band(f) === b).length);

function checkCounts(summary: Grid, facilities: FacilitySummary[]): Check {
  const check: Check = { name: `Facilities by readiness (${SUMMARY})`, compared: 0, mismatches: [] };
  const head = findCell(summary, (v, r, c) => v === 'breakdown' && norm(at(summary, r, c + 1)) === 'group');
  if (!head) throw new Missing(`${SUMMARY}: no table headed "Breakdown | Group".`);
  for (const row of breakdownRows(summary, head.r, head.c, SUMMARY)) {
    const fs = groupsOf(facilities, row.breakdown).get(row.group) ?? [];
    compare(check, row.label, row.values, countBands(fs, (f) => f.deploymentBand));
  }
  return check;
}

function checkCosts(costs: Grid, facilities: FacilitySummary[]): Check {
  const check: Check = { name: `Cost by readiness (${COSTS})`, compared: 0, mismatches: [] };
  const head = findCell(costs, (v) => v === 'when action is needed');
  if (!head) throw new Missing(`${COSTS}: no table headed "When action is needed".`);
  for (const row of breakdownRows(costs, head.r, head.c, `${COSTS}, "When action is needed"`)) {
    const id = BREAKDOWN_ID[row.breakdown];
    let cost: Record<Band, number> | undefined;
    if (id === null) cost = readinessTotals(facilities).cost;
    else cost = readinessCostBy(facilities, id!).find((r) => norm(r.label) === row.group)?.cost;
    compare(
      check,
      row.label,
      row.values,
      BANDS.map((b) => cost?.[b] ?? 0),
      NAIRA_TOLERANCE,
    );
  }
  return check;
}

/** The workbook's category names where they differ from the dashboard's. */
const CATEGORY_ALIAS: Record<string, string> = {
  'physical infrastructure across service point': 'service_points',
};

function checkCategories(costs: Grid, facilities: FacilitySummary[]): Check {
  const check: Check = { name: `Cost by category (${COSTS})`, compared: 0, mismatches: [] };
  const head = findCell(
    costs,
    (v, r, c) => v === 'broad category' && norm(at(costs, r, c - 1)) === 'domain',
  );
  if (!head) throw new Missing(`${COSTS}: no table headed "Domain | Broad category".`);
  const rows = readinessCostBy(facilities, 'category');
  const seen = new Set<string>();
  for (let i = head.r + 1; i < costs.length; i += 1) {
    const label = norm(at(costs, i, head.c));
    if (!label || norm(at(costs, i, head.c - 1)) === 'total') break;
    const values = [1, 2, 3].map((k) => Number(at(costs, i, head.c + k)));
    const id =
      CATEGORY_ALIAS[label] ?? COST_CATEGORIES.find((c) => norm(c.label) === label)?.id ?? null;
    const row = rows.find((r) => r.id === id);
    if (row) seen.add(row.id);
    else if (values.some((v) => v !== 0)) {
      // The dashboard lists only the categories that carry money; one it does
      // not list must cost nothing.
      check.mismatches.push(
        `"${at(costs, i, head.c)}" costs money in the workbook, but the dashboard has no such category`,
      );
      continue;
    }
    compare(check, `Category: ${at(costs, i, head.c)}`, values, BANDS.map((b) => row?.cost[b] ?? 0), NAIRA_TOLERANCE);
  }
  for (const c of COST_CATEGORIES) {
    if (!seen.has(c.id)) check.mismatches.push(`The workbook has no category "${c.label}"`);
  }
  return check;
}

function checkPackages(costs: Grid, facilities: FacilitySummary[]): Check {
  const check: Check = { name: `Fix packages, nationally (${COSTS})`, compared: 0, mismatches: [] };
  const head = findCell(costs, (v) => v === 'packages / interventions');
  if (!head) throw new Missing(`${COSTS}: no table headed "Packages / Interventions".`);
  const column = (heading: string) => {
    const row = costs[head.r] ?? [];
    const c = row.findIndex((v, i) => i > head.c && norm(v) === heading);
    if (c === -1) throw new Missing(`${COSTS}: no "${heading}" column in the packages table.`);
    return c;
  };
  const unlockedCol = column('additional facilities unlocked');
  const readyCol = column('cumulative ready facilities');

  const matched = new Set<string>();
  for (let i = head.r + 1; i < costs.length; i += 1) {
    const label = String(at(costs, i, head.c)).trim();
    if (!label) break;
    if (norm(label) === 'baseline') continue;
    const fixes = fixesNamed(label);
    const pkg = SCENARIO_PACKAGES.find((p) => sameFixes(fixes, p.components));
    if (!pkg) {
      check.mismatches.push(`The workbook's package "${label}" is not one the dashboard knows`);
      continue;
    }
    matched.add(pkg.id);
    const r = scenarioFor(facilities, pkg);
    for (const [what, w, d] of [
      ['unlocked', Number(at(costs, i, unlockedCol)), r.unlocked],
      ['Ready in all', Number(at(costs, i, readyCol)), r.distribution.ready],
    ] as const) {
      check.compared += 1;
      if (w !== d) check.mismatches.push(`${pkg.label}, ${what}: workbook ${w}, dashboard ${d}`);
    }
  }
  for (const p of SCENARIO_PACKAGES) {
    if (!matched.has(p.id)) check.mismatches.push(`The workbook has no package "${p.label}"`);
  }
  return check;
}

/**
 * The per-package blocks — "DEPLOYMENT READINESS WHEN ROUTER ONLY IS
 * INTRODUCED" and so on — each a readiness table by facility group,
 * functionality, state and zone with that package funded.
 */
function checkPackageBlocks(costs: Grid, facilities: FacilitySummary[]): Check {
  const check: Check = { name: `Fix packages, by group and state (${COSTS})`, compared: 0, mismatches: [] };
  const matched = new Set<string>();
  for (let r = 0; r < costs.length; r += 1) {
    const row = costs[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const title = norm(row[c]);
      if (!title.startsWith('deployment readiness when')) continue;
      const fixes = fixesNamed(title);
      if (!fixes.size) continue; // "…the different packages…": the table above.
      const pkg = SCENARIO_PACKAGES.find((p) => sameFixes(fixes, p.components));
      if (!pkg) {
        check.mismatches.push(`The block "${row[c]}" names no package the dashboard knows`);
        continue;
      }
      let head = -1;
      for (let i = r + 1; i < Math.min(costs.length, r + 12); i += 1) {
        if (norm(at(costs, i, c)) === 'breakdown') {
          head = i;
          break;
        }
      }
      if (head === -1) throw new Missing(`${COSTS}: the block "${row[c]}" has no "Breakdown" table.`);
      matched.add(pkg.id);
      const band = (f: FacilitySummary) => scenarioBand(f, pkg.components);
      for (const t of breakdownRows(costs, head, c, `${COSTS}, "${row[c]}"`)) {
        const fs = groupsOf(facilities, t.breakdown).get(t.group) ?? [];
        compare(check, `${pkg.label}, ${t.label}`, t.values, countBands(fs, band));
      }
    }
  }
  for (const p of SCENARIO_PACKAGES) {
    if (!matched.has(p.id)) check.mismatches.push(`The workbook has no block for "${p.label}"`);
  }
  return check;
}

// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const local = argv.indexOf('--local');
  const path = local === -1 ? DEFAULT_WORKBOOK : resolve(argv[local + 1] ?? '');
  if (!existsSync(path)) {
    throw new Error(`No workbook at ${path}. Run \`npm run data:sync\`, or pass --local <path>.`);
  }
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', sheets: [SUMMARY, COSTS] });
  const sheet = (name: string): Grid => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Missing(`The workbook has no sheet "${name}".`);
    return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' });
  };
  const summary = sheet(SUMMARY);
  const costs = sheet(COSTS);

  const raw = JSON.parse(readFileSync(resolve(ROOT, 'public/data/facilities-summary.json'), 'utf8'));
  const facilities: FacilitySummary[] = Array.isArray(raw) ? raw : raw.facilities;

  const checks = [
    checkCounts(summary, facilities),
    checkCosts(costs, facilities),
    checkCategories(costs, facilities),
    checkPackages(costs, facilities),
    checkPackageBlocks(costs, facilities),
  ];

  let failed = 0;
  for (const c of checks) {
    const ok = !c.mismatches.length;
    process.stderr.write(
      `${ok ? '✓' : '✗'} ${c.name}: ${c.compared} figures compared` +
        (ok ? ', all agree\n' : `, ${c.mismatches.length} disagree\n`),
    );
    for (const m of c.mismatches.slice(0, 20)) process.stderr.write(`    ${m}\n`);
    if (c.mismatches.length > 20) process.stderr.write(`    …and ${c.mismatches.length - 20} more\n`);
    failed += c.mismatches.length;
  }
  if (failed) {
    throw new Error(
      `\nThe dashboard's figures disagree with the workbook's own summaries in ${failed} ` +
        `place(s). Nothing should be published until they agree: either the workbook's ` +
        `summaries are out of step with its facility sheet, or the dashboard reads it wrongly.`,
    );
  }
}

try {
  main();
} catch (e) {
  process.stderr.write(`${(e as Error).message}\n`);
  if (e instanceof Missing) {
    process.stderr.write(
      'The workbook’s layout has changed where this check reads it — update scripts/check-workbook.ts.\n',
    );
  }
  process.exit(1);
}
