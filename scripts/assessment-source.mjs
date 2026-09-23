/**
 * Reading the assessment CSV: parsing, geography reconciliation, and the gap
 * catalogue extracted from the data itself.
 *
 * Split out from `ingest-assessment.mjs` so the parts that make *claims about
 * the source* can be tested without running a build. Everything here is pure:
 * bytes in, structures out, no filesystem and no network.
 *
 * The source is the ERA dashboard workbook's "List of gaps and interventions"
 * sheet, exported to CSV by `npm run data:gaps`. See `docs/ASSESSMENT_DATA.md`
 * for what it contains. The facts that drive every design decision below:
 *
 * 1. **Column headers are not unique.** `Intervention 1`, `When action is
 *    needed` and `Cost 1 (₦)` repeat twenty-odd times, and each is only
 *    meaningful relative to the gap column it follows. The sheet also puts
 *    helper and what-if scenario columns *between* them in the power and
 *    connectivity blocks, so a slot is found by walking forward from its
 *    `Intervention N` to the next `When action is needed` and `Cost N` — never
 *    by a fixed stride and never by header name alone.
 *
 * 2. **One cell can hold several priced things.** A service-point cell reads
 *    "Procure 2 desks / Procure 1 electric fan / Confirm whether a lockable door
 *    is required…" with one cost for all of it; a wiring cell adds "Install 3
 *    socket points" to the wiring fix; a tablet cell's cost is ₦233,333 times
 *    however many tablets it buys. Each is split into **unit actions** — one
 *    action type, a quantity and a unit price — and the split is checked to add
 *    back to the cell's cost exactly. Without it the plan would carry a separate
 *    line for every combination of desks and fans, several hundred of them.
 *
 * 3. **Urgency has four levels.** Major, Moderate, Minor and Long-term. The
 *    sheet words Minor two ways — a minor gap to fix *before* deployment and a
 *    minor action to complete *during* it — and both are Minor; the difference
 *    is kept as the action's **phase**, which is a separate field.
 *
 * 4. **The sheet carries one overall reading.** `Overall readiness for EMR
 *    deployment`, decided by the Technical Infrastructure actions alone: any
 *    Major is Not ready, any Moderate is Moderately ready. The four domain
 *    columns beside it are not readiness bands — they are each domain's
 *    *highest gap severity*.
 */

import Papa from 'papaparse';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The four urgency levels, worst-first.
 *
 * Every sort of gaps or actions on the page uses this order, so "most urgent"
 * means one thing everywhere. Major and Moderate are exactly what the
 * deployment band is computed from.
 */
export const HORIZONS = ['major', 'moderate', 'minor', 'long_term'];

/** When an action happens relative to go-live, from the same cell's wording. */
export const PHASES = ['before', 'during', 'after'];

/**
 * The sheet's phrasing → urgency and phase. Exhaustive: an unknown value
 * throws.
 *
 * The two Minor phrasings are one urgency. What separates them is *when* the
 * work happens, which is the phase, and a plan grouped by phase keeps them
 * apart without the urgency scale growing a fifth level the source does not
 * have.
 */
export const WHEN_BY_LABEL = {
  'Major gap to fix before EMR deployment': { horizon: 'major', phase: 'before' },
  'Moderate gap to fix before EMR deployment': { horizon: 'moderate', phase: 'before' },
  'Minor gap to fix before EMR deployment': { horizon: 'minor', phase: 'before' },
  'Minor action to complete during EMR deployment': { horizon: 'minor', phase: 'during' },
  'Optional long-term improvement after EMR deployment': { horizon: 'long_term', phase: 'after' },
};

/**
 * What a horizon does to readiness.
 *
 * The file has no severity column for a single gap — a gap's weight *is* the
 * urgency of the action it triggers. Major and Moderate block deployment
 * (they are precisely what the deployment band keys on); Minor and Long-term
 * do not.
 */
export const SEVERITY_BY_HORIZON = {
  major: 'blocking',
  moderate: 'blocking',
  minor: 'partial',
  long_term: 'partial',
};

/**
 * A domain's highest gap severity, the sheet's phrasing → our id.
 *
 * The four domain columns. Not readiness bands: the source classifies
 * readiness once, overall, and reports each domain as the worst gap in it.
 */
export const DOMAIN_SEVERITY_BY_LABEL = {
  'Major gap present': 'major',
  'Moderate gap present': 'moderate',
  'Minor gap present': 'minor',
  'No gap present': 'none',
};

/**
 * The domain severity a set of actions implies: its worst urgency, with
 * Long-term reading as Minor — a gap is present, and it blocks nothing. Checked
 * against the sheet's own column for every facility and domain.
 */
export function severityOfHorizons(horizons) {
  for (const h of HORIZONS) {
    if (horizons.includes(h)) return h === 'long_term' ? 'minor' : h;
  }
  return 'none';
}

/** The sheet's band phrasing → our id. */
export const BAND_BY_LABEL = {
  'Not Ready for EMR deployment': 'not_ready',
  'Moderately Ready for EMR deployment': 'moderately_ready',
  'Ready for EMR deployment': 'ready',
};

/**
 * The four domains, in the file's own order, with their fixed columns.
 *
 * `severityCol` is the domain's highest gap severity; `costTotalCol` is the
 * sheet's own subtotal, carried so the ingest can check its arithmetic against
 * the source rather than trusting it. Both are asserted against the header
 * text when the file is parsed.
 *
 * There is no leadership & governance domain. It is not assessed at facility
 * level and has no column in this file, so the model does not carry one.
 */
export const DOMAINS = [
  {
    id: 'technical_infrastructure',
    label: 'Technical Infrastructure',
    sheetBand: 'Technical Infrastructure',
    severityCol: 8,
    costTotalCol: 86,
  },
  {
    id: 'workforce_capacity',
    label: 'Workforce Capacity',
    sheetBand: 'Workforce Capacity',
    severityCol: 9,
    costTotalCol: 103,
  },
  {
    id: 'workflow_transition',
    label: 'Workflow & Transition',
    sheetBand: 'Workflow and Transition',
    severityCol: 10,
    costTotalCol: 116,
  },
  {
    id: 'data_use_reporting',
    label: 'Data Use & Reporting',
    sheetBand: 'Data Use and Reporting',
    severityCol: 11,
    costTotalCol: 129,
  },
];

export const DOMAIN_IDS = DOMAINS.map((d) => d.id);

/** Fixed column positions in the overview and summary blocks. */
export const COL = {
  uuid: 0,
  state: 1,
  lga: 2,
  name: 3,
  facilityGroup: 4,
  functionality: 5,
  zone: 6,
  /** The one overall reading. */
  deploymentBand: 7,
  mtnBaseStation: 75,
  mtnDistanceKm: 76,
  mtnServiceability: 77,
  mtn4gSignal: 78,
  airtelDistanceM: 79,
  dailyClientLoad: 135,
  totalCost: 137,
};

/**
 * The summary columns that count actions by urgency.
 *
 * They count **Technical Infrastructure** slots only, which is how the sheet
 * scopes readiness too, and the ingest checks Major, Moderate and Long-term
 * against every row. The Minor column is left unchecked: it counts some
 * Technical Infrastructure areas and not others, with no rule that
 * reproduces it across the dataset, and the dashboard does not read it.
 */
export const SUMMARY_COL = {
  moderate: 132,
  major: 133,
  long_term: 134,
};

/** The header text each fixed column must carry. A column that has moved is a
 *  build failure, not a quietly misread field. */
const EXPECTED_HEADER = {
  [COL.uuid]: 'Facility UUID',
  [COL.deploymentBand]: 'Overall readiness for EMR deployment',
  [COL.mtnBaseStation]: 'MTN base station',
  [COL.mtnDistanceKm]: 'MTN base-station distance (km)',
  [COL.mtnServiceability]: 'MTN serviceability',
  [COL.mtn4gSignal]: 'MTN 4G signal',
  [COL.airtelDistanceM]: 'Average Airtel site distance (m)',
  [COL.dailyClientLoad]: 'Typical daily client load',
  [COL.totalCost]: 'Total facility intervention cost (₦)',
  [SUMMARY_COL.moderate]: 'Moderate gaps (e.g. power or connectivity work)',
  [SUMMARY_COL.major]: 'Major gaps (e.g. no power or usable connection)',
  [SUMMARY_COL.long_term]: 'Long-term gaps (e.g. optional maintenance or improvement)',
  ...Object.fromEntries(
    DOMAINS.flatMap((d) => [
      [d.severityCol, `Highest ${d.sheetBand} gap severity`],
      [d.costTotalCol, null],
    ]),
  ),
};

/** Header rows before the data starts. Title, scope note, domain band, headers. */
const HEADER_ROWS = 4;
const BAND_ROW = 2;
const HEADER_ROW = 3;

/** What a gap or action cell holds when there is nothing there. */
const NO_GAP = 'No gap';

/**
 * A cell the sheet leaves in a state it does not mean, repaired here by name
 * so the repair is arguable rather than invisible.
 *
 * **`0` for a Backup-connectivity condition** (199 facilities). The column
 * holds a sentence everywhere else; these hold the number zero, with no action
 * and a ₦0 cost. Read as *no gap* — there is no condition here to name.
 * `parseAssessmentCsv` holds the repair to this one column, so a `0` appearing
 * anywhere else stops the build instead of being patched by a rule nobody
 * checked against it.
 */
export const BLANK_GAP_VALUE = '0';
export const BLANK_GAP_AREA = 'Backup-connectivity';

// ---------------------------------------------------------------------------
// Unit actions
// ---------------------------------------------------------------------------

/**
 * Actions the sheet prices per unit, and how each appears in a cell.
 *
 * The label is the one the plan prints — the wording the workbook's own
 * Interventions summary uses for the line — and the unit price is the one the
 * cells are built from. Both are checked: every cell these appear in must add
 * back to its own cost, in every row, or the build stops.
 *
 * The lockable-door check has no price. The sheet says so in the cell ("before
 * costing") and costs it at ₦0, so it is carried as **unpriced** rather than
 * free: the work is real and nobody has costed it yet.
 */
export const UNIT_ACTIONS = {
  socket: {
    pattern: /^Install (\d+) socket points?\.?$/,
    label: 'Install socket points where EMR equipment will be used.',
    unit: 'socket point',
    unitCostNGN: 3000,
  },
  desk: {
    pattern: /^Procure (\d+) desks?\.?$/,
    label: 'Procure desks for the affected service points.',
    unit: 'desk',
    unitCostNGN: 35000,
  },
  patient_chair: {
    pattern: /^Procure (\d+) patient chairs?\.?$/,
    label: 'Procure patient chairs for the affected service points.',
    unit: 'patient chair',
    unitCostNGN: 25000,
  },
  staff_chair: {
    pattern: /^Procure (\d+) staff chairs?\.?$/,
    label: 'Procure staff chairs for the affected service points.',
    unit: 'staff chair',
    unitCostNGN: 25000,
  },
  electric_fan: {
    pattern: /^Procure (\d+) electric fans?\.?$/,
    label: 'Procure electric fans for the affected service points.',
    unit: 'electric fan',
    unitCostNGN: 60000,
  },
  lockable_door: {
    pattern:
      /^Confirm whether a lockable door is required for (\d+) affected service points?(?: before costing)?\.?$/,
    label: 'Confirm whether a lockable door is required at the affected service points.',
    unit: 'service point',
    unitCostNGN: null,
  },
};

/**
 * The one whole-cell action priced per unit: tablets, at ₦700,000 for three.
 *
 * The cell names the action once and its cost is the price times the number
 * of tablets, so the quantity is read off the cost. It must come out a whole
 * number in every row.
 */
export const TABLET_ACTION = {
  label: 'Procure EMR-capable tablets to close the immediate device gap.',
  unit: 'tablet',
  unitCostNGN: 700000 / 3,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const slugify = (v) =>
  String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** Title Case for display, from the file's snake_case slugs. */
export function titleCase(slug) {
  return String(slug)
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Parse a money cell.
 *
 * Returns `null` for an empty cell and `0` for a literal zero — a distinction
 * the file makes deliberately and the dashboard depends on. Routine device
 * maintenance and naming an EMR focal person are left blank: unpriced, not
 * free. Collapsing them to zero would hide them inside a total presented as
 * sourced.
 */
export function parseMoney(raw) {
  const s = String(raw ?? '').replace(/[₦,\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Unparseable money cell: ${JSON.stringify(raw)}`);
  return n;
}

/** A short, stable content hash — enough to disambiguate ids, short enough to
 *  repeat in every facility row. */
const shortHash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 5);

/** Whole-naira comparison, for a cell and the parts it was split into. The
 *  tablet price is a third of a naira off whole, so exact equality would fail
 *  on arithmetic rather than on the data. */
const sameMoney = (a, b) => Math.abs(a - b) < 0.01;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Where a gap block stops: the next gap, a domain's cost subtotal, or the
 *  mobile-network measurements that sit between two technical blocks. */
function endsBlock(label) {
  return (
    label.endsWith(' gap') || label.endsWith('intervention cost (₦)') || label === 'MTN base station'
  );
}

/**
 * Parse the CSV into rows, and locate every gap block positionally.
 *
 * The returned `blocks` are the file's real structure: one per gap column, each
 * knowing its domain, its sub-domain name, and the (intervention, when, cost)
 * column triples that belong to it. Nothing downstream indexes a column by
 * header name.
 */
export function parseAssessmentCsv(text) {
  const { data: rows, errors } = Papa.parse(text.replace(/^﻿/, ''), {
    skipEmptyLines: false,
  });

  // Papa reports a delimiter guess and stray-quote notes on files this wide;
  // only genuine structural failures matter here.
  const fatal = errors.filter((e) => e.type === 'Quotes' || e.code === 'TooFewFields');
  if (fatal.length) {
    throw new Error(`CSV parse failed: ${fatal[0].message} (row ${fatal[0].row})`);
  }

  if (rows.length <= HEADER_ROWS) throw new Error('CSV has no data rows');

  const bandRow = rows[BAND_ROW];
  const header = rows[HEADER_ROW].map((h) => String(h ?? '').trim());

  for (const [col, expected] of Object.entries(EXPECTED_HEADER)) {
    const actual = header[col] ?? '';
    const ok = expected === null ? actual.endsWith('intervention cost (₦)') : actual === expected;
    if (!ok) {
      throw new Error(
        `Column ${col} reads ${JSON.stringify(actual)}, expected ` +
          `${expected === null ? 'a domain intervention cost' : JSON.stringify(expected)}. ` +
          `The sheet's layout has changed; update COL / DOMAINS in ` +
          `scripts/assessment-source.mjs.`,
      );
    }
  }

  // The domain row is sparse — a domain name appears once, above its first
  // column, and applies until the next one. Forward-fill so every column knows
  // its domain.
  const columnDomain = [];
  let current = '';
  for (const cell of bandRow) {
    const v = String(cell ?? '').trim();
    if (v) current = v;
    columnDomain.push(current);
  }

  const sheetBandToDomain = new Map(DOMAINS.map((d) => [d.sheetBand, d]));

  const blocks = [];
  for (let i = 0; i < header.length; i += 1) {
    const label = header[i];
    if (!label.endsWith(' gap')) continue;

    const domain = sheetBandToDomain.get(columnDomain[i]);
    if (!domain) {
      throw new Error(
        `Gap column "${label}" (index ${i}) sits under unrecognised domain "${columnDomain[i]}"`,
      );
    }

    let end = i + 1;
    while (end < header.length && !endsBlock(header[end])) end += 1;

    // Each `Intervention N` owns the next `When action is needed` and the next
    // `Cost N (₦)` after it. The helper and scenario columns between them are
    // skipped by construction.
    const slots = [];
    for (let j = i + 1; j < end; j += 1) {
      const m = header[j].match(/^Intervention (\d+)$/);
      if (!m) continue;
      const when = header.indexOf('When action is needed', j + 1);
      const cost = header.findIndex((h, k) => k > j && h.startsWith(`Cost ${m[1]} (`));
      if (when === -1 || when >= end || cost === -1 || cost >= end) {
        throw new Error(`"${label}" slot ${m[1]} has no urgency or cost column inside its block`);
      }
      slots.push({ label: j, when, cost });
    }
    if (!slots.length) {
      throw new Error(`Gap column "${label}" (index ${i}) has no intervention slots after it`);
    }

    blocks.push({
      col: i,
      domain: domain.id,
      /** "Power gap" → "Power". The sub-domain, and the only level between a
       *  domain and a gap that this file has. */
      subDomain: label.slice(0, -' gap'.length).trim(),
      slots,
    });
  }

  if (!blocks.length) throw new Error('No gap columns found — is this the right sheet?');

  const data = rows
    .slice(HEADER_ROWS)
    .filter((r) => String(r[COL.uuid] ?? '').trim() !== '');

  for (const block of blocks) {
    if (block.subDomain === BLANK_GAP_AREA) continue;
    const hit = data.find((r) => String(r[block.col] ?? '').trim() === BLANK_GAP_VALUE);
    if (hit) {
      throw new Error(
        `"${BLANK_GAP_VALUE}" appears as a ${block.subDomain} gap value (facility ` +
          `${hit[COL.uuid]}). It is read as "no gap" in ${BLANK_GAP_AREA} only — ` +
          `see BLANK_GAP_VALUE in scripts/assessment-source.mjs.`,
      );
    }
  }

  return { header, blocks, rows: data };
}

/**
 * Split one action cell into unit actions, and check they add up to its cost.
 *
 * Returns `{ key, label, unit, quantity, unitCostNGN }` parts. `key` names the
 * action type within the cell's area — a `UNIT_ACTIONS` key, `tablet`, or null
 * for a plain one-per-facility action whose label is the cell's own line.
 */
export function splitAction(text, costNGN, where) {
  const lines = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parts = [];
  let plain = null;
  for (const line of lines) {
    const hit = Object.entries(UNIT_ACTIONS).find(([, u]) => u.pattern.test(line));
    if (hit) {
      const [key, u] = hit;
      const quantity = Number(line.match(u.pattern)[1]);
      parts.push({ key, label: u.label, unit: u.unit, quantity, unitCostNGN: u.unitCostNGN });
      continue;
    }
    if (plain) {
      throw new Error(`${where}: two unpriced-unit lines in one cell — "${plain}" and "${line}"`);
    }
    plain = line;
  }

  const unitCost = parts.reduce((sum, p) => sum + (p.unitCostNGN ?? 0) * p.quantity, 0);

  if (plain === TABLET_ACTION.label) {
    if (parts.length) throw new Error(`${where}: tablets share a cell with other items`);
    // The sheet stores the price to four decimal places, so the ratio lands a
    // hair under a whole number; what is checked is that it lands next to one.
    const quantity = (costNGN ?? 0) / TABLET_ACTION.unitCostNGN;
    if (Math.round(quantity) < 1 || Math.abs(quantity - Math.round(quantity)) > 1e-6) {
      throw new Error(`${where}: tablet cost ₦${costNGN} is not a whole number of tablets`);
    }
    return [
      {
        key: 'tablet',
        label: TABLET_ACTION.label,
        unit: TABLET_ACTION.unit,
        quantity: Math.round(quantity),
        unitCostNGN: TABLET_ACTION.unitCostNGN,
      },
    ];
  }

  if (plain) {
    // Whatever the unit parts do not account for is the plain action's price.
    const rest = costNGN === null ? null : costNGN - unitCost;
    if (rest !== null && rest < -0.01) {
      throw new Error(`${where}: unit items cost ₦${unitCost}, more than the cell's ₦${costNGN}`);
    }
    parts.unshift({ key: null, label: plain, unit: null, quantity: 1, unitCostNGN: rest });
    return parts;
  }

  if (!sameMoney(unitCost, costNGN ?? 0)) {
    throw new Error(
      `${where}: the items in this cell add to ₦${unitCost} but the cell costs ₦${costNGN}. ` +
        `A unit price in UNIT_ACTIONS no longer matches the sheet.`,
    );
  }
  return parts;
}

/**
 * An action type's identity.
 *
 * Keyed on urgency and phase as well as the label and unit price, because the
 * same work appears at more than one: a solar install is Major for a facility
 * with no power and Moderate for one with a few hours a day. Same work, same
 * price, a different place in the plan — so two lines, not one.
 */
function actionId({ label, horizon, phase, unitCostNGN }) {
  const stem = slugify(label).split('_').slice(0, 3).join('_');
  return `${stem}_${shortHash(`${label}|${horizon}|${phase}|${unitCostNGN ?? 'null'}`)}`;
}

/**
 * Every action a row records against one gap block, split into unit actions.
 *
 * **This is where a facility's cost comes from.** The catalogue says what a
 * condition *can* call for; this says what this facility's row asks for, and
 * how many.
 *
 * An action cell that reads `No gap` holds no action. A gap with no action at
 * all is still a gap the sheet recorded, so the caller keeps it with an empty
 * list rather than dropping it.
 */
export function interventionsInRow(row, block) {
  const out = [];
  for (const slot of block.slots) {
    const text = String(row[slot.label] ?? '').trim();
    if (!text || text === NO_GAP) continue;
    const whenLabel = String(row[slot.when] ?? '').trim();
    const when = WHEN_BY_LABEL[whenLabel];
    if (!when) {
      throw new Error(
        `Unknown "when action is needed" value ${JSON.stringify(whenLabel)} ` +
          `for ${block.subDomain} at facility ${row[0]} (column ${slot.when})`,
      );
    }
    const where = `${block.subDomain} at facility ${row[0]}`;
    for (const part of splitAction(text, parseMoney(row[slot.cost]), where)) {
      const def = {
        label: part.label,
        unit: part.unit,
        unitCostNGN: part.unitCostNGN,
        horizon: when.horizon,
        phase: when.phase,
      };
      out.push({
        id: actionId(def),
        ...def,
        quantity: part.quantity,
        costNGN: part.unitCostNGN === null ? null : part.unitCostNGN * part.quantity,
      });
    }
  }
  return out;
}

/**
 * The gap value in a row for one block, or null where the sheet says none.
 */
export function gapValueInRow(row, block) {
  const v = String(row[block.col] ?? '').trim();
  if (v === '' || v === NO_GAP) return null;
  if (v === BLANK_GAP_VALUE && block.subDomain === BLANK_GAP_AREA) return null;
  return v;
}

// ---------------------------------------------------------------------------
// Gap areas
// ---------------------------------------------------------------------------

/**
 * The level between a domain and a gap: one per gap column in the sheet.
 *
 * "Technical Infrastructure" is a domain and "No functional electricity source
 * or 0 hours/day" is a condition; between them sits **Power** — the gap *area*.
 *
 * The rule that makes the area the right unit for a filter and a rollup: a
 * facility holds **at most one condition per area**, because a column holds one
 * value. So counting areas counts facilities, where counting conditions counts
 * survey answers.
 */
export const gapAreaId = (subDomain) => slugify(subDomain);

/**
 * Every gap area, in the sheet's own column order.
 *
 * Column order rather than alphabetical: the sheet leads each domain with its
 * blocking areas (Power, then Wiring, then Facility-connectivity) and trails it
 * with the optional ones, which is the order a reader scanning for the serious
 * problem wants.
 */
export function extractGapAreas(blocks) {
  return blocks.map((block, order) => ({
    id: gapAreaId(block.subDomain),
    domain: block.domain,
    /** The column header without its trailing "gap" — "Power",
     *  "Facility-connectivity". Rendered as "Power gap" where a control needs
     *  the noun. */
    label: block.subDomain,
    order,
  }));
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/** Readable, bounded, stable. The id rides in the URL via the Gap area filter. */
export function gapId(subDomain, value) {
  const stem = `${slugify(subDomain)}__${slugify(value).slice(0, 56)}`;
  return stem.replace(/_+$/, '');
}

/**
 * The condition a facility's row sits under in one area — its gap, or, where
 * the gap column says `No gap` and actions are still costed, the area's
 * **unrecorded** condition.
 *
 * Those rows are real money in the sheet's total: 380 facilities with no
 * wiring gap are still charged for socket points, and 224 with no service-point
 * gap for furniture. They are kept, at the assessment team's direction, under a
 * condition that says what it is — "No gap recorded" — and flagged
 * `recorded: false`, so a count of gaps can leave them out while every total
 * still reconciles to the sheet.
 */
export const UNRECORDED_LABEL = 'No gap recorded';

export function conditionInRow(row, block) {
  const value = gapValueInRow(row, block);
  if (value !== null) return { id: gapId(block.subDomain, value), label: value, recorded: true };
  if (!interventionsInRow(row, block).length) return null;
  return {
    id: gapId(block.subDomain, 'no_gap_recorded'),
    label: UNRECORDED_LABEL,
    recorded: false,
  };
}

/**
 * Extract the catalogue from the data: the conditions, and the action types
 * they call for.
 *
 * Every (gap area, condition) pair becomes one gap entry, carrying the ids of
 * every action type the sheet fires for it anywhere in the dataset. The action
 * types themselves — label, unit, unit price, urgency, phase — are returned
 * alongside, once each. A facility's own quantities are *not* here; they are
 * on the facility, because they differ at every one.
 *
 * What the extraction refuses is a condition whose actions **disagree about
 * severity** between facilities. Severity is what the deployment band keys on,
 * so a condition that blocks deployment at one facility and not at another
 * would make the band unreadable rather than merely imprecise.
 */
export function extractCatalogue(rows, blocks) {
  const byId = new Map();
  const actions = new Map();
  /** gap id → the facility that first fixed each severity, for a legible message. */
  const provenance = new Map();

  for (const row of rows) {
    for (const block of blocks) {
      const condition = conditionInRow(row, block);
      if (!condition) continue;

      const found = interventionsInRow(row, block);
      const severity = worstSeverity(found);
      const area = gapAreaId(block.subDomain);

      let entry = byId.get(condition.id);
      if (!entry) {
        entry = {
          id: condition.id,
          domain: block.domain,
          /** The gap area this condition sits in — see `extractGapAreas`. */
          area,
          label: condition.label,
          /** False for an area's "No gap recorded" condition: costed, but not a
           *  gap the survey found. See `conditionInRow`. */
          recorded: condition.recorded,
          /**
           * The gap's own weight: the worst urgency among the actions it
           * triggers, and the same at every facility that carries it. A gap
           * with no action is `partial` — there is nothing it asks anyone to
           * do, so it cannot block anything.
           */
          severity,
          actions: [],
        };
        byId.set(condition.id, entry);
        provenance.set(condition.id, new Map());
      }

      if (severity !== entry.severity) {
        const first = provenance.get(condition.id).get(entry.severity);
        throw new Error(
          `Gap "${block.subDomain}: ${condition.label}" is ${entry.severity} at facility ` +
            `${first} and ${severity} at facility ${row[COL.uuid]}.\n` +
            `Severity is what the deployment band is computed from, so a ` +
            `condition cannot carry two. See docs/ASSESSMENT_DATA.md.`,
        );
      }
      if (!provenance.get(condition.id).has(severity)) {
        provenance.get(condition.id).set(severity, row[COL.uuid]);
      }

      for (const iv of found) {
        if (!actions.has(iv.id)) {
          actions.set(iv.id, {
            id: iv.id,
            label: iv.label,
            domain: block.domain,
            area,
            horizon: iv.horizon,
            phase: iv.phase,
            /** What one unit is, or null where the action is one per facility. */
            unit: iv.unit,
            unitCostNGN: iv.unitCostNGN,
          });
        } else if (actions.get(iv.id).area !== area) {
          // A facility's actions are matched back to its gaps by area — it
          // holds one condition per area — so an action type must live in one.
          throw new Error(
            `Action "${iv.label}" appears under both ${actions.get(iv.id).area} ` +
              `and ${area}; a facility's actions could no longer be tied to its gaps.`,
          );
        }
        if (!entry.actions.includes(iv.id)) entry.actions.push(iv.id);
      }
    }
  }

  const actionList = [...actions.values()].sort(
    (a, b) =>
      DOMAIN_IDS.indexOf(a.domain) - DOMAIN_IDS.indexOf(b.domain) ||
      HORIZONS.indexOf(a.horizon) - HORIZONS.indexOf(b.horizon) ||
      a.label.localeCompare(b.label),
  );
  const actionById = new Map(actionList.map((a) => [a.id, a]));

  // Every condition lists its actions most urgent first.
  for (const entry of byId.values()) {
    entry.actions.sort(
      (a, b) =>
        HORIZONS.indexOf(actionById.get(a).horizon) - HORIZONS.indexOf(actionById.get(b).horizon) ||
        (actionById.get(b).unitCostNGN ?? 0) - (actionById.get(a).unitCostNGN ?? 0),
    );
  }

  // Ordered the way the sheet is: domain, then gap area in column order, then
  // recorded before unrecorded, then worst-first within an area.
  const areaOrder = new Map(extractGapAreas(blocks).map((a) => [a.id, a.order]));
  const worstOf = (g) =>
    Math.min(HORIZONS.length, ...g.actions.map((id) => HORIZONS.indexOf(actionById.get(id).horizon)));
  const gaps = [...byId.values()].sort(
    (a, b) =>
      DOMAIN_IDS.indexOf(a.domain) - DOMAIN_IDS.indexOf(b.domain) ||
      areaOrder.get(a.area) - areaOrder.get(b.area) ||
      Number(b.recorded) - Number(a.recorded) ||
      worstOf(a) - worstOf(b) ||
      a.label.localeCompare(b.label),
  );

  // Ids ride in URLs and in every facility row, so a collision would silently
  // merge two things into one. Truncation makes that possible in principle;
  // assert it has not happened rather than hope.
  for (const list of [gaps, actionList]) {
    const seen = new Set();
    for (const x of list) {
      if (seen.has(x.id)) throw new Error(`Duplicate id after truncation: ${x.id}`);
      seen.add(x.id);
    }
  }

  return { gaps, actions: actionList };
}

function worstSeverity(interventions) {
  return interventions.some((iv) => SEVERITY_BY_HORIZON[iv.horizon] === 'blocking')
    ? 'blocking'
    : 'partial';
}

/**
 * What a set of actions costs.
 *
 * Unpriced actions contribute nothing and are counted separately, so a total
 * never quietly absorbs a missing price as a zero.
 */
export function interventionsCost(interventions) {
  let costNGN = 0;
  let unpriced = 0;
  for (const iv of interventions) {
    if (iv.costNGN === null) unpriced += 1;
    else costNGN += iv.costNGN;
  }
  return { costNGN, unpriced };
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

/**
 * CSV LGA slug → boundary-layer `lgaId`, where the two spell it differently.
 *
 * 25 of 305, covering 229 facilities. Every one was resolved against
 * `public/geo/lga-index.json` by hand — mostly separator and transliteration
 * differences (`birnin_kudu`/`birni_kudu`, `jamaare`/`jama_are`), a few genuine
 * variants (`kano_minicipal_council`/`kano_municipal`, `onuimo`/`unuimo`).
 *
 * Keyed by `state/lga` so a name that means different LGAs in two states cannot
 * be aliased into the wrong one — `nassarawa` is an LGA of Kano *and* a state,
 * and Nasarawa state has its own LGAs.
 *
 * This table is the reason `resolveLga` can throw on anything unmatched: with
 * the known differences named, an unmatched slug is new information, not noise.
 */
export const LGA_ALIASES = {
  'akwa_ibom/ibesikpoasutan': 'ibesikpo_asutan',
  'akwa_ibom/ndung_uko': 'udung_uko',
  'akwa_ibom/urueoffongoruko': 'urue_offong_oruko',
  'bauchi/dambam': 'damban',
  'bauchi/itasgadau': 'itas_gadau',
  'bauchi/jamaare': 'jama_are',
  'imo/ohajiegbema': 'ohaji_egbema',
  'imo/onuimo': 'unuimo',
  'jigawa/birnin_kudu': 'birni_kudu',
  'jigawa/birniwa': 'biriniwa',
  'kano/danbatta': 'dambatta',
  'kano/garun_malam': 'garum_mallam',
  'kano/kano_minicipal_council': 'kano_municipal',
  'kano/nassarawa': 'nasarawa',
  'lagos/ifako_ijaiye': 'ifako_ijaye',
  'lagos/oshodi': 'oshodi_isolo',
  'niger/munya': 'muya',
  'oyo/afijo': 'afijio',
  'oyo/atisbo': 'atigbo',
  'rivers/abuaodual': 'abua_odual',
  'rivers/obioakpor': 'obia_akpor',
  'rivers/ogbaegbemandoni': 'ogba_egbema_ndoni',
  'rivers/ogubolo': 'ogu_bolo',
  'rivers/omuma': 'omumma',
  'rivers/opobonkoro': 'opobo_nkoro',
};

/**
 * Resolve a CSV (state, LGA) pair against the boundary layer.
 *
 * Throws on anything it cannot place. A silent drop here is a state quietly
 * losing thirteen facilities and its investment total going with them — the
 * kind of error that produces a plausible dashboard and a wrong one, which is
 * strictly worse than a failed build.
 */
export function resolveLga(stateId, lgaSlug, lgaIndex) {
  const known = lgaIndex[stateId];
  if (!known) throw new Error(`State "${stateId}" is not in the boundary index`);

  const alias = LGA_ALIASES[`${stateId}/${lgaSlug}`];
  const candidate = alias ?? lgaSlug;
  const hit = known.find((l) => l.lgaId === candidate);
  if (hit) return hit;

  throw new Error(
    `LGA "${lgaSlug}" in ${stateId} does not match the boundary layer` +
      `${alias ? ` (aliased to "${alias}", which is also unknown)` : ''}. ` +
      `Add it to LGA_ALIASES in scripts/assessment-source.mjs, or check the ` +
      `spelling in the sheet.`,
  );
}
