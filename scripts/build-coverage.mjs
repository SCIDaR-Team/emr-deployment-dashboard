/**
 * Build `scripts/source-data/national-coverage.json` from the coverage workbook.
 *
 *     npm run data:coverage
 *     npm run data:coverage -- --local <path>
 *
 * The workbook is a *desk* model: two published national statistics per state
 * — electricity access and active internet subscription — and a readiness level
 * classified from them. It knows nothing about any individual facility, which
 * is precisely why it can speak about all 37 states when the facility survey
 * reaches 12. See the note on `CoverageProfile` in `src/lib/types.ts`.
 *
 * ## Why this is a separate step from `data:ingest`
 *
 * The workbook is gitignored, like the other source workbooks. This script's
 * *output* is committed — 37 rows of five fields, small enough to review in a
 * diff — and `data:ingest` reads that committed JSON, never the workbook. So a
 * clone can regenerate `public/data/` without holding a copy of the source, and
 * the one thing that does need the workbook is the one step nobody has to run.
 *
 * Re-running with an unchanged workbook produces no diff: nothing here is
 * ordered by anything but state id and nothing is timestamped.
 *
 * ## What this script refuses to do
 *
 * The sheet is hand-maintained, so every relationship the dashboard depends on
 * is checked here and a break stops the build. All of them hold in 37 of 37
 * rows today — none is speculative.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from 'xlsx';

import { slugify } from './assessment-source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKBOOK = resolve(ROOT, 'National Coverage.xlsx');
const OUT = resolve(ROOT, 'scripts/source-data/national-coverage.json');

/** The three levels the sheet classifies to, in its own spelling. */
const BAND_BY_LEVEL = {
  'Not Ready': 'not_ready',
  'Moderately Ready': 'moderately_ready',
  Ready: 'ready',
};

/**
 * The sheet spells the capital "FCT Abuja"; every id in this codebase is `fct`.
 *
 * The only name that does not slugify straight onto a state id — the other 36
 * match exactly, including the two-word ones ("Akwa Ibom" → `akwa_ibom`). Kept
 * as a table rather than a special case so a second spelling drift is one line.
 */
const ID_ALIAS = { fct_abuja: 'fct' };

const stateIdFor = (name) => {
  const slug = slugify(name);
  return ID_ALIAS[slug] ?? slug;
};

/**
 * The readiness rule, as the sheet states it in its own header block.
 *
 * Reimplemented here *only* to check the sheet against itself — the value
 * written out is always the sheet's own `Readiness Level` column. Nothing in
 * this codebase may derive a band from a measure (see `CoverageMeasures`), and
 * that includes this script: if the two ever disagree the build stops and the
 * sheet gets looked at, rather than this rule quietly winning.
 *
 * The sheet's wording of the middle case ("between 0-75%") overlaps the other
 * two as written. This is the reading that reproduces all 37 of its own
 * classifications: a floor either metric can trip, then a ceiling both must
 * clear.
 */
function levelFromRates(electricity, internet) {
  if (electricity < 0.5 || internet < 0.5) return 'Not Ready';
  if (electricity > 0.75 && internet > 0.75) return 'Ready';
  return 'Moderately Ready';
}

/** A rate as a percentage, one decimal — the unit every other measure uses. */
const pct = (v) => Number((v * 100).toFixed(1));

function workbookPath(argv) {
  const i = argv.indexOf('--local');
  if (i !== -1) {
    const path = argv[i + 1];
    if (!path) throw new Error('--local needs a path');
    return resolve(process.cwd(), path);
  }
  return WORKBOOK;
}

/**
 * Find the header row rather than trusting a row number.
 *
 * The table starts under two blocks of prose — the rule, and a column of source
 * links — and a row added to either shifts it. Anchored on the header's own
 * labels instead, so an edit above the table cannot silently slide the read
 * onto the wrong rows.
 */
function locateTable(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, raw: true });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const cells = row.map((c) => String(c ?? '').trim());
    const state = cells.indexOf('State');
    if (state === -1) continue;
    const electricity = cells.findIndex((c) => c.startsWith('Electricity Access Rate'));
    const internet = cells.findIndex((c) => c.startsWith('Internet Subscription Rate'));
    const level = cells.indexOf('Readiness Level');
    if (electricity === -1 || internet === -1 || level === -1) continue;
    // The sheet repeats "State" in a second block further right; the header we
    // want is the one whose four columns sit together.
    if (electricity !== state + 1) continue;
    return { rows, header: i, col: { state, electricity, internet, level } };
  }
  throw new Error(
    'No header row with State / Electricity Access Rate / Internet Subscription ' +
      'Rate / Readiness Level. The sheet layout has changed.',
  );
}

/**
 * The sheet's own summary block: a count per level, below the table.
 *
 * Found by shape rather than by position — a level name with an integer in the
 * next cell — because the block does not line up with the table's own columns
 * and there is nothing to say it will stay where it is. Anything it does not
 * find simply goes unchecked; this is a cross-check, not the read.
 */
function sheetTally(rows, from) {
  const tally = {};
  for (let i = from; i < rows.length; i++) {
    const row = rows[i] ?? [];
    for (let c = 0; c < row.length; c++) {
      const level = String(row[c] ?? '').trim();
      const count = row[c + 1];
      if (BAND_BY_LEVEL[level] && Number.isInteger(count)) tally[level] = count;
    }
  }
  return tally;
}

function main() {
  const argv = process.argv.slice(2);
  const path = workbookPath(argv);

  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}.\n\n` +
        `It is deliberately not in the repository, like the other source ` +
        `workbooks. Everything it feeds is already committed — ` +
        `scripts/source-data/national-coverage.json and public/data/ — so you ` +
        `need this file only to rebuild that JSON, and not at all to build or ` +
        `run the app.`,
    );
  }

  const buf = readFileSync(path);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.SheetNames[0];
  const ws = wb.Sheets[sheet];
  const { rows, header, col } = locateTable(ws);

  const states = [];
  const seen = new Map();
  let row = header + 1;
  for (; row < rows.length; row++) {
    const cells = rows[row] ?? [];
    const name = String(cells[col.state] ?? '').trim();
    if (!name) break; // The table ends at its first blank State.

    const electricity = cells[col.electricity];
    const internet = cells[col.internet];
    const level = String(cells[col.level] ?? '').trim();

    if (typeof electricity !== 'number' || typeof internet !== 'number') {
      throw new Error(
        `${name}: electricity ${JSON.stringify(electricity)} and internet ` +
          `${JSON.stringify(internet)} must both be numbers. A rate that arrived ` +
          `as text is a rate that would land in the dashboard as null.`,
      );
    }

    // Rates are stored as fractions. Internet subscription legitimately exceeds
    // 100% — subscriptions are counted per SIM and people hold more than one,
    // which is why Ogun reads 120.5% — so the ceiling is loose and only there
    // to catch a column that has switched to whole percents.
    for (const [what, v] of [['electricity', electricity], ['internet', internet]]) {
      if (!(v > 0) || v > 2) {
        throw new Error(
          `${name}: ${what} rate ${v} is outside 0–2. These columns are ` +
            `fractions; a value above 2 means the sheet has switched to whole ` +
            `percents and every figure downstream would be 100× too small.`,
        );
      }
    }

    const band = BAND_BY_LEVEL[level];
    if (!band) {
      throw new Error(
        `${name}: unknown readiness level ${JSON.stringify(level)}. Expected one ` +
          `of ${Object.keys(BAND_BY_LEVEL).map((l) => JSON.stringify(l)).join(', ')}.`,
      );
    }

    const derived = levelFromRates(electricity, internet);
    if (derived !== level) {
      throw new Error(
        `${name}: the sheet says "${level}" for electricity ${pct(electricity)}% ` +
          `and internet ${pct(internet)}%, but its own stated rule gives ` +
          `"${derived}".\n\nThe rule and the column agree in all 37 rows today. ` +
          `A disagreement means one of the two has been edited and the sheet ` +
          `needs looking at — do not relax this check.`,
      );
    }

    const id = stateIdFor(name);
    if (seen.has(id)) throw new Error(`Two rows for ${id}: "${seen.get(id)}" and "${name}"`);
    seen.set(id, name);

    states.push({
      id,
      name,
      electricityAccessPct: pct(electricity),
      internetSubscriptionPct: pct(internet),
      band,
    });
  }

  if (states.length !== 37) {
    throw new Error(
      `Read ${states.length} states, expected 37 (36 + FCT). A short read means ` +
        `the table gained a blank row in the middle; a long one means the read ` +
        `has run past its end.`,
    );
  }

  // Every id must be a state the dashboard actually has, or the reading is
  // dropped on the floor at merge time with nothing to show it happened.
  const known = new Set(
    JSON.parse(readFileSync(resolve(ROOT, 'public/data/states.json'), 'utf8')).map((s) => s.id),
  );
  const unknown = states.filter((s) => !known.has(s.id));
  if (unknown.length) {
    throw new Error(
      `${unknown.length} state name(s) do not resolve to a known state id: ` +
        unknown.map((s) => `"${s.name}" → ${s.id}`).join(', ') +
        `\n\nAdd the spelling to ID_ALIAS in this script.`,
    );
  }

  // The sheet counts its own levels below the table. Cross-checked because it
  // is the one figure in the workbook that is independent of the rows above it.
  const tally = sheetTally(rows, row);
  if (Object.keys(tally).length !== Object.keys(BAND_BY_LEVEL).length) {
    throw new Error(
      `Found ${Object.keys(tally).length} of ${Object.keys(BAND_BY_LEVEL).length} ` +
        `levels in the sheet's summary block. It is the only figure in the ` +
        `workbook independent of the table, so a missing one leaves the read ` +
        `unchecked rather than merely unconfirmed.`,
    );
  }
  for (const [level, expected] of Object.entries(tally)) {
    const actual = states.filter((s) => s.band === BAND_BY_LEVEL[level]).length;
    if (actual !== expected) {
      throw new Error(
        `The sheet's summary says ${expected} states are "${level}"; the table ` +
          `has ${actual}. One of the two is stale.`,
      );
    }
  }

  states.sort((a, b) => a.id.localeCompare(b.id));

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        source: 'National Coverage.xlsx',
        sheet,
        note:
          'Generated by scripts/build-coverage.mjs — do not edit. Rates are ' +
          'percentages, 0–100. Bands are the sheet’s own Readiness Level ' +
          'column, not derived here.',
        states,
      },
      null,
      2,
    )}\n`,
  );

  const counts = Object.fromEntries(
    Object.values(BAND_BY_LEVEL).map((b) => [b, states.filter((s) => s.band === b).length]),
  );
  process.stderr.write(
    `\n  national-coverage.json: ${states.length} states from ${sheet}\n` +
      `  not ready ${counts.not_ready} · moderately ${counts.moderately_ready} · ` +
      `ready ${counts.ready}\n` +
      `  cross-checked against the sheet's own summary (${
        Object.keys(tally).length
      } levels)\n\n`,
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`\n✗ ${err.message}\n\n`);
  process.exit(1);
}
