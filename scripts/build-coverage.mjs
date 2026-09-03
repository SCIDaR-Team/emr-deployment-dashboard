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
 * ## Two blocks, and the second one is the arithmetic behind the first
 *
 * The sheet's left block is the readable summary — state, two rates, a band.
 * Its right block is where the internet rate comes from: a subscription count
 * per operator across three access technologies, a `Total`, and the NBS 2025
 * population projection. The rate is simply `Total / population`, and this
 * script checks that in every row rather than taking it on trust.
 *
 * That is also what makes a *national* rate computable without averaging
 * anything: sum the subscriptions, sum the population, divide. Averaging 37
 * rates would weight Bayelsa's 3.0m like Kano's 17.6m and land 1.6 points off.
 *
 * Electricity has no such numerator — only the rate — so no national figure
 * can be rebuilt from the states. The sheet supplies one instead, NDHS 2024's
 * own published national rate, and that is what this reads. Re-aggregating the
 * state column would give 57.2% population-weighted against the survey's
 * stated 50.5%, because NDHS computes nationally from its weighted sample and
 * not by averaging its own state estimates. A derived figure that contradicts
 * the source by nearly seven points is not a better one.
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
 * The eleven operator columns, in the sheet's own order, under the three access
 * technologies it groups them by.
 *
 * Located by these header labels rather than by column position — the block
 * sits to the right of a column of source links and a change there shifts it.
 *
 * Four of them (`ipnx`, `inq`, `ntel`, `isp`) are `-` in all 37 rows today.
 * That is *not measured*, and it stays null rather than becoming zero: a
 * dashboard that prints 0 subscriptions for ipNX is making a claim the sheet
 * never made. Reported, not asserted — a provider gaining data later should
 * flow through without a code change.
 */
const PROVIDERS = [
  { id: 'mtn', header: 'MTN', label: 'MTN', group: 'mobile' },
  { id: 'glo', header: 'GLO', label: 'Glo', group: 'mobile' },
  { id: 'airtel', header: 'AIRTEL', label: 'Airtel', group: 'mobile' },
  { id: 'emts', header: 'EMTS', label: 'EMTS', group: 'mobile' },
  { id: 'ipnx', header: 'ipNX', label: 'ipNX', group: 'fixed' },
  { id: 'mtnFixed', header: 'MTN FIXED', label: 'MTN Fixed', group: 'fixed' },
  { id: 'inq', header: 'INQ', label: 'INQ', group: 'fixed' },
  { id: 'century21', header: '21ST CENT', label: '21st Century', group: 'wifi' },
  { id: 'smile', header: 'SMILE', label: 'Smile', group: 'wifi' },
  { id: 'ntel', header: 'NTEL', label: 'NTEL', group: 'wifi' },
  { id: 'isp', header: 'ISP', label: 'ISP', group: 'wifi' },
];

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

    // The subscription block shares this header row for its operator names and
    // the row above it for the three group spans and the three totals.
    const group = rows[i - 1] ?? [];
    const groupCells = group.map((c) => String(c ?? '').trim());
    const find = (cells, label, what) => {
      const at = cells.indexOf(label);
      if (at === -1) {
        throw new Error(
          `No "${label}" column for ${what}. The subscription block's layout ` +
            `has changed; this script reads it by header label, so the label ` +
            `needs updating rather than a column number.`,
        );
      }
      return at;
    };

    const providers = PROVIDERS.map((p) => ({
      ...p,
      at: find(cells, p.header, `operator ${p.id}`),
    }));

    // "State" appears three times in this row — once per block. The one that
    // labels the subscription rows is the last one *before* the operators;
    // taking the last overall picks up the NDHS block further right, whose
    // rows are ordered by geopolitical zone and would mispair every state.
    const firstProvider = Math.min(...providers.map((p) => p.at));
    const state2 = cells.reduce(
      (best, c, at) => (c === 'State' && at < firstProvider ? at : best),
      -1,
    );
    if (state2 === -1 || state2 === state) {
      throw new Error(
        'No State column between the summary block and the operator columns — ' +
          'the subscription block cannot be paired to a state by name.',
      );
    }

    // `National Coverage` labels the cell beside it — NDHS 2024's own national
    // electricity rate, and the one figure here that is not per-state.
    const nationalLabel = find(groupCells, 'National Coverage', 'the national electricity rate');

    return {
      rows,
      header: i,
      col: {
        state,
        electricity,
        internet,
        level,
        // The second block's own State column, cross-checked row by row against
        // the first: the two are separate lists in one sheet and a row inserted
        // into one of them would silently pair Kano's rates with Katsina's
        // subscriptions.
        state2,
        providers,
        total: find(groupCells, 'Total', 'total subscriptions'),
        population: find(
          groupCells,
          'NBS Population Projection by state (2025)',
          'the population denominator',
        ),
        rate: find(groupCells, 'Active internet subscription rate', 'the subscription rate'),
        nationalElectricity: nationalLabel + 1,
      },
    };
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

    // --- The subscription block, on the same row ----------------------------

    const name2 = String(cells[col.state2] ?? '').trim();
    if (name2 !== name) {
      throw new Error(
        `Row ${row + 1} pairs "${name}" in the summary block with "${name2}" in ` +
          `the subscription block. They are two separate lists in one sheet, so ` +
          `a row inserted into one of them shifts every pairing below it — and ` +
          `every rate downstream would belong to the wrong state.`,
      );
    }

    const byProvider = {};
    for (const p of col.providers) {
      const v = cells[p.at];
      // A dash is the sheet's "not measured". Anything else non-numeric is not
      // something to guess at.
      if (typeof v === 'number') byProvider[p.id] = v;
      else if (v == null || String(v).trim() === '-' || String(v).trim() === '') {
        byProvider[p.id] = null;
      } else {
        throw new Error(
          `${name}: ${p.header} reads ${JSON.stringify(v)} — expected a count, ` +
            `or "-" for not measured.`,
        );
      }
    }

    const total = cells[col.total];
    const population = cells[col.population];
    const rate = cells[col.rate];
    for (const [what, v] of [['total subscriptions', total], ['population', population]]) {
      if (typeof v !== 'number' || !(v > 0)) {
        throw new Error(`${name}: ${what} reads ${JSON.stringify(v)} — expected a count above 0.`);
      }
    }

    // The operators must account for the Total, or the breakdown is not a
    // breakdown of anything. Exact in all 37 rows; the ±1 is for a future
    // rounded cell, not for slack.
    const summed = col.providers.reduce((a, p) => a + (byProvider[p.id] ?? 0), 0);
    if (Math.abs(summed - total) > 1) {
      throw new Error(
        `${name}: the eleven operator columns sum to ${summed.toLocaleString()} but ` +
          `Total says ${total.toLocaleString()}. Either an operator column was ` +
          `added and this script has not been told about it, or Total no longer ` +
          `means what it says.`,
      );
    }

    // And the rate must be that Total over that population — the relationship
    // the national figure is rebuilt from, so it cannot be assumed.
    if (Math.abs(total / population - rate) > 1e-6) {
      throw new Error(
        `${name}: Total / population is ${(total / population).toFixed(6)} but the ` +
          `rate column says ${rate}. The national rate is computed as ` +
          `sum(subscriptions) / sum(population), which is only the same method ` +
          `as the sheet's while this holds.`,
      );
    }

    // The two blocks state the same rate twice; they must agree.
    if (Math.abs(internet - rate) > 1e-9) {
      throw new Error(
        `${name}: the summary block says the subscription rate is ${internet} and ` +
          `the subscription block says ${rate}.`,
      );
    }

    states.push({
      id,
      name,
      electricityAccessPct: pct(electricity),
      internetSubscriptionPct: pct(internet),
      band,
      population,
      subscriptions: total,
      byProvider,
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

  // --- The national reading -------------------------------------------------
  //
  // Internet: summed, not averaged. Each state's rate is its own subscriptions
  // over its own population, so the national rate is the same division done on
  // the totals — one method at both levels, and no weighting decision to get
  // wrong. (A plain mean of the 37 rates lands 1.6 points low.)
  const population = states.reduce((a, s) => a + s.population, 0);
  const subscriptions = states.reduce((a, s) => a + s.subscriptions, 0);

  // Electricity: taken from the sheet, because it cannot be rebuilt. Only the
  // rate is given per state, never a numerator, and re-aggregating the column
  // contradicts the survey's own national figure — see the note at the top.
  const nationalElectricity = (rows[header - 1] ?? [])[col.nationalElectricity];
  if (typeof nationalElectricity !== 'number' || !(nationalElectricity > 1) || nationalElectricity > 100) {
    throw new Error(
      `The national electricity rate reads ${JSON.stringify(nationalElectricity)}, ` +
        `expected a whole percentage between 1 and 100.\n\nNote this cell is a ` +
        `whole percent (50.5) where the state column is a fraction (0.842) — if ` +
        `it now reads below 1 the sheet has switched it to a fraction and it ` +
        `needs multiplying, not passing through.`,
    );
  }

  const national = {
    electricityAccessPct: Number(nationalElectricity.toFixed(1)),
    internetSubscriptionPct: Number(((100 * subscriptions) / population).toFixed(1)),
    population,
    subscriptions,
    byProvider: Object.fromEntries(
      PROVIDERS.map((p) => {
        const reporting = states.filter((s) => s.byProvider[p.id] != null);
        // Null where no state reports it at all — summing nulls to 0 would
        // turn "not measured" into "none", which is a different claim.
        return [
          p.id,
          reporting.length ? reporting.reduce((a, s) => a + s.byProvider[p.id], 0) : null,
        ];
      }),
    ),
  };

  const nationalSummed = PROVIDERS.reduce((a, p) => a + (national.byProvider[p.id] ?? 0), 0);
  if (nationalSummed !== subscriptions) {
    throw new Error(
      `National operator totals sum to ${nationalSummed.toLocaleString()} against ` +
        `${subscriptions.toLocaleString()} subscriptions.`,
    );
  }

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        source: 'National Coverage.xlsx',
        sheet,
        note:
          'Generated by scripts/build-coverage.mjs — do not edit. Rates are ' +
          'percentages, 0–100 (internet exceeds 100 where subscriptions per ' +
          'head do). Counts are absolute. A null operator is not measured, ' +
          'never zero. Bands are the sheet’s own Readiness Level column and ' +
          'the national electricity rate is the sheet’s own figure; neither ' +
          'is derived here.',
        providers: PROVIDERS.map(({ id, label, group }) => ({ id, label, group })),
        national,
        states,
      },
      null,
      2,
    )}\n`,
  );

  const counts = Object.fromEntries(
    Object.values(BAND_BY_LEVEL).map((b) => [b, states.filter((s) => s.band === b).length]),
  );
  const silent = PROVIDERS.filter((p) => national.byProvider[p.id] == null);
  process.stderr.write(
    `\n  national-coverage.json: ${states.length} states from ${sheet}\n` +
      `  not ready ${counts.not_ready} · moderately ${counts.moderately_ready} · ` +
      `ready ${counts.ready}\n` +
      `  cross-checked against the sheet's own summary (${
        Object.keys(tally).length
      } levels)\n` +
      `  national: electricity ${national.electricityAccessPct}% (the sheet's own) · ` +
      `internet ${national.internetSubscriptionPct}% ` +
      `(${subscriptions.toLocaleString()} / ${population.toLocaleString()})\n` +
      // Reported rather than asserted: a provider the sheet never fills in is a
      // fact about the source, and a count in the build output makes it visible
      // without inventing a threshold for how many is too many.
      (silent.length
        ? `  not measured in any state: ${silent.map((p) => p.label).join(', ')}\n`
        : '') +
      `\n`,
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`\n✗ ${err.message}\n\n`);
  process.exit(1);
}
