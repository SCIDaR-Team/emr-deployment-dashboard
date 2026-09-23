/**
 * Build `scripts/source-data/state-maturity.json` from the ERA dashboard
 * workbook's State Maturity sheet.
 *
 *     npm run data:maturity
 *     npm run data:maturity -- --local <path>
 *
 * The state-level reading National Coverage paints, and the one Assessed
 * States fills its twelve surveyed states with. It replaces two earlier desk
 * sources as the band on the map: the coverage workbook's electricity/internet
 * classification, and the leadership workbook's four governance answers. This
 * sheet scores all six together:
 *
 *   Governance Structure                     is there a body that owns this
 *   State-specific Data Governance Policy    is there a policy for the data
 *   State-specific Digital Health Strategy   is there a strategy to sit under
 *   Financial Commitment for EMR             is there money behind it
 *   Electricity                              the state's access rate, scored
 *   Internet                                 the state's subscription rate, scored
 *
 * Each is scored 5 / 3 / 1, the six are averaged into `Total`, and the mean is
 * cut at >= 4 MATURE, >= 3 MODERATELY MATURE, < 3 NOT MATURE.
 *
 * ## Maturity is written as a `Band`
 *
 * The dashboard has one three-way scale, with one set of colours and icons, and
 * maturity is the same shape: three ordered levels and "not assessed". So
 * MATURE is written as `ready`, MODERATELY MATURE as `moderately_ready` and NOT
 * MATURE as `not_ready`. The pages that show it label it in maturity's own
 * words (`MATURITY_LABEL` in `src/lib/bands.ts`), so the reader never sees
 * "Ready" for a state that the sheet calls Mature.
 *
 * ## Six states are not assessed, and they stay null
 *
 * Gombe, Yobe, Kebbi, Enugu, Delta and Ogun have no scores and read "Not
 * assessed". They are written with a null band, never as Not mature: a state
 * nobody has scored must not read as a state that failed.
 *
 * ## The governance rows are bands, on the sheet's own scale
 *
 * The pane shows the four governance answers under the state (Yes / Partial /
 * No). They are written out as bands because a single 5, 3 or 1 put through
 * the sheet's own cut points lands exactly on a level, so the mapping is the
 * sheet's arithmetic and not this script's. Electricity and Internet are not written out; the pane already
 * shows the two rates they were scored from.
 *
 * ## What this script refuses to do
 *
 * The band written out is always the sheet's own `Readiness` column. The rule
 * below is reimplemented *only* to check the sheet against itself. Beyond that:
 *
 *   - `Total` must be the plain mean of the six scores.
 *   - The Electricity and Internet scores must agree with the rates in
 *     `national-coverage.json` (under 50% scores 1, over 75% scores 5, 3
 *     between). That is what stops a row pairing one state's name with
 *     another's scores.
 *   - All 37 states must be present, once each.
 *
 * The mean is checked here and dropped: "bands, not scores" is a type-level
 * invariant, and there is no `number` in `AreaProfile` to rank states by.
 *
 * The workbook is gitignored like the other source workbooks, and this
 * script's *output* is committed. `data:ingest` reads the JSON and never the
 * workbook.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from 'xlsx';

import { slugify } from './assessment-source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKBOOK = resolve(ROOT, 'ERA Dashboard dataset.xlsx');
const SHEET = 'State Maturity';
const OUT = resolve(ROOT, 'scripts/source-data/state-maturity.json');
const COVERAGE = resolve(ROOT, 'scripts/source-data/national-coverage.json');

/**
 * The four governance items the pane reports, in the sheet's own column order.
 *
 * The `id` is what the dashboard keys on (`LeadershipSubDomainId`) and must
 * stay stable; the `header` is the sheet's wording and may drift.
 */
const SUB_DOMAINS = [
  { id: 'governance_structure', header: 'Governance Structure' },
  { id: 'data_governance_policy', header: 'State-specific Data Governance Policy' },
  { id: 'digital_health_strategy', header: 'State-specific Digital Health Strategy' },
  { id: 'financial_commitment', header: 'Financial Commitment for EMR' },
];

/** The two access items. Scored by the sheet from published rates, and
 *  checked against those rates below. */
const ACCESS = [
  { id: 'electricity', header: 'Electricity', rate: 'electricityAccessPct' },
  { id: 'internet', header: 'Internet', rate: 'internetSubscriptionPct' },
];

const SCORES = new Set([1, 3, 5]);

/** The sheet's three levels, in its own (upper-case) spelling. */
const BAND_BY_LEVEL = {
  'NOT MATURE': 'not_ready',
  'MODERATELY MATURE': 'moderately_ready',
  MATURE: 'ready',
};

const NOT_ASSESSED = 'NOT ASSESSED';

/**
 * The banding rule, as the sheet's own numbers state it.
 *
 * A cross-check, never the read. Reproduces all 31 of the sheet's
 * classifications: Rivers 4.0 is Mature, Anambra and Oyo at 3.0 are Moderately
 * mature, Abia at 2.67 is Not mature.
 */
function levelFromScore(score) {
  if (score >= 4) return 'MATURE';
  if (score >= 3) return 'MODERATELY MATURE';
  return 'NOT MATURE';
}

/**
 * How the sheet scores an access rate (a percentage), from the state
 * readiness profile's own ranges: under 50%, 50-74%, over 75%.
 */
function scoreFromRate(pct) {
  if (pct < 50) return 1;
  if (pct > 75) return 5;
  return 3;
}

const BAND_RANK = { not_ready: 1, moderately_ready: 2, ready: 3 };

/** The sheet writes the capital as `FCT`, which slugifies straight onto the
 *  codebase's id; kept as a table so a spelling drift is one line. */
const ID_ALIAS = { fct_abuja: 'fct' };

const stateIdFor = (name) => {
  const slug = slugify(name);
  return ID_ALIAS[slug] ?? slug;
};

const cellText = (v) => String(v ?? '').trim();

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
 * Find the header row by its own labels rather than trusting a row number. The
 * table sits under a "Scoring" caption, and a row added above it would
 * otherwise slide the read onto the wrong rows.
 */
function locateHeader(rows) {
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] ?? []).map(cellText);
    const state = cells.indexOf('State');
    if (state === -1) continue;

    const at = {};
    for (const item of [...SUB_DOMAINS, ...ACCESS]) {
      at[item.id] = cells.indexOf(item.header);
    }
    // A header cell may carry a trailing space ("Total "), so these are
    // matched after trimming.
    const total = cells.indexOf('Total');
    const readiness = cells.indexOf('Readiness');
    if (Object.values(at).includes(-1) || total === -1 || readiness === -1) continue;

    return { row: i, state, at, total, readiness };
  }

  throw new Error(
    `No header row in "${SHEET}" carrying State, the six scored items ` +
      `(${[...SUB_DOMAINS, ...ACCESS].map((s) => s.header).join(', ')}), Total ` +
      `and Readiness.\n\nThe table is located by header label, so a renamed ` +
      `column needs the SUB_DOMAINS / ACCESS tables in this script updating ` +
      `rather than a column number.`,
  );
}

function main() {
  const argv = process.argv.slice(2);
  const path = workbookPath(argv);

  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}.\n\n` +
        `It is deliberately not in the repository, like the other source ` +
        `workbooks. Everything it feeds is already committed — ` +
        `scripts/source-data/state-maturity.json and public/data/ — so you ` +
        `need this file only to rebuild that JSON, and not at all to build or ` +
        `run the app.`,
    );
  }

  // Only the one sheet is parsed: the workbook is 50 MB, almost all of it in
  // facility-level sheets this script has no use for.
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', sheets: [SHEET] });
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`No sheet named "${SHEET}" in ${path}.`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, raw: true });
  const head = locateHeader(rows);

  const coverage = JSON.parse(readFileSync(COVERAGE, 'utf8'));
  const ratesByState = new Map(coverage.states.map((s) => [s.id, s]));

  const states = [];
  const seen = new Map();

  // Rows until the first blank State — the table has nothing below it today,
  // and a note added under it must not be read as a state.
  for (let i = head.row + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const name = cellText(cells[head.state]);
    if (!name) break;

    const id = stateIdFor(name);
    if (seen.has(id)) throw new Error(`Two rows for ${id}: "${seen.get(id)}" and "${name}"`);
    seen.set(id, name);

    const level = cellText(cells[head.readiness]).toUpperCase();
    const raw = Object.fromEntries(
      [...SUB_DOMAINS, ...ACCESS].map((item) => [item.id, cells[head.at[item.id]]]),
    );

    // --- Not assessed: no scores at all, and a null band -------------------
    if (level === NOT_ASSESSED) {
      const stray = Object.entries(raw).filter(([, v]) => cellText(v) !== '');
      if (stray.length || cellText(cells[head.total]) !== '') {
        throw new Error(
          `${name}: reads "Not assessed" but carries scores ` +
            `(${stray.map(([k, v]) => `${k} ${v}`).join(', ') || 'a Total'}). ` +
            `Either the state has been scored and its Readiness is stale, or ` +
            `the scores are left over.`,
        );
      }
      states.push({ id, name, band: null, subDomains: null });
      continue;
    }

    // --- Scored ------------------------------------------------------------
    const band = BAND_BY_LEVEL[level];
    if (!band) {
      throw new Error(
        `${name}: unknown maturity level ${JSON.stringify(level)}. Expected one ` +
          `of ${[...Object.keys(BAND_BY_LEVEL), NOT_ASSESSED].map((l) => JSON.stringify(l)).join(', ')}.`,
      );
    }

    for (const [item, v] of Object.entries(raw)) {
      if (!SCORES.has(v)) {
        throw new Error(
          `${name}: ${item} scores ${JSON.stringify(v)} — expected 1, 3 or 5.`,
        );
      }
    }

    const total = cells[head.total];
    if (typeof total !== 'number') {
      throw new Error(`${name}: Total reads ${JSON.stringify(total)} — expected a number.`);
    }

    // Total is the plain mean of the six. The tolerance is for a rounded
    // cell, not for slack.
    const values = Object.values(raw);
    const mean = values.reduce((a, v) => a + v, 0) / values.length;
    if (Math.abs(mean - total) > 1e-6) {
      throw new Error(
        `${name}: the six scores average ${mean} but Total says ${total}. ` +
          `Either Total is no longer a plain mean of the six, or an item has ` +
          `been added and this script has not been told about it.`,
      );
    }

    const derived = levelFromScore(total);
    if (derived !== level) {
      throw new Error(
        `${name}: the sheet says "${level}" for a total of ${total}, but its ` +
          `own cut points give "${derived}". Do not relax this check — the ` +
          `sheet needs looking at.`,
      );
    }

    // The two access scores must be the published rates, scored. This is
    // what ties the row to the state named on it.
    const rates = ratesByState.get(id);
    if (!rates) {
      throw new Error(`${name}: no access rates in national-coverage.json to check against.`);
    }
    for (const item of ACCESS) {
      const expected = scoreFromRate(rates[item.rate]);
      if (raw[item.id] !== expected) {
        throw new Error(
          `${name}: ${item.header} scores ${raw[item.id]}, but the state's ` +
            `${item.rate} of ${rates[item.rate]}% scores ${expected}. Either ` +
            `the row belongs to another state or one of the two sources is ` +
            `stale.`,
        );
      }
    }

    const subDomains = {};
    for (const sub of SUB_DOMAINS) {
      subDomains[sub.id] = BAND_BY_LEVEL[levelFromScore(raw[sub.id])];
    }

    // The state's band is an average, so it sits between the weakest and the
    // strongest of its six items and nowhere outside them.
    const ranks = values.map((v) => BAND_RANK[BAND_BY_LEVEL[levelFromScore(v)]]);
    if (BAND_RANK[band] < Math.min(...ranks) || BAND_RANK[band] > Math.max(...ranks)) {
      throw new Error(`${name}: band ${band} is outside the range of its own six scores.`);
    }

    states.push({ id, name, band, subDomains });
  }

  // Every state the dashboard has, and nothing else.
  const known = new Set(
    JSON.parse(readFileSync(resolve(ROOT, 'public/data/states.json'), 'utf8')).map((s) => s.id),
  );
  const unknown = states.filter((s) => !known.has(s.id));
  const missing = [...known].filter((id) => !seen.has(id));
  if (unknown.length || missing.length) {
    throw new Error(
      `The maturity table does not line up with the dashboard's 37 states.\n` +
        (unknown.length
          ? `  unknown: ${unknown.map((s) => `"${s.name}" → ${s.id}`).join(', ')} ` +
            `(add the spelling to ID_ALIAS)\n`
          : '') +
        (missing.length ? `  missing: ${missing.join(', ')}\n` : ''),
    );
  }

  states.sort((a, b) => a.id.localeCompare(b.id));

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        source: 'ERA Dashboard dataset.xlsx',
        sheet: SHEET,
        note:
          'Generated by scripts/build-maturity.mjs — do not edit. One row per ' +
          "state. `band` is the sheet's own Readiness column, written on the " +
          'dashboard scale: MATURE → ready, MODERATELY MATURE → ' +
          'moderately_ready, NOT MATURE → not_ready, Not assessed → null. ' +
          'Each governance sub-domain band is its own 5 / 3 / 1 score put ' +
          "through the sheet's cut points (>= 4, >= 3), so a Yes lands on " +
          'ready, a Partial on moderately_ready and a No on not_ready.',
        subDomains: SUB_DOMAINS.map((s) => ({ id: s.id, label: s.header })),
        states,
      },
      null,
      2,
    )}\n`,
  );

  const tally = states.reduce((a, s) => {
    const k = s.band ?? 'not assessed';
    return { ...a, [k]: (a[k] ?? 0) + 1 };
  }, {});
  process.stderr.write(
    `Wrote ${states.length} maturity readings to ${OUT}\n` +
      `  ${Object.entries(tally)
        .map(([b, n]) => `${b} ${n}`)
        .join(' · ')}\n`,
  );
}

main();
