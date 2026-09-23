/**
 * Export the ERA dashboard workbook's facility gap sheet to the committed CSV
 * that `data:ingest` reads.
 *
 *     npm run data:gaps
 *     npm run data:gaps -- --local <path>
 *
 * The workbook is 54 MB and gitignored; the sheet this reads is one of its
 * eighteen, "List of gaps and interventions" — one row per assessed facility,
 * every gap, the action it calls for, when, and at what cost. The CSV written
 * here is that sheet and nothing else, committed so the ingest can run on a
 * clone that does not hold the workbook and so a change to the source shows up
 * as a reviewable diff.
 *
 * Numbers are written raw, never as the sheet displays them. The tablet price
 * is ₦700,000 ÷ 3 and the sheet shows it rounded; the ingest needs the full
 * value to recover how many tablets a facility's cost cell is paying for.
 *
 * Re-running with an unchanged workbook produces no diff.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from 'xlsx';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKBOOK = resolve(ROOT, 'ERA Dashboard dataset.xlsx');
const OUT = resolve(ROOT, 'List of gaps and interventions per facility.csv');

/** Matched on its trimmed name: the workbook carries it with a trailing space. */
const SHEET = 'List of gaps and interventions';

function workbookPath(argv) {
  const i = argv.indexOf('--local');
  if (i !== -1) {
    const path = argv[i + 1];
    if (!path) throw new Error('--local needs a path');
    return resolve(process.cwd(), path);
  }
  return WORKBOOK;
}

function main() {
  const path = workbookPath(process.argv.slice(2));
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}.\n\nIt is deliberately not in the repository. The CSV ` +
        `this script writes is committed, so you need the workbook only to ` +
        `refresh that CSV, and not at all to rebuild public/data/.`,
    );
  }

  const buffer = readFileSync(path);
  // Resolve the exact (untrimmed) name from the directory first, so only the
  // one sheet is parsed out of a 50 MB file.
  const names = XLSX.read(buffer, { type: 'buffer', bookSheets: true }).SheetNames;
  const name = names.find((n) => n.trim() === SHEET);
  if (!name) {
    throw new Error(`No sheet named "${SHEET}" in ${path}. Sheets: ${names.join(', ')}`);
  }

  const wb = XLSX.read(buffer, { type: 'buffer', sheets: [name] });
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], {
    rawNumbers: true,
    blankrows: false,
    strip: false,
  });

  writeFileSync(OUT, csv.endsWith('\n') ? csv : `${csv}\n`);
  const rows = csv.split('\n').filter(Boolean).length;
  process.stderr.write(`Wrote ${OUT}\n  ${rows} lines from "${name.trim()}"\n`);
}

main();
