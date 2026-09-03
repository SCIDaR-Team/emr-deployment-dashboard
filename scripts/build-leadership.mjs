/**
 * Build `scripts/source-data/national-leadership.json` from the leadership
 * workbook.
 *
 *     npm run data:leadership
 *     npm run data:leadership -- --local <path>
 *
 * The third desk source, and the first one that is *not* about a rate.
 * `National Coverage.xlsx` classifies a state from two published statistics;
 * this sheet classifies it from four yes/no/partial answers about how the state
 * governs itself:
 *
 *   Governance Structure                     is there a body that owns this
 *   State-specific Data Governance Policy    is there a policy for the data
 *   State-specific Digital Health Strategy   is there a strategy to sit under
 *   Financial Commitment for EMR             is there money behind it
 *
 * ## It covers 27 states, not 37, and that is the point of the null
 *
 * Ten states have not been scored yet. They are simply absent from this file —
 * not written as zeroes, not written as "not ready". `ingest-assessment.mjs`
 * leaves their Leadership band null, and National Coverage already paints a
 * null band as no-data rather than as a failure. A state nobody has assessed
 * must never read as a state that failed an assessment.
 *
 * ## The answers *are* bands, on the sheet's own scale
 *
 * This is the load-bearing fact about this workbook and the reason the four
 * sub-domains are the only ones in the app that carry a readiness band.
 *
 * The sheet scores an answer Yes 5 / Partial 3 / No 1, and it bands a state by
 * cutting the mean of those four at >= 4 Ready, >= 3 Moderately ready, < 3 Not
 * ready. Both live on one 1-5 scale, so putting a single answer through the
 * sheet's own banding function lands it exactly on a band name:
 *
 *     Yes      -> 5 -> Ready
 *     Partial  -> 3 -> Moderately ready
 *     No       -> 1 -> Not ready
 *
 * That is not an analogy drawn by this codebase. It is the same function on the
 * same scale, and it is checked below rather than asserted: `levelFromScore`
 * must classify every answer's score, and every state's own band must sit
 * between the weakest and strongest of its four (true in 27 of 27 today).
 *
 * So what is written out is a `Band` per sub-domain, not a Yes/Partial/No. The
 * dashboard then speaks one vocabulary from the map down to the last row, and
 * the "sub-domains carry no band" rule earns its one documented exception —
 * these sub-domains are *classifications* from the model, where an electricity
 * access rate is a measurement. See `LeadershipBands` in `src/lib/types.ts`.
 *
 * What the mapping does **not** buy is a rollup: the sheet averages the four,
 * and averaging is neither of this codebase's two rules. Worst-wins would
 * disagree with the sheet on 7 of 27 states — Rivers is Ready with a Not-ready
 * sub-domain. The state band is therefore copied from the sheet, never rebuilt
 * from the four, and the pane says the source averages them.
 *
 * ## Two blocks, and the second one is the arithmetic behind the first
 *
 * The same shape as the coverage workbook. The upper block is the readable
 * answers — Yes / Partial / No per sub-domain. The lower block is those answers
 * scored 5 / 3 / 1, averaged into a `Total`, and banded into `Readiness`. The
 * two are checked against each other row by row here rather than taken on
 * trust, because they are two hand-maintained lists of the same 27 states and a
 * row inserted into one of them would pair Kano's answers with Katsina's score.
 *
 * ## What this script refuses to do
 *
 * The band written out is always the sheet's own `Readiness` column. The rule
 * below is reimplemented *only* to check the sheet against itself — nothing in
 * this codebase may derive a band (see `CoverageMeasures` in types.ts), and
 * that includes this script. If the two disagree the build stops and the sheet
 * gets looked at, rather than this rule quietly winning.
 *
 * Like `build-coverage.mjs`, the workbook is gitignored and this script's
 * *output* is committed. `data:ingest` reads the JSON and never the workbook,
 * so a clone can rebuild `public/data/` without holding a copy of the source.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from 'xlsx';

import { slugify } from './assessment-source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKBOOK = resolve(ROOT, 'National coverage leadership domain scoring.xlsx');
const OUT = resolve(ROOT, 'scripts/source-data/national-leadership.json');

/**
 * The four sub-domains, in the sheet's own column order.
 *
 * Located by these header labels rather than by column position, in both
 * blocks. The `id` is what the dashboard keys on and must stay stable; the
 * `header` is the sheet's wording and may drift.
 */
const SUB_DOMAINS = [
  { id: 'governance_structure', header: 'Governance Structure' },
  { id: 'data_governance_policy', header: 'State-specific Data Governance Policy' },
  { id: 'digital_health_strategy', header: 'State-specific Digital Health Strategy' },
  { id: 'financial_commitment', header: 'Financial Commitment for EMR' },
];

/**
 * The three answers, and the score the sheet gives each.
 *
 * `band` is deliberately absent: it is derived below by putting `score` through
 * the sheet's own `levelFromScore`, so the correspondence cannot be typed in
 * wrongly here and cannot drift if the cut points move.
 */
const ANSWERS = {
  yes: { label: 'Yes', score: 5 },
  partial: { label: 'Partial', score: 3 },
  no: { label: 'No', score: 1 },
};

const ANSWER_BY_SCORE = Object.fromEntries(
  Object.entries(ANSWERS).map(([id, a]) => [a.score, id]),
);

const BAND_RANK = { not_ready: 1, moderately_ready: 2, ready: 3 };

/** The sheet's three levels, in its own (upper-case) spelling. */
const BAND_BY_LEVEL = {
  'NOT READY': 'not_ready',
  'MODERATELY READY': 'moderately_ready',
  READY: 'ready',
};

/**
 * The sheet's summary block, which counts its own levels under a third
 * spelling again.
 */
const TALLY_LABEL = {
  'Overall Ready': 'ready',
  'Overall Moderately Ready': 'moderately_ready',
  'Overall Not Ready': 'not_ready',
};

/**
 * The banding rule, as the sheet's own numbers state it.
 *
 * A cross-check, never the read — see the note at the top. The cut points are
 * the ones that reproduce all 27 of the sheet's classifications: Kano 4.5 and
 * Rivers 4.0 are Ready, Osun 3.5 and Katsina 3.0 are Moderately Ready, and
 * Anambra at 2.5 is Not Ready.
 */
function levelFromScore(score) {
  if (score >= 4) return 'READY';
  if (score >= 3) return 'MODERATELY READY';
  return 'NOT READY';
}

/** `FCT` here, `fct` in the codebase; every other name slugifies straight on.
 *  Kept as a table so a second spelling drift is one line. */
const ID_ALIAS = { fct_abuja: 'fct' };

const stateIdFor = (name) => {
  const slug = slugify(name);
  return ID_ALIAS[slug] ?? slug;
};

function workbookPath(argv) {
  const i = argv.indexOf('--local');
  if (i !== -1) {
    const path = argv[i + 1];
    if (!path) throw new Error('--local needs a path');
    return resolve(process.cwd(), path);
  }
  return WORKBOOK;
}

const cellText = (v) => String(v ?? '').trim();

/**
 * Find both header rows by their own labels.
 *
 * The two blocks share a State column and the same four sub-domain headers; the
 * scoring block is the one that also carries `Readiness`. Anchored on the
 * labels rather than on row numbers, because the sheet has a tally block
 * between them and a row added there shifts everything below it.
 */
function locateBlocks(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, raw: true });

  const headers = [];
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] ?? []).map(cellText);
    const state = cells.indexOf('State');
    if (state === -1) continue;

    const at = {};
    let complete = true;
    for (const sub of SUB_DOMAINS) {
      const col = cells.indexOf(sub.header);
      if (col === -1) {
        complete = false;
        break;
      }
      at[sub.id] = col;
    }
    if (!complete) continue;

    // A header cell may carry a trailing space ("Total "), so these two are
    // matched on their stem rather than on equality.
    const total = cells.findIndex((c) => c === 'Total' || c.startsWith('Total'));
    const readiness = cells.indexOf('Readiness');
    headers.push({ row: i, state, at, total, readiness });
  }

  const answers = headers.find((h) => h.readiness === -1);
  const scoring = headers.find((h) => h.readiness !== -1);

  if (!answers || !scoring) {
    throw new Error(
      `Expected two header rows — an answers block (State + the four ` +
        `sub-domains) and a scoring block (the same, plus Total and ` +
        `Readiness). Found ${headers.length} candidate row(s): ` +
        `${headers.map((h) => h.row + 1).join(', ') || 'none'}.\n\n` +
        `Both are located by header label, so a renamed column needs the ` +
        `SUB_DOMAINS table in this script updating rather than a row number.`,
    );
  }
  if (scoring.total === -1) {
    throw new Error('The scoring block has no Total column.');
  }

  return { rows, answers, scoring };
}

/**
 * Read a block's rows until its first blank State.
 *
 * Both blocks end that way, and both are followed by a summary block that would
 * otherwise be read as data — the answer tally sits directly under the answers,
 * with a sub-domain name in the State column.
 */
function readRows(rows, header, read) {
  const out = [];
  for (let i = header.row + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const name = cellText(cells[header.state]);
    if (!name) break;
    out.push({ row: i, name, ...read(cells, name, i) });
  }
  return out;
}

/**
 * The sheet's own per-sub-domain tally — Yes / Partial / No counts, under the
 * answers block.
 *
 * Found by shape (a sub-domain name with three integers beside it) rather than
 * by position, because the block does not line up with the table's own columns.
 * The column order comes from the row above it, which labels the three.
 */
function answerTally(rows, from, to) {
  const byHeader = new Map(SUB_DOMAINS.map((s) => [s.header, s.id]));
  const tally = {};
  let order = null;

  for (let i = from; i < to; i++) {
    const cells = (rows[i] ?? []).map(cellText);
    // The label row: the three answers, in whatever order the sheet writes
    // them, upper-cased and sometimes padded ("PARTIAL ").
    const labelled = cells
      .map((c, at) => [c.toLowerCase(), at])
      .filter(([c]) => c in ANSWERS);
    if (labelled.length === 3) {
      order = labelled.map(([c, at]) => ({ answer: c, at }));
      continue;
    }

    const id = byHeader.get(cells[0]);
    if (!id || !order) continue;
    const raw = rows[i] ?? [];
    const counts = {};
    for (const { answer, at } of order) {
      const n = raw[at];
      if (!Number.isInteger(n)) return {}; // Not the block we thought it was.
      counts[answer] = n;
    }
    tally[id] = counts;
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
        `scripts/source-data/national-leadership.json and public/data/ — so ` +
        `you need this file only to rebuild that JSON, and not at all to ` +
        `build or run the app.`,
    );
  }

  const wb = XLSX.read(readFileSync(path), { type: 'buffer' });
  const sheet = wb.SheetNames[0];
  const { rows, answers: aHead, scoring: sHead } = locateBlocks(wb.Sheets[sheet]);

  // --- The answers block ----------------------------------------------------

  const byLabel = Object.fromEntries(
    Object.entries(ANSWERS).map(([id, a]) => [a.label.toLowerCase(), id]),
  );

  const answered = readRows(rows, aHead, (cells, name) => {
    const answers = {};
    for (const sub of SUB_DOMAINS) {
      const raw = cellText(cells[aHead.at[sub.id]]).toLowerCase();
      const answer = byLabel[raw];
      if (!answer) {
        throw new Error(
          `${name}: ${sub.header} reads ${JSON.stringify(raw)} — expected one ` +
            `of ${Object.values(ANSWERS).map((a) => a.label).join(', ')}.`,
        );
      }
      answers[sub.id] = answer;
    }
    return { answers };
  });

  // --- The scoring block ----------------------------------------------------

  const scored = readRows(rows, sHead, (cells, name) => {
    const scores = {};
    for (const sub of SUB_DOMAINS) {
      const v = cells[sHead.at[sub.id]];
      if (!(v in ANSWER_BY_SCORE)) {
        throw new Error(
          `${name}: ${sub.header} scores ${JSON.stringify(v)} — expected one ` +
            `of ${Object.keys(ANSWER_BY_SCORE).join(', ')}.`,
        );
      }
      scores[sub.id] = v;
    }

    const total = cells[sHead.total];
    const level = cellText(cells[sHead.readiness]).toUpperCase();

    if (typeof total !== 'number') {
      throw new Error(
        `${name}: Total reads ${JSON.stringify(total)} — expected a number. A ` +
          `score that arrived as text is a score that would land in the ` +
          `dashboard as null.`,
      );
    }

    const band = BAND_BY_LEVEL[level];
    if (!band) {
      throw new Error(
        `${name}: unknown readiness level ${JSON.stringify(level)}. Expected ` +
          `one of ${Object.keys(BAND_BY_LEVEL).map((l) => JSON.stringify(l)).join(', ')}.`,
      );
    }

    // Total is the plain mean of the four. Exact in all 27 rows; the tolerance
    // is for a future rounded cell, not for slack.
    const mean =
      SUB_DOMAINS.reduce((a, sub) => a + scores[sub.id], 0) / SUB_DOMAINS.length;
    if (Math.abs(mean - total) > 1e-6) {
      throw new Error(
        `${name}: the four sub-domain scores average ${mean} but Total says ` +
          `${total}. Either Total is no longer a plain mean of the four, or a ` +
          `fifth sub-domain has been added and this script has not been told ` +
          `about it.`,
      );
    }

    const derived = levelFromScore(total);
    if (derived !== level) {
      throw new Error(
        `${name}: the sheet says "${level}" for a total of ${total}, but its ` +
          `own cut points give "${derived}".\n\nThe rule and the column agree ` +
          `in all 27 rows today. A disagreement means one of the two has been ` +
          `edited and the sheet needs looking at — do not relax this check.`,
      );
    }

    return { scores, score: total, band };
  });

  // --- The two blocks must be the same 27 states, in the same order ---------

  if (answered.length !== scored.length) {
    throw new Error(
      `The answers block has ${answered.length} states and the scoring block ` +
        `has ${scored.length}. They are two lists of the same states and a row ` +
        `added to one of them shifts every pairing below it.`,
    );
  }

  const states = [];
  const seen = new Map();

  for (let i = 0; i < scored.length; i++) {
    const a = answered[i];
    const s = scored[i];

    if (a.name !== s.name) {
      throw new Error(
        `Row ${i + 1} of the answers block is "${a.name}" and row ${i + 1} of ` +
          `the scoring block is "${s.name}". Every score below this point ` +
          `belongs to the wrong state.`,
      );
    }

    // And the score must be the answer, scored. This is the relationship the
    // sub-domain display rests on: the pane shows the Yes/Partial/No from the
    // upper block beneath a band that came out of the lower one.
    for (const sub of SUB_DOMAINS) {
      const expected = ANSWERS[a.answers[sub.id]].score;
      if (s.scores[sub.id] !== expected) {
        throw new Error(
          `${a.name}: ${sub.header} is answered ` +
            `"${ANSWERS[a.answers[sub.id]].label}" but scored ` +
            `${s.scores[sub.id]}, where ${expected} is the score for that ` +
            `answer. The two blocks disagree about the same cell.`,
        );
      }
    }

    const id = stateIdFor(a.name);
    if (seen.has(id)) throw new Error(`Two rows for ${id}: "${seen.get(id)}" and "${a.name}"`);
    seen.set(id, a.name);

    // --- The answers, as bands ---------------------------------------------
    //
    // Through the sheet's own `levelFromScore` rather than a hand-written
    // table, so the mapping is the sheet's arithmetic and not this script's
    // opinion of it. See the note at the top.
    const subDomains = {};
    for (const sub of SUB_DOMAINS) {
      const score = ANSWERS[a.answers[sub.id]].score;
      const band = BAND_BY_LEVEL[levelFromScore(score)];
      if (!band) {
        throw new Error(
          `${a.name}: ${sub.header} scores ${score}, which the sheet's own cut ` +
            `points do not classify. Every answer's score must land on a band ` +
            `for the sub-domains to be reportable as bands at all.`,
        );
      }
      subDomains[sub.id] = band;
    }

    // And the state's band must sit between the weakest and strongest of its
    // four. True in 27 of 27 today, and the reason a Not-ready row under a
    // Ready badge is a finding rather than a contradiction: the sheet averages
    // the four, so its band can land anywhere *inside* their range and nowhere
    // outside it. A violation would mean the two blocks describe different
    // states, or that `Readiness` is no longer a function of these four.
    const ranks = SUB_DOMAINS.map((sub) => BAND_RANK[subDomains[sub.id]]);
    const own = BAND_RANK[s.band];
    if (own < Math.min(...ranks) || own > Math.max(...ranks)) {
      throw new Error(
        `${a.name}: the sheet bands the state "${s.band}", which is outside the ` +
          `range of its own four sub-domains (` +
          SUB_DOMAINS.map((sub) => `${sub.id} ${subDomains[sub.id]}`).join(', ') +
          `).\n\nThe state band is an average of the four and must lie between ` +
          `the weakest and the strongest. Do not relax this check — the pane ` +
          `shows the four beneath the one, and this is what stops that reading ` +
          `as a contradiction.`,
      );
    }

    states.push({
      id,
      name: a.name,
      band: s.band,
      /**
       * A band per sub-domain, not a Yes/Partial/No.
       *
       * The answer is not written out beside it. It is recoverable from the
       * band and carrying both would let them drift — and the dashboard has no
       * use for it: the whole point of the mapping is that the page speaks one
       * vocabulary. `score` is dropped for the reason in `LeadershipBands`.
       */
      subDomains,
    });
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

  // --- The sheet's own two summary blocks, cross-checked --------------------
  //
  // Both are independent of the tables above them, which is the only reason
  // they are worth checking: they are the sheet counting itself.

  const tally = answerTally(rows, aHead.row + answered.length + 1, sHead.row);
  for (const sub of SUB_DOMAINS) {
    const expected = tally[sub.id];
    if (!expected) continue; // Not found is unchecked, not a failure.
    for (const [answer, count] of Object.entries(expected)) {
      // Counted on the raw answers block, which is what this tally is about.
      // The states written out carry bands instead — and since the mapping is
      // one-to-one, checking the answers here also checks the bands.
      const actual = answered.filter((a) => a.answers[sub.id] === answer).length;
      if (actual !== count) {
        throw new Error(
          `The sheet's tally says ${count} states answer ` +
            `"${ANSWERS[answer].label}" for ${sub.header}; the table has ` +
            `${actual}. One of the two is stale.`,
        );
      }
    }
  }

  let levels = 0;
  for (let i = sHead.row + 1; i < rows.length; i++) {
    const raw = rows[i] ?? [];
    for (let c = 0; c < raw.length; c++) {
      const band = TALLY_LABEL[cellText(raw[c])];
      const count = raw[c + 1];
      if (!band || !Number.isInteger(count)) continue;
      levels += 1;
      const actual = states.filter((s) => s.band === band).length;
      if (actual !== count) {
        throw new Error(
          `The sheet's summary says ${count} states are "${cellText(raw[c])}"; ` +
            `the table has ${actual}. One of the two is stale.`,
        );
      }
    }
  }
  if (levels !== Object.keys(TALLY_LABEL).length) {
    throw new Error(
      `Found ${levels} of ${Object.keys(TALLY_LABEL).length} levels in the ` +
        `sheet's readiness summary. It is one of the two figures in the ` +
        `workbook independent of the tables, so a missing one leaves the read ` +
        `unchecked rather than merely unconfirmed.`,
    );
  }

  states.sort((a, b) => a.id.localeCompare(b.id));

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        source: 'National coverage leadership domain scoring.xlsx',
        sheet,
        note:
          'Generated by scripts/build-leadership.mjs — do not edit. Covers ' +
          `${states.length} of 37 states; the rest are unscored and are absent ` +
          'from this file rather than written as zeroes. `band` is the ' +
          "sheet's own Readiness column. Each sub-domain band is the sheet's " +
          'own answer put through its own cut points — the answers score Yes ' +
          '5 / Partial 3 / No 1 and the bands cut that same 1-5 scale at >=4 ' +
          'and >=3, so an answer lands exactly on a band. The state band is ' +
          'the average of the four and is copied, never rebuilt from them.',
        subDomains: SUB_DOMAINS.map((s) => ({ id: s.id, label: s.header })),
        /** The mapping this file was written under, stated so a reader of the
         *  JSON alone can check it. */
        answerBands: Object.fromEntries(
          Object.entries(ANSWERS).map(([id, a]) => [
            id,
            { label: a.label, score: a.score, band: BAND_BY_LEVEL[levelFromScore(a.score)] },
          ]),
        ),
        states,
      },
      null,
      2,
    )}\n`,
  );

  process.stderr.write(
    `Wrote ${states.length} leadership readings to ${OUT}\n` +
      `  ${Object.entries(
        states.reduce((a, s) => ({ ...a, [s.band]: (a[s.band] ?? 0) + 1 }), {}),
      )
        .map(([b, n]) => `${b} ${n}`)
        .join(' · ')}\n`,
  );
}

main();
