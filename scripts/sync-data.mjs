/**
 * Refresh the dashboard's data from the published ERA dashboard workbook.
 *
 *     npm run data:sync                    # download, then rebuild
 *     npm run data:sync -- --no-download   # rebuild from the last download
 *
 * The workbook is a Google Sheet published to the web as .xlsx (the whole
 * document — not a single sheet, and not CSV, which writes numbers as the
 * sheet displays them, "₦3,085,000"). Its link is `ERA_WORKBOOK_URL`, from the
 * environment or `.env.local`.
 *
 * Downloads it once, then runs the builds that read it, in order, each with all
 * its checks:
 *
 *   data:gaps      "List of gaps and interventions" → the committed facility CSV
 *   data:maturity  "State Maturity"                 → scripts/source-data/state-maturity.json
 *   data:ingest    the CSV, the maturity JSON, the coverage JSON and the raw
 *                  survey workbook (positions)       → public/data/
 *
 * A failed check stops the run and changes nothing after it; the files it has
 * already rewritten are in the working tree, so `git diff` shows exactly where
 * the new data parted from the old. Nothing is committed here — review the
 * diff first. The scheduled job runs this same command.
 *
 * Not yet from the workbook: the coverage table (`data:coverage` still reads
 * `National Coverage.xlsx`) and facility positions (`ERA dataset_v4 (1).xlsx`).
 * See docs/DATA_INVENTORY.md.
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The downloaded copy. Git-ignored: 55 MB, and the published link is the source. */
const WORKBOOK = resolve(ROOT, 'scripts/source-data/era-dashboard.xlsx');

function workbookUrl() {
  if (process.env.ERA_WORKBOOK_URL) return process.env.ERA_WORKBOOK_URL.trim();
  const envFile = resolve(ROOT, '.env.local');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^\s*ERA_WORKBOOK_URL\s*=\s*"?([^"\n]+)"?/m);
    if (m) return m[1].trim();
  }
  return null;
}

async function download(url) {
  process.stderr.write('Downloading the published workbook (about 55 MB; two to three minutes)…\n');
  const started = Date.now();
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`The workbook link answered ${res.status}.`);
  mkdirSync(dirname(WORKBOOK), { recursive: true });
  // Written beside the last good copy and swapped in only when complete, so a
  // failed download never leaves half a workbook for the next run.
  const partial = `${WORKBOOK}.partial`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(partial));
  const head = readFileSync(partial).subarray(0, 2).toString('latin1');
  const bytes = statSync(partial).size;
  if (head !== 'PK' || bytes < 1_000_000) {
    // A Google error page is small HTML; an .xlsx is a zip, which starts "PK".
    throw new Error(
      `The link returned ${bytes} bytes that are not an .xlsx workbook. Check it is ` +
        `published as the entire document in Microsoft Excel (.xlsx) format.`,
    );
  }
  renameSync(partial, WORKBOOK);
  process.stderr.write(
    `  ${(bytes / 1e6).toFixed(1)} MB in ${Math.round((Date.now() - started) / 1000)}s\n`,
  );
}

function run(label, script, args = []) {
  process.stderr.write(`\n▸ ${label}\n`);
  const r = spawnSync(process.execPath, [resolve(ROOT, script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    throw new Error(
      `${label} stopped (exit ${r.status}). The message above says what in the workbook ` +
        `broke the check. Nothing after this step ran.`,
    );
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.includes('--no-download')) {
    const url = workbookUrl();
    if (!url) throw new Error('No ERA_WORKBOOK_URL — add it to .env.local (see .env.example).');
    await download(url);
  } else if (!existsSync(WORKBOOK)) {
    throw new Error(`--no-download, but there is no earlier download at ${WORKBOOK}.`);
  }

  run('Facility gaps and interventions', 'scripts/build-gaps-csv.mjs', ['--local', WORKBOOK]);
  run('State Maturity', 'scripts/build-maturity.mjs', ['--local', WORKBOOK]);
  run('Dashboard data', 'scripts/ingest-assessment.mjs');

  process.stderr.write('\nDone. Review `git diff --stat`, then commit what changed.\n');
}

main().catch((e) => {
  process.stderr.write(`\n${e.message}\n`);
  process.exit(1);
});
