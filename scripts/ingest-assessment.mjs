/**
 * Build `public/data/` from the real assessment dataset.
 *
 *     npm run data:ingest              # read the committed CSV
 *     npm run data:ingest -- --fetch   # re-download from the published sheet first
 *     npm run data:ingest -- --local <path>
 *
 * Replaced `generate-dummy-data.mjs`, which invented every figure it wrote and
 * has been retired — see git history if the synthetic population is ever wanted
 * again. The output contract is unchanged in shape, so the app keeps reading
 * through `DataSource` exactly as before. What changed is that the numbers are
 * now sourced, and this script is where that sourcing is checked.
 *
 * See `docs/ASSESSMENT_DATA.md` for the dataset itself. `assessment-source.mjs`
 * holds the parsing and the catalogue extraction; this file is the build.
 *
 * ## Build-time, not runtime
 *
 * The sheet stays the editable source of truth and the app never fetches it.
 * Measured on the published URL: ~80 KB/s for 7.8 MB — roughly 100 seconds —
 * and the `pub?…` endpoint answers 307 to a googleusercontent host **without**
 * an `Access-Control-Allow-Origin` header on the redirect, so a browser fetch
 * fails on the first hop where curl succeeds. Ingest here, commit the diff.
 *
 * ## What this script refuses to do
 *
 * Every assertion below turns a silent wrong number into a failed build. The
 * relationships they check all hold in 2,806 of 2,806 rows today, so none of
 * them is speculative — each one is a property of the current sheet that the
 * dashboard's arithmetic depends on. If a future edit breaks one, the right
 * outcome is a stopped build and a look at the sheet, not a dashboard that
 * still renders and is quietly wrong.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BAND_BY_LABEL,
  COL,
  DOMAINS,
  DOMAIN_IDS,
  DOMAIN_SEVERITY_BY_LABEL,
  HORIZONS,
  PHASES,
  SCENARIO_COMPONENTS,
  SCENARIO_PACKAGES,
  SUMMARY_COL,
  WHEN_BY_LABEL,
  conditionInRow,
  extractCatalogue,
  extractGapAreas,
  gapValueInRow,
  interventionsCost,
  interventionsInRow,
  parseAssessmentCsv,
  parseMoney,
  resolveLga,
  scenarioBand,
  scenarioComponentsInRow,
  severityOfHorizons,
  slugify,
  titleCase,
} from './assessment-source.mjs';
import { lookupFor, nameKey, parseFacilityWorkbook } from './facility-workbook.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data');
const CACHE = resolve(ROOT, 'scripts/source-data/assessment.csv');
/** The ERA dashboard workbook's facility gap sheet, exported by `npm run
 *  data:gaps` and committed. */
const COMMITTED = resolve(ROOT, 'List of gaps and interventions per facility.csv');
/**
 * The raw ODK export, joined on top of the gaps CSV.
 *
 * Required whenever the ingest runs, and **not committed** — 37 MB against a
 * repo whose next largest file is 7.5 MB, changing rarely enough that carrying
 * every revision in the history is the wrong trade. `public/data/` is committed,
 * so a clone that only builds and runs the app never needs it; only regenerating
 * the data does.
 *
 * Required rather than optional when it is needed, because it supplies
 * `geography` and every facility's coordinate. A build that quietly dropped
 * them because someone did not have the file would leave every facility reading
 * "Rural" by omission, and an empty map, across a committed dataset nobody
 * would think to re-check.
 */
const WORKBOOK = resolve(ROOT, 'ERA dataset_v4 (1).xlsx');

const BANDS = ['not_ready', 'moderately_ready', 'ready'];

/**
 * How far a facility's figures may sit from the sheet's own, in naira.
 *
 * The tablet price is ₦700,000 ÷ 3, which the sheet stores to four decimal
 * places and this build carries exactly, so a facility buying five tablets
 * differs from the sheet by a fraction of a kobo. Everything else reconciles
 * exactly. The drift is totalled in the build report rather than swallowed, so
 * it can never quietly grow into something that is not rounding.
 */
const ROUNDING_TOLERANCE = 1;

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/**
 * The published-sheet URL, out of `.env`.
 *
 * `.env` currently names it `facility gaps and intervention`, which is not a
 * legal shell identifier and so never reaches `process.env`. Rather than make
 * the sheet's location depend on someone renaming a key, take an explicit
 * `ASSESSMENT_CSV_URL` if present and otherwise recognise the URL by shape.
 */
function sourceUrl() {
  if (process.env.ASSESSMENT_CSV_URL) return process.env.ASSESSMENT_CSV_URL;
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, 'utf8');
  const explicit = text.match(/^\s*ASSESSMENT_CSV_URL\s*=\s*"?([^"\n]+)"?/m);
  if (explicit) return explicit[1].trim();
  const guessed = text.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^\s"']+output=csv/);
  return guessed ? guessed[0] : null;
}

async function loadCsv(argv) {
  const localFlag = argv.indexOf('--local');
  if (localFlag !== -1) {
    const path = argv[localFlag + 1];
    if (!path) throw new Error('--local needs a path');
    return { text: readFileSync(resolve(path), 'utf8'), origin: path };
  }

  if (argv.includes('--fetch')) {
    const url = sourceUrl();
    if (!url) throw new Error('No sheet URL — set ASSESSMENT_CSV_URL or add it to .env');
    process.stderr.write('Fetching the published sheet (7.8 MB, this takes a minute)…\n');
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Sheet responded ${res.status}`);
    const text = await res.text();
    if (text.length < 1_000_000) {
      // A Google error page is HTML and small. Caching one over a good CSV
      // would be worse than failing.
      throw new Error(`Sheet returned ${text.length} bytes — too small to be the dataset`);
    }
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, text);
    return { text, origin: url };
  }

  for (const path of [CACHE, COMMITTED]) {
    if (existsSync(path)) return { text: readFileSync(path, 'utf8'), origin: path };
  }
  throw new Error(
    `No local CSV found. Run with --fetch to download it, or --local <path>.`,
  );
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

const emptyDistribution = () => ({ not_ready: 0, moderately_ready: 0, ready: 0 });

/**
 * The band a population sits in: the one most of its facilities are in.
 *
 * Counted, never averaged — there is no score in this model to take a mean of,
 * which is the whole reason the model has no score. Ties go to the worse band:
 * a population split evenly between Not ready and Ready is not Ready.
 */
function dominantBand(dist) {
  let best = null;
  for (const band of BANDS) {
    if (dist[band] > 0 && (best === null || dist[band] > dist[best])) best = band;
  }
  return best;
}

function distributionOf(facilities, key) {
  const dist = emptyDistribution();
  for (const f of facilities) if (f[key]) dist[f[key]] += 1;
  return dist;
}

const SEVERITIES = ['none', 'minor', 'moderate', 'major'];

/**
 * How a population's facilities split across each domain's highest gap
 * severity.
 *
 * The sheet reports a domain as the worst gap in it, not as a readiness band,
 * so the per-domain reading is a count of facilities per severity and nothing
 * rolls it up into a band.
 */
function severityDistributionOf(facilities) {
  return Object.fromEntries(
    DOMAIN_IDS.map((id) => {
      const dist = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
      for (const f of facilities) dist[f.domainSeverity[id]] += 1;
      return [id, dist];
    }),
  );
}

// ---------------------------------------------------------------------------
// Row → facility
// ---------------------------------------------------------------------------

const band = (raw, what, uuid) => {
  const v = BAND_BY_LABEL[String(raw ?? '').trim()];
  if (!v) throw new Error(`Unknown ${what} band ${JSON.stringify(raw)} for facility ${uuid}`);
  return v;
};

/** `Not available`, blanks and other non-numeric placeholders → null. */
function optionalNumber(raw) {
  const s = String(raw ?? '').replace(/,/g, '').trim();
  if (!s || s === 'Not available') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function optionalText(raw) {
  const s = String(raw ?? '').trim();
  return !s || s === 'Not available' ? null : s;
}

function buildFacility(row, blocks, catalogueById, lgaIndex, stateMeta, workbook) {
  const uuid = String(row[COL.uuid] ?? '').trim();
  if (!uuid) throw new Error('Row with no facility UUID');

  const stateId = slugify(row[COL.state]);
  const meta = stateMeta.get(stateId);
  if (!meta) throw new Error(`Facility ${uuid} names unknown state "${row[COL.state]}"`);

  /**
   * The zone comes from the boundary layer, not the sheet — one source for a
   * fact the app filters on. But the sheet carries its own zone column, so the
   * two are checked against each other: a free agreement test between the
   * survey's geography and the country's, and a real signal if a facility has
   * been filed under the wrong state.
   */
  if (slugify(row[COL.zone]) !== slugify(meta.zone)) {
    throw new Error(
      `Facility ${uuid} (${meta.name}) is zoned "${row[COL.zone]}" in the sheet, ` +
        `but the boundary layer puts ${meta.name} in "${meta.zone}"`,
    );
  }

  const lga = resolveLga(stateId, slugify(row[COL.lga]), lgaIndex);

  /**
   * This facility's row in the raw ODK export — its setting and its position.
   *
   * Matched on UUID, falling back to state/LGA/name for the two facilities
   * whose UUID was destroyed by spreadsheet auto-formatting — in both files
   * alike, which is why neither can be matched on id. Null if a facility cannot
   * be matched at all; the build reports how many, so a re-export that loses a
   * column shows up as a number rather than as a field quietly reading one
   * value everywhere.
   */
  const record = workbook.find(uuid, nameKey(row[COL.state], row[COL.lga], row[COL.name]));

  const gaps = [];
  /**
   * The actions this facility's own row asks for, split into unit actions.
   *
   * Read from the row rather than looked up from the catalogue, because no two
   * facilities need quite the same thing: one buys two tablets and another
   * five, one needs three desks and a fan. The catalogue says which actions a
   * condition can call for; the row says how many.
   */
  const interventions = [];
  /** Action id → quantity. The published form of the list above. */
  const actions = {};
  const costByDomain = Object.fromEntries(DOMAIN_IDS.map((d) => [d, 0]));
  let costNGN = 0;
  let unpricedInterventions = 0;
  let recordedGaps = 0;

  for (const block of blocks) {
    const condition = conditionInRow(row, block);
    if (!condition) continue;
    const gap = catalogueById.get(condition.id);
    if (!gap) throw new Error(`Facility ${uuid} carries uncatalogued gap "${condition.label}"`);
    gaps.push(gap.id);
    if (gap.recorded) recordedGaps += 1;

    const found = interventionsInRow(row, block);
    for (const iv of found) {
      interventions.push({ ...iv, domain: gap.domain, recorded: gap.recorded });
      actions[iv.id] = (actions[iv.id] ?? 0) + iv.quantity;
    }

    const { costNGN: c, unpriced } = interventionsCost(found);
    costByDomain[gap.domain] += c;
    costNGN += c;
    unpricedInterventions += unpriced;
  }

  return {
    uuid,
    name: titleCase(row[COL.name]),
    state: meta.name,
    stateId,
    lga: lga.name,
    lgaId: lga.lgaId,
    zone: meta.zone,
    /**
     * The surveyed position, from the ERA workbook.
     *
     * Null where the facility could not be matched, or where its row carried no
     * fix — never invented. `projectFacilities` drops a facility without one, so
     * an unmatched facility still appears in the pane's list and stays
     * selectable; it simply is not drawn. A position presented as surveyed when
     * it is not is the single error this dataset cannot afford.
     */
    lat: record?.lat ?? null,
    lon: record?.lon ?? null,
    functionalityLevel: String(row[COL.functionality] ?? '').trim(),
    isBHCPF: String(row[COL.facilityGroup] ?? '').trim() === 'BHCPF',

    /**
     * Rural or urban, from the raw ODK export.
     *
     * Matched on UUID, falling back to state/LGA/name for the two facilities
     * whose UUID was destroyed by spreadsheet auto-formatting — in both files
     * alike, which is why neither can be matched on id. Null if a facility
     * cannot be matched at all; the build reports how many, so a re-export that
     * loses the column shows up as a number rather than as a field quietly
     * reading one value everywhere.
     */
    geography: record?.geography ?? null,

    /**
     * The one overall reading the dataset carries.
     *
     * An earlier revision reported every facility twice — readiness to *use* an
     * EMR beside readiness to *deploy* one — and the dashboard showed the pair
     * because the distance between them was the interesting part. The revised
     * costing model withdrew the use column and made the deployment band equal
     * to the technical infrastructure reading, so there is one reading here
     * now and showing it twice would say nothing.
     */
    deploymentBand: band(row[COL.deploymentBand], 'EMR-deployment', uuid),
    /**
     * Each domain's highest gap severity, from the sheet's own four columns.
     * Not a readiness band — the source classifies readiness once, overall.
     */
    domainSeverity: Object.fromEntries(
      DOMAINS.map((d) => {
        const raw = String(row[d.severityCol] ?? '').trim();
        const v = DOMAIN_SEVERITY_BY_LABEL[raw];
        if (!v) throw new Error(`Unknown ${d.label} severity ${JSON.stringify(raw)} for ${uuid}`);
        return [d.id, v];
      }),
    ),

    /** Every condition this facility sits under, including an area's "No gap
     *  recorded" where actions are costed without a gap. */
    gaps,
    /** Action id → how many. Every cost on the page is built from this and the
     *  unit prices in the catalogue. */
    actions,
    /** Gaps the survey recorded — the unrecorded conditions are costed but are
     *  not gaps. */
    gapCount: recordedGaps,
    /** This facility's own actions, for the rollups. Not published: `actions`
     *  carries the same thing in a fraction of the size. */
    interventions,
    costNGN,
    costByDomain,
    /** Interventions this facility needs whose price the sheet does not carry.
     *  Query A — 2,274 device-maintenance actions. Counted so a total can say
     *  what it excludes. */
    unpricedInterventions,

    dailyClientLoad: optionalText(row[COL.dailyClientLoad]),
    mtnBaseStation: optionalText(row[COL.mtnBaseStation]),
    mtnDistanceKm: optionalNumber(row[COL.mtnDistanceKm]),
    mtnServiceability: optionalText(row[COL.mtnServiceability]),
    mtn4gSignal: optionalText(row[COL.mtn4gSignal]),
    airtelDistanceM: optionalNumber(row[COL.airtelDistanceM]),
  };
}

/**
 * Gap area id → display label, filled once the sheet is parsed.
 *
 * Module-level because `deploymentFor` needs it four call sites below `main`
 * and has no other use for the areas table — threading a lookup through
 * `profileFor` for one string would be worse than a map filled in one place.
 */
const AREA_LABEL = new Map();
const areaLabel = (id) => AREA_LABEL.get(id) ?? id;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check one row's arithmetic against the sheet's own summary columns.
 *
 * Not a sanity check on our parsing alone — it is a check that the sheet still
 * means what `docs/ASSESSMENT_DATA.md` says it means. Every one of these held
 * in all 2,806 rows when the dataset was reviewed.
 */
/**
 * Facilities whose domain severity the sheet states differently from its own
 * urgency cells.
 *
 * Three, all Technical Infrastructure, all the same shape: a recorded
 * service-point gap with a Minor action to complete during deployment, and the
 * severity column reading "No gap present". Every other facility with that
 * pattern — 2,000-odd of them — reads Minor. The dashboard shows the sheet's
 * own column, as it does everywhere; these are named here, and listed in
 * docs/data-queries, so that a fourth fails the build instead of joining them.
 */
const SEVERITY_EXCEPTIONS = {
  'fbe76560-d747-4d50-b0b0-a358cc5f54c3': { domain: 'technical_infrastructure', stated: 'none', implied: 'minor' },
  'e2aa0af9-c969-4924-8309-7b01f7b85dfe': { domain: 'technical_infrastructure', stated: 'none', implied: 'minor' },
  'e333ac32-eb1a-4b6c-888c-937b01c94541': { domain: 'technical_infrastructure', stated: 'none', implied: 'minor' },
};
const severityExceptions = [];

function validateRow(row, facility, blocks, problems) {
  const uuid = facility.uuid;
  const fail = (msg) => problems.push(`${uuid}: ${msg}`);

  // 1. Each domain subtotal = the sum of that facility's own actions.
  for (const d of DOMAINS) {
    const stated = parseMoney(row[d.costTotalCol]) ?? 0;
    if (Math.abs(stated - facility.costByDomain[d.id]) > ROUNDING_TOLERANCE) {
      fail(`${d.label} cost: sheet ₦${stated}, actions sum to ₦${facility.costByDomain[d.id]}`);
    }
  }

  // 2. Facility total = the same actions, all domains. See ROUNDING_TOLERANCE.
  const statedTotal = parseMoney(row[COL.totalCost]) ?? 0;
  const drift = statedTotal - facility.costNGN;
  if (Math.abs(drift) > ROUNDING_TOLERANCE) {
    fail(`total cost: sheet ₦${statedTotal}, actions sum to ₦${facility.costNGN}`);
  }

  // 3. The summary columns count Technical Infrastructure *action cells* —
  //    before they are split into units — by urgency.
  const cells = Object.fromEntries(HORIZONS.map((h) => [h, 0]));
  for (const block of blocks) {
    if (block.domain !== 'technical_infrastructure') continue;
    for (const slot of block.slots) {
      const text = String(row[slot.label] ?? '').trim();
      if (!text || text === 'No gap') continue;
      cells[WHEN_BY_LABEL[String(row[slot.when] ?? '').trim()].horizon] += 1;
    }
  }
  for (const [horizon, col] of Object.entries(SUMMARY_COL)) {
    const stated = Number(row[col]);
    if (stated !== cells[horizon]) {
      fail(`${horizon} count: sheet ${stated}, this row's actions imply ${cells[horizon]}`);
    }
  }

  // 4. Deployment readiness is a function of the Technical Infrastructure
  //    actions alone, exactly: any Major is Not ready, any Moderate is
  //    Moderately ready. Gaps in the other three domains — some of them Major
  //    — do not enter it. That is the sheet's rule, checked rather than assumed.
  const expected =
    cells.major > 0 ? 'not_ready' : cells.moderate > 0 ? 'moderately_ready' : 'ready';
  if (facility.deploymentBand !== expected) {
    fail(
      `deployment band is ${facility.deploymentBand}; ` +
        `${cells.major} major + ${cells.moderate} moderate implies ${expected}`,
    );
  }

  // 5. Each domain's severity is the worst urgency written against the gaps
  //    the survey recorded in it — every urgency cell, including the few with
  //    no action beside them (a facility already on an annual maintenance
  //    schedule still gets a Minor there). Actions costed under "No gap
  //    recorded" raise no severity: the sheet says there is no gap. Three
  //    facilities break this in the sheet itself; see SEVERITY_EXCEPTIONS.
  for (const d of DOMAINS) {
    const horizons = [];
    for (const block of blocks) {
      if (block.domain !== d.id || gapValueInRow(row, block) === null) continue;
      for (const slot of block.slots) {
        const when = WHEN_BY_LABEL[String(row[slot.when] ?? '').trim()];
        if (when) horizons.push(when.horizon);
      }
    }
    const implied = severityOfHorizons(horizons);
    const stated = facility.domainSeverity[d.id];
    if (stated === implied) continue;
    const known = SEVERITY_EXCEPTIONS[uuid];
    if (known && known.domain === d.id && known.stated === stated && known.implied === implied) {
      severityExceptions.push(uuid);
      continue;
    }
    fail(`${d.label} severity is ${stated}; its urgencies imply ${implied}`);
  }

  return drift;
}

// ---------------------------------------------------------------------------
// Roll-ups
// ---------------------------------------------------------------------------

const DOMAIN_CATEGORY = {
  technical_infrastructure: 'infrastructure',
  workforce_capacity: 'workforce',
  workflow_transition: 'workflow',
  data_use_reporting: 'data_use',
};

/**
 * Roll a facility population up into what deploying into it takes.
 *
 * `gaps` counts what is wrong — every gap, by how many facilities carry it.
 * `lines` counts what to do about it, priced and phased. The two are different
 * questions and the pane asks both.
 */
function deploymentFor(facilities, catalogueById) {
  const gapCounts = new Map();
  const lines = new Map();
  const costByHorizon = Object.fromEntries(HORIZONS.map((h) => [h, 0]));
  const costByPhase = Object.fromEntries(PHASES.map((p) => [p, 0]));
  const costByDomain = Object.fromEntries(DOMAIN_IDS.map((d) => [d, 0]));
  let unpriced = 0;

  for (const f of facilities) {
    for (const id of f.gaps) gapCounts.set(id, (gapCounts.get(id) ?? 0) + 1);

    /**
     * Lines come from the facilities' own actions, not from their gaps.
     *
     * One line per action type, so a plan reads "5,920 tablets at ₦233,333"
     * rather than one line per way a facility happened to be costed. The
     * quantity is units; the facility count beside it is how many facilities
     * need any.
     */
    for (const iv of f.interventions) {
      const line = lines.get(iv.id) ?? {
        id: iv.id,
        label: iv.label,
        domain: iv.domain,
        horizon: iv.horizon,
        phase: iv.phase,
        unit: iv.unit,
        unitCostNGN: iv.unitCostNGN,
        quantity: 0,
        facilityCount: 0,
        totalCostNGN: 0,
        /** Lines the sheet does not price. Kept as a flag on the line rather
         *  than folded into a zero, so a reader can see which of them the
         *  total is silent about. */
        priced: iv.unitCostNGN !== null,
      };
      line.quantity += iv.quantity;
      line.facilityCount += 1;
      if (iv.costNGN === null) {
        unpriced += 1;
      } else {
        line.totalCostNGN += iv.costNGN;
        costByHorizon[iv.horizon] += iv.costNGN;
        costByPhase[iv.phase] += iv.costNGN;
        costByDomain[iv.domain] += iv.costNGN;
      }
      lines.set(iv.id, line);
    }
  }

  const rows = [...lines.values()].sort(
    (a, b) => b.totalCostNGN - a.totalCostNGN || a.label.localeCompare(b.label),
  );

  return {
    facilityCount: facilities.length,
    /** Recorded gaps only — the "No gap recorded" conditions are costed, not
     *  counted. */
    gapCount: facilities.reduce((sum, f) => sum + f.gapCount, 0),
    costNGN: facilities.reduce((sum, f) => sum + f.costNGN, 0),
    /** Facility actions in scope carrying no price. */
    unpricedInterventions: unpriced,
    costByHorizon,
    costByPhase,
    costByDomain,
    gaps: [...gapCounts.entries()]
      .map(([id, facilityCount]) => {
        const g = catalogueById.get(id);
        return {
          id,
          domain: g.domain,
          subDomain: areaLabel(g.area),
          label: g.label,
          severity: g.severity,
          recorded: g.recorded,
          facilityCount,
        };
      })
      .sort((a, b) => b.facilityCount - a.facilityCount),
    lines: rows,
  };
}

/** The same lines, in the shape the Investment Plan reads. */
function investmentsFor(deployment) {
  return deployment.lines.map((l) => ({
    id: l.id,
    label: l.label,
    themeId: l.domain,
    category: DOMAIN_CATEGORY[l.domain],
    /** The sheet's urgency and phase, carried straight through. */
    horizon: l.horizon,
    phase: l.phase,
    /** Units — tablets, desks, socket points — or facilities where the action
     *  is one per facility, in which case `unit` is null. */
    quantity: l.quantity,
    unit: l.unit,
    unitCostNGN: l.unitCostNGN,
    totalCostNGN: l.priced ? l.totalCostNGN : null,
    facilityCount: l.facilityCount,
  }));
}

/**
 * The coverage layer, for the areas this dataset can speak about.
 *
 * Nothing measurable comes out of the facility rows here — the band and the two
 * rates below it are the coverage workbook's, and this dataset's own MTN
 * serviceability is a per-facility finding that stays on the facility, where
 * Assessed States reports it. Staff headcount is absent from this dataset
 * entirely.
 */
function coverageFor(desk = null, maturity = null) {
  return {
    /**
     * The band arrives classified, from the State Maturity sheet, and is
     * copied across untouched — see `build-maturity.mjs`.
     *
     * This is the reading National Coverage paints and Assessed States fills
     * its twelve surveyed states with. It was the coverage workbook's
     * electricity/internet classification; the maturity sheet scores those
     * same two rates alongside the four governance answers, so it is the
     * fuller reading of the same state.
     *
     * Set on states only — the sheet has no rows below one. Null on the six
     * states the sheet marks Not assessed, on every LGA and on the national
     * profile: *not measured*, which the maps paint as no-data rather than as
     * the lowest band.
     */
    band: maturity?.band ?? null,

    /**
     * Technical Infrastructure keeps the coverage workbook's band; Workforce
     * Capacity and Leadership & Governance stay null.
     *
     * The coverage workbook classifies on electricity and internet, both of
     * which are technical infrastructure and nothing else, so that band *is*
     * the domain's reading. The maturity sheet scores the four governance
     * answers but publishes no band for them on their own — only the six-item
     * mean — and a band is never rebuilt here from scores, so Leadership
     * carries none. Its four answers are below, in `leadership`.
     */
    themeBands: {
      technical_infrastructure: desk?.band ?? null,
      workforce_capacity: null,
      leadership_governance: null,
    },
    measures: {
      staffCount: null,
      electricityAccessPct: desk?.electricityAccessPct ?? null,
      internetSubscriptionPct: desk?.internetSubscriptionPct ?? null,
    },

    /**
     * The counts the rate is taken over, where the source has them.
     *
     * Null below the state, and null is the honest answer: the workbook has no
     * LGA rows, and an LGA showing 0 subscriptions would be asserting something
     * nobody measured.
     */
    internet: desk
      ? {
          population: desk.population,
          total: desk.subscriptions,
          byProvider: desk.byProvider,
        }
      : null,

    /**
     * The four governance answers the maturity band was partly scored from.
     *
     * The same relationship `internet` has to the internet rate: part of the
     * arithmetic behind the band at the top, so a reader told a state is Not
     * mature can read down and find which of the four things it is missing.
     *
     * Null on the six unassessed states and at every level but the state —
     * the sheet has no LGA rows and makes no national claim. Null is *not
     * measured*, and the pane says so rather than printing four "No"s nobody
     * wrote.
     *
     * A band per sub-domain, already classified in `build-maturity.mjs` by the
     * sheet's own cut points — see `LeadershipBands`.
     */
    leadership: maturity?.subDomains ?? null,
  };
}

function profileFor({
  id,
  level,
  name,
  parentId,
  zone,
  facilities,
  catalogueById,
  extra,
  desk,
  maturity,
}) {
  const assessed = facilities.length > 0;
  const deployment = assessed ? deploymentFor(facilities, catalogueById) : null;

  return {
    id,
    level,
    name,
    parentId,
    zone,
    evidenceGrade: assessed ? 'primary' : 'secondary',
    facilityCount: facilities.length,
    ...extra,

    /** The one overall reading, as a distribution and as a rolled-up band. */
    deploymentDistribution: distributionOf(facilities, 'deploymentBand'),
    deploymentBand: assessed
      ? dominantBand(distributionOf(facilities, 'deploymentBand'))
      : null,

    /** Each domain's highest gap severity, counted over the facilities. */
    severityDistribution: severityDistributionOf(facilities),

    coverage: coverageFor(desk, maturity),
    investments: deployment ? investmentsFor(deployment) : [],
    deployment,
  };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const readJSON = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

/** The existing snapshot's `builtAt`, if it was built from this same source. */
function previousBuiltAt(contentHash) {
  const path = resolve(OUT, 'snapshot.json');
  if (!existsSync(path)) return null;
  try {
    const prev = JSON.parse(readFileSync(path, 'utf8'));
    return prev.contentHash === contentHash ? (prev.builtAt ?? null) : null;
  } catch {
    // A malformed or half-written snapshot is not worth failing a build over —
    // the worst case is a fresh timestamp, which is what it would have been.
    return null;
  }
}

/** The boundary layer's `geozone` code → the zone name the app filters on. */
const ZONE_BY_CODE = {
  NCZ: 'North Central',
  NEZ: 'North East',
  NWZ: 'North West',
  SEZ: 'South East',
  SSZ: 'South South',
  SWZ: 'South West',
};

async function main() {
  const argv = process.argv.slice(2);
  const { text, origin } = await loadCsv(argv);
  const contentHash = createHash('sha256').update(text).digest('hex').slice(0, 16);

  const { blocks, rows, helpers, scenarioCols } = parseAssessmentCsv(text);
  if (helpers.length !== 2 || Object.keys(scenarioCols).length !== SCENARIO_PACKAGES.length) {
    throw new Error(
      `Found ${helpers.length} of 2 scenario helper columns and ` +
        `${Object.keys(scenarioCols).length} of ${SCENARIO_PACKAGES.length} package ` +
        `readiness columns. The Investment Plan's scenarios are read from them.`,
    );
  }
  process.stderr.write(
    `Parsed ${rows.length} facilities, ${blocks.length} gap columns from ${origin}\n`,
  );

  const gapAreas = extractGapAreas(blocks);
  for (const a of gapAreas) AREA_LABEL.set(a.id, a.label);

  const { gaps: catalogue, actions: actionTypes } = extractCatalogue(rows, blocks);
  const catalogueById = new Map(catalogue.map((g) => [g.id, g]));

  // Which scenario component each power and connectivity action is, from the
  // sheet's helper columns. One action type, one component, in every row.
  const scenarioOf = new Map();
  for (const row of rows) {
    for (const [id, component] of Object.entries(scenarioComponentsInRow(row, helpers))) {
      const seen = scenarioOf.get(id);
      if (seen && seen !== component) {
        throw new Error(`Action ${id} is "${seen}" in one row and "${component}" in another`);
      }
      scenarioOf.set(id, component);
    }
  }
  for (const a of actionTypes) a.scenario = scenarioOf.get(a.id) ?? null;
  process.stderr.write(
    `Extracted ${gapAreas.length} gap areas, ${catalogue.length} conditions ` +
      `(${catalogue.filter((g) => !g.recorded).length} unrecorded), ` +
      `${actionTypes.length} action types\n`,
  );

  // --- The raw workbook -----------------------------------------------------

  if (!existsSync(WORKBOOK)) {
    throw new Error(
      `Missing ${WORKBOOK}.\n\n` +
        `It is deliberately not in the repository — 37 MB, and everything it ` +
        `feeds is already committed under public/data. Put a copy at the path ` +
        `above to regenerate that data; you do not need it to build or run the ` +
        `app.\n\n` +
        `It supplies each facility's rural/urban setting and coordinate. ` +
        `Without it both would silently vanish from a committed dataset, so ` +
        `the build stops instead.`,
    );
  }
  const workbook = lookupFor(parseFacilityWorkbook(readFileSync(WORKBOOK)));
  process.stderr.write(`Read ${workbook.size} rows from the raw facility workbook\n`);

  // --- Geography ------------------------------------------------------------

  const statesGeo = readJSON('public/geo/nigeria-states.geojson');
  const lgaIndex = readJSON('public/geo/lga-index.json');

  const stateMeta = new Map();
  for (const f of statesGeo.features) {
    const raw = String(f.properties.statename);
    const name = raw === 'Fct' ? 'FCT' : raw;
    stateMeta.set(slugify(name), { name, zone: ZONE_BY_CODE[f.properties.geozone] ?? null });
  }

  // --- The coverage workbook's desk readings --------------------------------
  //
  // Read from committed JSON, not from the workbook: `npm run data:coverage`
  // extracts and validates that file, and the workbook itself is gitignored, so
  // this build needs nothing that a clone does not have.
  const deskCoverage = readJSON('scripts/source-data/national-coverage.json');
  const deskByState = new Map(deskCoverage.states.map((s) => [s.id, s]));
  const deskNational = deskCoverage.national;

  // The national block is computed from the same 37 rows, so a mismatch means
  // the JSON was hand-edited — the one thing its own header tells you not to do.
  const deskPopulation = deskCoverage.states.reduce((a, s) => a + s.population, 0);
  if (deskNational.population !== deskPopulation) {
    throw new Error(
      `The coverage JSON's national population (${deskNational.population.toLocaleString()}) ` +
        `is not the sum of its states (${deskPopulation.toLocaleString()}). ` +
        `Re-run \`npm run data:coverage\` rather than editing that file.`,
    );
  }

  // Every state, or none — a state silently missing its band is a state that
  // renders as "not measured" on a page whose entire subject is that band.
  const unread = [...stateMeta.keys()].filter((id) => !deskByState.has(id));
  const unplaced = [...deskByState.keys()].filter((id) => !stateMeta.has(id));
  if (unread.length || unplaced.length) {
    throw new Error(
      `The coverage readings do not line up with the geography.\n` +
        (unread.length ? `  no reading for: ${unread.join(', ')}\n` : '') +
        (unplaced.length ? `  reading for unknown state: ${unplaced.join(', ')}\n` : '') +
        `\nRe-run \`npm run data:coverage\`; if that succeeds, the geography ` +
        `and the workbook disagree about the state list.`,
    );
  }
  process.stderr.write(`Read desk coverage readings for ${deskByState.size} states\n`);

  // --- The State Maturity sheet's readings ---------------------------------
  //
  // The band on National Coverage, and on Assessed States' twelve surveyed
  // states. Read the same way as coverage: committed JSON, extracted and
  // validated by `npm run data:maturity`.
  //
  // Every state has a row, and six of them read Not assessed with a null band.
  // So the check is every-state-or-none, like coverage: a state missing from
  // the file would render as unassessed without anyone having said so.
  const deskMaturity = readJSON('scripts/source-data/state-maturity.json');
  const maturityByState = new Map(deskMaturity.states.map((s) => [s.id, s]));

  const unscored = [...stateMeta.keys()].filter((id) => !maturityByState.has(id));
  const misplaced = [...maturityByState.keys()].filter((id) => !stateMeta.has(id));
  if (unscored.length || misplaced.length) {
    throw new Error(
      `The maturity readings do not line up with the geography.\n` +
        (unscored.length ? `  no row for: ${unscored.join(', ')}\n` : '') +
        (misplaced.length ? `  row for unknown state: ${misplaced.join(', ')}\n` : '') +
        `\nRe-run \`npm run data:maturity\`; if that succeeds, the geography ` +
        `and the workbook disagree about the state list.`,
    );
  }

  const assessedCount = deskMaturity.states.filter((s) => s.band).length;
  process.stderr.write(
    `Read state maturity for ${assessedCount} of ${stateMeta.size} states ` +
      `(${stateMeta.size - assessedCount} not assessed)\n`,
  );

  // --- Facilities -----------------------------------------------------------

  const facilities = [];
  const problems = [];
  /** Package id → facilities where the workbook's own scenario readiness
   *  disagrees with `scenarioBand`. See `SCENARIO_PACKAGES.knownMismatches`. */
  const scenarioMismatches = Object.fromEntries(SCENARIO_PACKAGES.map((p) => [p.id, 0]));
  let roundingDrift = 0;
  let roundedRows = 0;
  for (const row of rows) {
    const facility = buildFacility(row, blocks, catalogueById, lgaIndex, stateMeta, workbook);
    const drift = validateRow(row, facility, blocks, problems);

    // The scenarios, row by row against the sheet's own readiness columns.
    const tagged = facility.interventions.map((iv) => ({
      ...iv,
      scenario: scenarioOf.get(iv.id) ?? null,
    }));
    for (const p of SCENARIO_PACKAGES) {
      const stated = BAND_BY_LABEL[String(row[scenarioCols[p.id]] ?? '').trim()];
      if (!stated) {
        problems.push(`${facility.uuid}: no readiness under package "${p.label}"`);
      } else if (stated !== scenarioBand(tagged, p.components)) {
        scenarioMismatches[p.id] += 1;
      }
    }
    if (drift) {
      roundingDrift += drift;
      roundedRows += 1;
    }
    facilities.push(facility);
  }

  // Ten packages agree with the rule in every row; four disagree by fixed
  // counts, each for a named reason in the sheet. A count that moves means
  // the workbook's scenarios changed, and the doc and the page need looking at.
  for (const p of SCENARIO_PACKAGES) {
    if (scenarioMismatches[p.id] !== p.knownMismatches) {
      problems.push(
        `package "${p.label}": the sheet's readiness disagrees with the rule at ` +
          `${scenarioMismatches[p.id]} facilities, where ${p.knownMismatches} were ` +
          `expected — see SCENARIO_PACKAGES in scripts/assessment-source.mjs`,
      );
    }
  }

  if (problems.length) {
    const shown = problems.slice(0, 20).join('\n  ');
    throw new Error(
      `${problems.length} row(s) disagree with the sheet's own summary columns.\n  ${shown}` +
        (problems.length > 20 ? `\n  …and ${problems.length - 20} more` : '') +
        `\n\nThese relationships held in every row when the dataset was reviewed ` +
        `(docs/ASSESSMENT_DATA.md). A failure here means the sheet's logic has ` +
        `changed and the doc needs revisiting — not that the check should be relaxed.`,
    );
  }

  const uuids = new Set(facilities.map((f) => f.uuid));
  if (uuids.size !== facilities.length) {
    throw new Error(`${facilities.length - uuids.size} duplicate facility UUID(s)`);
  }

  // --- Roll up --------------------------------------------------------------

  const byState = new Map();
  for (const f of facilities) {
    if (!byState.has(f.stateId)) byState.set(f.stateId, []);
    byState.get(f.stateId).push(f);
  }

  const lgaProfiles = [];
  const stateProfiles = [];

  for (const [stateId, meta] of [...stateMeta.entries()].sort()) {
    const stateFacilities = byState.get(stateId) ?? [];
    const lgas = lgaIndex[stateId] ?? [];
    if (!lgas.length) throw new Error(`No LGAs indexed for ${stateId}`);

    const byLga = new Map();
    for (const f of stateFacilities) {
      if (!byLga.has(f.lgaId)) byLga.set(f.lgaId, []);
      byLga.get(f.lgaId).push(f);
    }

    for (const lga of lgas) {
      lgaProfiles.push(
        profileFor({
          id: `${stateId}.${lga.lgaId}`,
          level: 'lga',
          name: lga.name,
          parentId: stateId,
          zone: null,
          facilities: byLga.get(lga.lgaId) ?? [],
          catalogueById,
        }),
      );
    }

    stateProfiles.push(
      profileFor({
        id: stateId,
        level: 'state',
        name: meta.name,
        parentId: null,
        zone: meta.zone,
        facilities: stateFacilities,
        catalogueById,
        desk: deskByState.get(stateId),
        maturity: maturityByState.get(stateId),
        extra: { lgaCount: lgas.length, assessedLgaCount: byLga.size },
      }),
    );
  }

  const national = profileFor({
    id: 'national',
    level: 'national',
    name: 'Nigeria',
    parentId: null,
    zone: null,
    facilities,
    catalogueById,
    /**
     * The national reading, from the workbook rather than from these 37 rows.
     *
     * `build-coverage.mjs` computes it: internet as subscriptions over
     * population — the same division the state rate is, done on the totals —
     * and electricity as the survey's own published national rate, which is the
     * only figure available because no state row carries a numerator. Neither
     * is an average of the states. It carries no `band`: the workbook
     * classifies states, and the country's own band would be a judgement
     * nobody made.
     */
    desk: deskNational,
    extra: {
      lgaCount: lgaProfiles.length,
      assessedLgaCount: new Set(facilities.map((f) => `${f.stateId}.${f.lgaId}`)).size,
    },
  });

  const snapshot = {
    /**
     * When the *data* was built, not when the script last ran.
     *
     * Carried forward from the previous snapshot whenever the source hash is
     * unchanged, so re-running the ingest without a sheet change produces a
     * genuinely empty diff. `public/data/` is committed (the Vercel build does
     * not run this script), and a 11 MB directory that reports a spurious
     * change on every run is one nobody can review — the timestamp would be the
     * only thing that moved, and no diff would tell you that.
     */
    builtAt: previousBuiltAt(contentHash) ?? new Date().toISOString(),
    source: 'assessment — revised costing model and roadmap',
    sourceUrl: sourceUrl(),
    contentHash,
    facilityCount: facilities.length,
    lgaCount: national.assessedLgaCount,
    statesPrimary: stateProfiles.filter((s) => s.evidenceGrade === 'primary').length,
    statesSecondary: stateProfiles.filter((s) => s.evidenceGrade === 'secondary').length,
  };

  // --- Write ----------------------------------------------------------------

  mkdirSync(OUT, { recursive: true });
  const write = (name, value) =>
    writeFileSync(resolve(OUT, name), `${JSON.stringify(value)}\n`);

  /** `interventions` is working state for the rollups, not part of the
   *  published contract — a facility's actions are recoverable from its gaps
   *  and variants, and carrying them per facility would roughly double the
   *  file for nothing the app reads. */
  write(
    'facilities-summary.json',
    facilities.map(({ interventions: _actions, ...published }) => published),
  );
  write('states.json', stateProfiles);
  write('lgas.json', lgaProfiles);
  write('national.json', national);
  write('snapshot.json', snapshot);

  writeGapCatalogue(catalogue, actionTypes, gapAreas);
  writeNationalSplit(
    national.deploymentDistribution,
    facilities.length,
    national.deployment.unpricedInterventions,
  );

  report(facilities, catalogue, national, stateProfiles, { roundingDrift, roundedRows });
}

// ---------------------------------------------------------------------------
// Generated modules
// ---------------------------------------------------------------------------

function writeGapCatalogue(catalogue, actionTypes, areas) {
  const domains = DOMAINS.map((d) => ({ id: d.id, label: d.label, costed: true }));

  writeFileSync(
    resolve(ROOT, 'src/lib/gapCatalogue.ts'),
    `/**
 * GENERATED by scripts/ingest-assessment.mjs — do not edit.
 *
 * The gap dictionary, extracted from the assessment dataset rather than
 * declared. Three levels, as the source has them: **domain → gap area →
 * condition** — and beside them the **action types** a condition can call
 * for, each with its urgency, its phase, its unit and its unit price.
 *
 * A facility's own quantities are not here. They are on the facility
 * (\`FacilitySummary.actions\`), because no two facilities need quite the same
 * number of tablets or desks; \`facilityGapActions\` joins the two.
 *
 * Emitted rather than fetched: every control that offers a gap needs the whole
 * list before it can render one, so a network round-trip would only buy a
 * spinner on a filter dropdown.
 *
 * There is no leadership & governance domain — it is not assessed at facility
 * level and has no column in the source.
 */

import type {
  ActionPhase,
  Band,
  ScenarioComponentId,
  FacilityThemeId,
  GapAreaId,
  GapDomainId,
  GapSeverity,
  Horizon,
} from './types';

/** Urgencies, worst-first. The source's four: Major and Moderate are what the
 *  deployment band is computed from. */
export const HORIZONS: Horizon[] = ${JSON.stringify(HORIZONS)};

/**
 * An urgency and when it falls. Minor spans two moments — the sheet has minor
 * gaps to fix *before* deployment and minor actions to complete *during* it —
 * and an action's own \`phase\` says which.
 */
export const HORIZON_LABEL: Record<Horizon, string> = {
  major: "Major — before deployment",
  moderate: "Moderate — before deployment",
  minor: "Minor — before or during deployment",
  long_term: "Long-term — after deployment",
};

/** The short form, for a chip beside an action. */
export const HORIZON_SHORT: Record<Horizon, string> = {
  major: "Major",
  moderate: "Moderate",
  minor: "Minor",
  long_term: "Long-term",
};

/** What an action's urgency does to readiness. */
export const HORIZON_SEVERITY: Record<Horizon, GapSeverity> = {
  major: "blocking",
  moderate: "blocking",
  minor: "partial",
  long_term: "partial",
};

export const GAP_DOMAINS = ${JSON.stringify(domains, null, 2)} as const;

export const GAP_DOMAIN_LABEL: Record<GapDomainId, string> = ${JSON.stringify(
      Object.fromEntries(DOMAINS.map((d) => [d.id, d.label])),
      null,
      2,
    )};

/**
 * One kind of action — "Procure EMR-capable tablets", "Install a router" — at
 * one urgency.
 *
 * The same work at two urgencies is two action types, because it sits in two
 * places in the plan: a solar install is Major where a facility has no power
 * and Moderate where it has a few hours a day.
 */
export interface ActionDef {
  id: string;
  label: string;
  domain: GapDomainId;
  /** The gap area the action closes. One per action type, which is what lets a
   *  facility's actions be tied back to its gaps. */
  area: GapAreaId;
  horizon: Horizon;
  phase: ActionPhase;
  /** What one unit is — "tablet", "desk", "socket point" — or null where the
   *  action is one per facility. */
  unit: string | null;
  /** Null where the source carries no price. Not zero. */
  unitCostNGN: number | null;
  /** The scenario component this action is — router, full solar system and
   *  so on — for the six power and connectivity fixes; null for the rest. */
  scenario: ScenarioComponentId | null;
}

export const ACTIONS: ActionDef[] = ${JSON.stringify(actionTypes, null, 2)};

export const ACTION_BY_ID: Record<string, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
);

export interface GapAreaDef {
  id: GapAreaId;
  domain: GapDomainId;
  /** The column header without its trailing "gap" — "Power",
   *  "Facility-connectivity". Say "Power gap" where the noun is wanted. */
  label: string;
  /** Position in the sheet, which leads each domain with its blocking areas. */
  order: number;
}

/**
 * The gap areas — the level between a domain and a gap.
 *
 * One per gap column in the source. A facility holds **at most one condition
 * per area**, because a column holds one value, and that is what makes the area
 * the unit a filter and a rollup can count: counting areas counts facilities,
 * where counting conditions counts survey answers.
 *
 * In the sheet's column order, not alphabetical.
 */
export const GAP_AREAS: GapAreaDef[] = ${JSON.stringify(areas, null, 2)};

export const GAP_AREA_BY_ID: Record<string, GapAreaDef> = Object.fromEntries(
  GAP_AREAS.map((a) => [a.id, a]),
);

/** Gap areas for a domain selection. No domains ticked means every area — the
 *  same grammar as LGA under State. */
export function gapAreasForDomains(domains: readonly string[]): GapAreaDef[] {
  if (!domains.length) return GAP_AREAS;
  return GAP_AREAS.filter((a) => domains.includes(a.domain));
}

export interface GapDef {
  id: string;
  domain: GapDomainId;
  /** The gap area this condition sits in. */
  area: GapAreaId;
  /** The condition the survey recorded, verbatim — or "No gap recorded". */
  label: string;
  severity: GapSeverity;
  /**
   * False for an area's "No gap recorded" condition.
   *
   * The sheet costs socket points at 380 facilities whose wiring column reads
   * No gap, and furniture at 224 whose service-point column does. That money
   * is in the sheet's total and stays in every total here; the condition is
   * kept so the cost has somewhere to sit, and flagged so a *count of gaps*
   * leaves it out. Use \`isRecordedGap\` wherever gaps are counted.
   */
  recorded: boolean;
  /** Every action type this condition calls for anywhere, most urgent first. */
  actions: string[];
}

export const GAPS: GapDef[] = ${JSON.stringify(catalogue, null, 2)};

export const GAP_BY_ID: Record<string, GapDef> = Object.fromEntries(
  GAPS.map((g) => [g.id, g]),
);

/** Whether a condition is a gap the survey recorded. See \`GapDef.recorded\`. */
export function isRecordedGap(id: string): boolean {
  return GAP_BY_ID[id]?.recorded ?? false;
}

/** Gaps for a domain selection. No domains ticked means every gap. */
export function gapsForDomains(domains: readonly string[]): GapDef[] {
  if (!domains.length) return GAPS;
  return GAPS.filter((g) => domains.includes(g.domain));
}

/**
 * The gap ids in scope under the Domain and Gap area filters together. **The
 * rule.**
 *
 * Every figure derived from gaps goes through here — the pane's headline, the
 * per-domain rows, the facility card, the list rows and the map's investment
 * fills. That is the point: they cannot disagree about what was selected.
 *
 * Unrecorded conditions are in scope like any other: they carry cost, and a
 * cost total that dropped them would not reconcile to the sheet. Counts leave
 * them out through \`isRecordedGap\`.
 */
export function offeredGapIds(
  domains: readonly string[],
  gapAreas: readonly string[],
): Set<string> {
  const areas = gapAreas.length ? new Set(gapAreas) : null;
  const ids = new Set<string>();
  for (const g of GAPS) {
    if (domains.length && !domains.includes(g.domain)) continue;
    if (areas && !areas.has(g.area)) continue;
    ids.add(g.id);
  }
  return ids;
}

/** The conditions inside one area, worst-first — the order \`GAPS\` is already
 *  in, so this is a filter rather than a sort. */
export function gapsInArea(areaId: GapAreaId): GapDef[] {
  return GAPS.filter((g) => g.area === areaId);
}

/**
 * Whether an area can block deployment at all.
 *
 * The worst severity any of its recorded conditions carries — so \`blocking\`
 * means *some facility here is stopped*, not that every one is.
 */
export function gapAreaSeverity(areaId: GapAreaId): GapSeverity {
  return gapsInArea(areaId).some((g) => g.recorded && g.severity === 'blocking')
    ? 'blocking'
    : 'partial';
}

/** The areas a facility has a recorded gap in. At most one condition feeds
 *  each, so the length is how many areas are a problem here. */
export function facilityGapAreas(gapIds: readonly string[]): GapAreaId[] {
  const seen = new Set<GapAreaId>();
  for (const id of gapIds) {
    const gap = GAP_BY_ID[id];
    if (gap?.recorded) seen.add(gap.area);
  }
  return GAP_AREAS.filter((a) => seen.has(a.id)).map((a) => a.id);
}

/** Does this facility carry a recorded gap in any of these areas? The Gap area
 *  filter's own question — OR within the control, like every other
 *  multi-select. */
export function hasGapInAreas(gapIds: readonly string[], areas: readonly string[]): boolean {
  if (!areas.length) return true;
  return gapIds.some((id) => {
    const gap = GAP_BY_ID[id];
    return Boolean(gap?.recorded && areas.includes(gap.area));
  });
}

/** An action at one facility: the type, how many, and what that comes to. */
export interface FacilityAction extends ActionDef {
  quantity: number;
  /** \`unitCostNGN × quantity\`, or null where the action is unpriced. */
  costNGN: number | null;
}

/**
 * The actions one facility's gap asks for, with its own quantities.
 *
 * Joined through the area: a facility sits under one condition per area and
 * every action type belongs to one area, so the facility's actions that the
 * condition can call for are exactly this gap's.
 */
export function facilityGapActions(
  facility: { actions: Record<string, number> },
  gap: GapDef,
): FacilityAction[] {
  const out: FacilityAction[] = [];
  for (const id of gap.actions) {
    const quantity = facility.actions[id];
    if (!quantity) continue;
    const def = ACTION_BY_ID[id]!;
    out.push({
      ...def,
      quantity,
      costNGN: def.unitCostNGN === null ? null : def.unitCostNGN * quantity,
    });
  }
  return out;
}

/**
 * What a gap costs at one facility. Unpriced actions are reported separately
 * rather than counted as zero, so a total never silently absorbs a missing
 * price.
 */
export function facilityGapCost(
  facility: { actions: Record<string, number> },
  gap: GapDef,
): { costNGN: number; unpriced: number } {
  let costNGN = 0;
  let unpriced = 0;
  for (const a of facilityGapActions(facility, gap)) {
    if (a.costNGN === null) unpriced += 1;
    else costNGN += a.costNGN;
  }
  return { costNGN, unpriced };
}

/**
 * Every action type a condition can call for, as definitions. For a reader
 * looking at the condition rather than at a facility; never use it to cost
 * anything.
 */
export function gapActionDefs(gap: GapDef): ActionDef[] {
  return gap.actions.map((id) => ACTION_BY_ID[id]!).filter(Boolean);
}

/** Band ranks, so a caller can order gap severity beside a readiness band. */
export const SEVERITY_BAND: Record<GapSeverity, Band> = {
  blocking: "not_ready",
  partial: "moderately_ready",
};

/** The four facility domains. */
export const FACILITY_DOMAIN_IDS: FacilityThemeId[] = ${JSON.stringify(DOMAIN_IDS)};

/** The six power and connectivity fixes the scenarios fund, in the workbook's
 *  order. */
export const SCENARIO_COMPONENTS: { id: ScenarioComponentId; label: string }[] = ${JSON.stringify(
      SCENARIO_COMPONENTS,
      null,
      2,
    )};

export interface ScenarioPackageDef {
  id: string;
  label: string;
  components: ScenarioComponentId[];
}

/**
 * The fourteen packages the workbook costs, in its own order. Each funds one
 * or two of the six fixes; \`scenarioFor\` (src/lib/scenarios.ts) says what
 * readiness would then be.
 */
export const SCENARIO_PACKAGES: ScenarioPackageDef[] = ${JSON.stringify(
      SCENARIO_PACKAGES.map(({ id, label, components }) => ({ id, label, components })),
      null,
      2,
    )};
`,
  );
}

function writeNationalSplit(distribution, total, unpricedActions) {
  writeFileSync(
    resolve(ROOT, 'src/lib/nationalSplit.ts'),
    `/**
 * GENERATED by scripts/ingest-assessment.mjs — do not edit.
 *
 * The national EMR-deployment readiness split, available synchronously so the
 * landing page can paint before \`DataProvider\` has fetched anything.
 *
 * The one overall reading the dataset carries — the same figures every page
 * behind the front door is working from.
 */

import type { Band } from './types';

export const NATIONAL_DEPLOYMENT_SPLIT: Record<Band, number> = ${JSON.stringify(distribution)};

/** Facilities carrying a band — the denominator every share on the landing
 *  page is taken over. Every assessed facility carries one, so this is simply
 *  the survey size. */
export const NATIONAL_TOTAL = ${total};

/**
 * Facility actions the source records and does not price — routine device
 * maintenance, naming an EMR focal person, and the lockable-door checks the
 * sheet leaves "before costing".
 *
 * Generated rather than written into the footer as an adjective: the front
 * door states that its costs are incomplete, and how incomplete they are must
 * not be able to drift from the dataset saying so.
 */
export const NATIONAL_UNPRICED_ACTIONS: number = ${unpricedActions};
`,
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;

function report(facilities, catalogue, national, stateProfiles, rounding) {
  const assessed = stateProfiles.filter((s) => s.evidenceGrade === 'primary');
  const out = [];
  out.push('');
  out.push(`  facilities        ${facilities.length.toLocaleString()}`);
  out.push(`  states assessed   ${assessed.length}`);
  out.push(`  LGAs assessed     ${national.assessedLgaCount}`);
  out.push(`  conditions        ${catalogue.length}`);
  out.push(`  gap instances     ${national.deployment.gapCount.toLocaleString()}`);
  out.push(`  total investment  ${naira(national.deployment.costNGN)}`);
  out.push(`  unpriced actions  ${national.deployment.unpricedInterventions}`);
  out.push(`  severity queries  ${severityExceptions.length} (the sheet's own, see SEVERITY_EXCEPTIONS)`);
  out.push(
    `  sheet rounding    ${naira(rounding.roundingDrift)} over ` +
      `${rounding.roundedRows.toLocaleString()} facilities (the four-decimal tablet price)`,
  );
  // Reported rather than asserted. A hard floor on coverage would need an
  // arbitrary threshold; a number in the build output and in the committed
  // diff makes a lost column visible without inventing one.
  const rural = facilities.filter((f) => f.geography === 'rural').length;
  const urban = facilities.filter((f) => f.geography === 'urban').length;
  const unknown = facilities.length - rural - urban;
  out.push(
    `  setting           ${rural.toLocaleString()} rural · ${urban.toLocaleString()} urban` +
      (unknown ? ` · ${unknown.toLocaleString()} unmatched` : ''),
  );
  out.push('');
  out.push('  readiness         not ready   moderately       ready');
  const line = (label, d) =>
    `  ${label.padEnd(16)}${String(d.not_ready).padStart(10)}${String(
      d.moderately_ready,
    ).padStart(13)}${String(d.ready).padStart(12)}`;
  out.push(line('EMR deployment', national.deploymentDistribution));
  out.push('');
  out.push('  cost by urgency');
  for (const h of HORIZONS) {
    out.push(`    ${h.padEnd(12)}${naira(national.deployment.costByHorizon[h]).padStart(18)}`);
  }
  out.push('');
  out.push('  investment by state');
  for (const s of [...assessed].sort(
    (a, b) => b.deployment.costNGN - a.deployment.costNGN,
  )) {
    out.push(
      `    ${s.name.padEnd(14)}${String(s.facilityCount).padStart(5)} facilities   ` +
        naira(s.deployment.costNGN).padStart(18),
    );
  }
  out.push('');
  process.stderr.write(out.join('\n'));
}

main().catch((err) => {
  process.stderr.write(`\n✗ ${err.message}\n\n`);
  process.exit(1);
});
