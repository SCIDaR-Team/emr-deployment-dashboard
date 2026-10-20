/**
 * Export the ERA dashboard workbook's cost tables: the per-facility unit costs
 * to committed JSON, and the deployment costs the Investment Plan prices its
 * Train and deploy and Operations and TA sections from to a generated module.
 *
 *     npm run data:unit-costs
 *     npm run data:unit-costs -- --local <path>
 *
 * Both come from "Unit_costs_and_assumptions".
 *
 * - **The first table** is one row per cost item, with the cost reference the
 *   gap rules name it by and its unit cost. The plan prices remediation from
 *   the facility sheet, not from here; the table is committed beside the gaps
 *   CSV so a change to a price shows up as a reviewable diff.
 * - **The tables below it** price what is not a gap: the state training
 *   package, deployment validation, routine operations and state technical
 *   assistance. They are read by their row labels, under the heading of the
 *   table each sits in, and written to `src/lib/deploymentCosts.ts`.
 *
 * "Five year roadmap" supplies the two figures the Cost overview shows at 2027
 * prices: the training package and the routine-operations year, both with the
 * workbook's inflation applied.
 *
 * Re-running with an unchanged workbook produces no diff.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from 'xlsx';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKBOOK = resolve(ROOT, 'scripts/source-data/era-dashboard.xlsx');
const OUT = resolve(ROOT, 'scripts/source-data/unit-costs.json');
const OUT_MODULE = resolve(ROOT, 'src/lib/deploymentCosts.ts');
const SHEET = 'Unit_costs_and_assumptions';
const ROADMAP = 'Five year roadmap';

const norm = (v) => String(v ?? '').trim();

function workbookPath(argv) {
  const i = argv.indexOf('--local');
  if (i === -1) return WORKBOOK;
  const path = argv[i + 1];
  if (!path) throw new Error('--local needs a path');
  return resolve(process.cwd(), path);
}

function main() {
  const path = workbookPath(process.argv.slice(2));
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}.\n\nRun \`npm run data:sync\` to download the workbook, or pass ` +
        `--local with a copy of it. The JSON this writes is committed, so the workbook ` +
        `is needed only to refresh it.`,
    );
  }

  const buffer = readFileSync(path);
  const names = XLSX.read(buffer, { type: 'buffer', bookSheets: true }).SheetNames;
  const sheetName = (want) => {
    const n = names.find((x) => x.trim() === want);
    if (!n) throw new Error(`No sheet named "${want}" in ${path}. Sheets: ${names.join(', ')}`);
    return n;
  };
  const name = sheetName(SHEET);
  const roadmapName = sheetName(ROADMAP);

  const wb = XLSX.read(buffer, { type: 'buffer', sheets: [name, roadmapName] });
  const grid = (n) =>
    XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
  const rows = grid(name);

  // Found by its headings, not counted to: a column added to the sheet should
  // stop this with a message, not shift every price by one.
  const headerRow = rows.findIndex((r) => r.some((c) => norm(c) === 'Cost reference'));
  if (headerRow === -1) throw new Error(`${SHEET}: no "Cost reference" heading.`);
  const header = rows[headerRow].map(norm);
  const col = (heading) => {
    const c = header.indexOf(heading);
    if (c === -1) throw new Error(`${SHEET}: no "${heading}" column beside "Cost reference".`);
    return c;
  };
  const COL = {
    domain: col('Domain'),
    subdomain: col('Subdomain'),
    reference: col('Cost reference'),
    total: col('Total'),
    unit: col('Unit'),
  };

  const items = [];
  for (const row of rows.slice(headerRow + 1)) {
    const domain = norm(row[COL.domain]);
    const reference = norm(row[COL.reference]);
    // A component line of the item above it (the solar system's inverter,
    // battery, panels) has no reference of its own.
    if (!reference) {
      // The first table ends where the next section's title begins.
      if (domain && !norm(row[COL.subdomain])) break;
      continue;
    }
    const total = row[COL.total];
    if (typeof total !== 'number' || !Number.isFinite(total)) {
      throw new Error(`${SHEET}: "${reference}" has no numeric Total (${JSON.stringify(total)}).`);
    }
    if (items.some((i) => i.costReference === reference)) {
      throw new Error(`${SHEET}: "${reference}" is listed twice.`);
    }
    items.push({
      domain,
      subdomain: norm(row[COL.subdomain]),
      costReference: reference,
      unitCostNGN: total,
      unit: norm(row[COL.unit]) || null,
    });
  }
  if (!items.length) throw new Error(`${SHEET}: no cost items under the heading row.`);

  writeFileSync(OUT, `${JSON.stringify(items, null, 2)}\n`);
  process.stderr.write(`Wrote ${OUT}\n  ${items.length} cost items from "${name.trim()}"\n`);

  const costs = deploymentCosts(rows, grid(roadmapName));
  writeFileSync(OUT_MODULE, deploymentModule(costs));
  process.stderr.write(`Wrote ${OUT_MODULE}\n`);
}

// ---------------------------------------------------------------------------
// The deployment costs
// ---------------------------------------------------------------------------

/** Where a table starts: the row whose first filled cell begins with `heading`. */
function tableStart(rows, heading, where) {
  const i = rows.findIndex((r) => r.some((c) => norm(c).startsWith(heading)));
  if (i === -1) throw new Error(`${where}: no table headed "${heading}…".`);
  return i;
}

/**
 * The numbers on the row labelled `label`, searching down from `from` — so a
 * label the sheet uses twice ("Device maintenance" is a cost-item subdomain
 * and a routine-operations row) is read from the table it is asked for in.
 */
function numbersOn(rows, from, label, where) {
  for (let i = from; i < rows.length; i += 1) {
    const at = rows[i].findIndex((c) => norm(c) === label);
    if (at === -1) continue;
    return rows[i].slice(at + 1).filter((c) => typeof c === 'number' && Number.isFinite(c));
  }
  throw new Error(`${where}: no row labelled "${label}".`);
}

/** The first number on a row, which must be there and must be positive. */
function price(rows, from, label, where) {
  const [n] = numbersOn(rows, from, label, where);
  if (!(n > 0)) throw new Error(`${where}: "${label}" has no positive figure.`);
  return n;
}

function deploymentCosts(rows, roadmap) {
  const where = SHEET;
  const assumptions = tableStart(rows, 'Roadmap assessment and cost-escalation assumptions', where);
  const training = tableStart(rows, 'Proposed state deployment-cohort training package', where);
  const operations = tableStart(rows, 'Routine operations planning assumptions', where);
  const ta = tableStart(rows, 'Annual state technical-assistance and transition-support package', where);

  const [localFirmNGN, localFirmVisits] = numbersOn(
    rows,
    ta,
    'Local firm service charge for 6 months',
    where,
  );
  if (!(localFirmNGN > 0) || !(localFirmVisits > 0)) {
    throw new Error(`${where}: the local-firm row needs a unit cost and a quantity a year.`);
  }

  // The roadmap's money table: found by its "Cost driver" heading, with the
  // year and Total columns read off that heading row.
  const rw = ROADMAP;
  const head = roadmap.findIndex((r) => r.some((c) => norm(c) === 'Cost driver'));
  if (head === -1) throw new Error(`${rw}: no table with a "Cost driver" column.`);
  const col = (heading) => {
    const c = roadmap[head].findIndex((v) => norm(v) === heading);
    if (c === -1) throw new Error(`${rw}: no "${heading}" column beside "Cost driver".`);
    return c;
  };
  const cell = (label, c) => {
    const row = roadmap.slice(head + 1).find((r) => r.some((v) => norm(v) === label));
    if (!row) throw new Error(`${rw}: no row "${label}".`);
    const v = row[c];
    if (typeof v !== 'number' || !(v > 0)) {
      throw new Error(`${rw}: "${label}" has no figure under "${norm(roadmap[head][c])}".`);
    }
    return v;
  };

  return {
    inflationRate: price(rows, assumptions, 'Nigeria headline inflation rate', where),
    training: {
      days: price(rows, training, 'Training days per state', where),
      facilitators: price(rows, training, 'Facilitators per event', where),
      traineesPerFacility: price(rows, training, 'Trainees per go-live facility', where),
      facilitatorHonorariumNGN: price(rows, training, 'Facilitator honorarium', where),
      facilitatorTravelNGN: price(
        rows,
        training,
        'Facilitator return travel plus airport transfer',
        where,
      ),
      facilitatorAccommodationNGN: price(rows, training, 'DSA and Facilitator accommodation', where),
      venueNGN: price(rows, training, 'Venue', where),
      refreshmentsNGN: price(rows, training, 'Refreshments', where),
      participantTransportNGN: price(rows, training, 'Participant transport', where),
      materialsNGN: price(rows, training, 'SOPs, job aids and printing', where),
    },
    validationNGN: price(rows, assumptions, 'Deployment validation and launch assurance', where),
    operations: {
      internetNGN: price(rows, operations, 'Facility internet subscription', where),
      deviceMaintenanceNGN: price(rows, operations, 'Device maintenance', where),
    },
    ta: {
      localFirmNGN,
      localFirmVisits,
      coordinationNGN: price(
        rows,
        ta,
        'Communications, job aids and coordination allowance',
        where,
      ),
    },
    roadmap: {
      trainingNGN: cell('State deployment-cohort training package (₦)', col('Total')),
      operations2027NGN: cell(
        'Routine operations and continuous support — excluding solar maintenance',
        col('2027'),
      ),
    },
  };
}

function deploymentModule(costs) {
  return `/**
 * GENERATED by scripts/build-unit-costs.mjs — do not edit.
 *
 * What deploying costs beyond fixing the gaps, from the ERA workbook's
 * "Unit_costs_and_assumptions" sheet: the state training package, deployment
 * validation, routine operations and state technical assistance. Unit prices
 * and the rules they are multiplied by; \`deploymentCost.ts\` turns them into
 * lines for the states and facilities in view.
 *
 * \`roadmap\` is the two figures "Five year roadmap" costs at 2027 prices, with
 * the workbook's inflation applied — what the Cost overview shows.
 */

export const DEPLOYMENT_COSTS = ${JSON.stringify(costs, null, 2)} as const;
`;
}

main();
