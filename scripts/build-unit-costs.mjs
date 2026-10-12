/**
 * Export the ERA dashboard workbook's unit-cost table to the committed JSON
 * that `data:ingest` prices from.
 *
 *     npm run data:unit-costs
 *     npm run data:unit-costs -- --local <path>
 *
 * The sheet is "Unit_costs_and_assumptions": one row per cost item, with the
 * cost reference the gap rules name it by and its unit cost. The facility
 * sheet charges several of the items it documents at ₦0, or leaves them
 * blank — workflow configuration, the data-use routines, device maintenance.
 * The plan prices those from this table instead (`TAB_PRICED` in
 * `assessment-source.mjs`), so the table is committed beside the gaps CSV and
 * a change to a price shows up as a reviewable diff.
 *
 * Only the first table is read — the per-facility cost items. The roadmap,
 * training and operating-cost assumptions below it are state- or year-level
 * and price nothing in the facility plan.
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
const SHEET = 'Unit_costs_and_assumptions';

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
  const name = names.find((n) => n.trim() === SHEET);
  if (!name) throw new Error(`No sheet named "${SHEET}" in ${path}. Sheets: ${names.join(', ')}`);

  const wb = XLSX.read(buffer, { type: 'buffer', sheets: [name] });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });

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
}

main();
