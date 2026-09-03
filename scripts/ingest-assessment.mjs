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
  HORIZONS,
  HORIZON_SUMMARY_COL,
  extractCatalogue,
  extractGapAreas,
  gapCost,
  gapValueInRow,
  parseAssessmentCsv,
  parseMoney,
  resolveLga,
  slugify,
  titleCase,
} from './assessment-source.mjs';
import { lookupFor, nameKey, parseFacilityWorkbook } from './facility-workbook.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data');
const CACHE = resolve(ROOT, 'scripts/source-data/assessment.csv');
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
 * How far a facility's own grand total may sit from the sum of its parts.
 *
 * ₦1, and only ₦1, because the sheet rounds twice. Two interventions carry
 * fractional true values — the device top-up at ₦233,333 (₦700,000 ÷ 3) and the
 * service-point kit at ₦54,378 — and the sheet displays each domain subtotal
 * rounded while computing `Total facility intervention cost` at full precision
 * and rounding once. A facility carrying *both* fractions loses them from the
 * subtotals and keeps them in the grand total, so the two differ by exactly ₦1.
 *
 * It happens in precisely the 1,263 of 2,806 facilities that carry both, and
 * nowhere else: ₦1,263 nationally against ₦16.26bn, or 0.000008%.
 *
 * The dashboard sums the *cells*, not the grand total, because the cells are
 * what the gap catalogue is built from and a facility's cost has to be the sum
 * of the gaps shown beside it. The tolerance is here so that arithmetic can be
 * checked against the sheet without a rounding artefact failing the build — and
 * the drift is totalled in the build report rather than swallowed, so it can
 * never quietly grow into something that is not rounding.
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

function themeDistributionOf(facilities) {
  return Object.fromEntries(
    DOMAIN_IDS.map((id) => {
      const dist = emptyDistribution();
      for (const f of facilities) if (f.themeBands[id]) dist[f.themeBands[id]] += 1;
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
  const costByDomain = Object.fromEntries(DOMAIN_IDS.map((d) => [d, 0]));
  let costNGN = 0;
  let unpricedInterventions = 0;

  for (const block of blocks) {
    const value = gapValueInRow(row, block);
    if (value === null) continue;
    const gap = catalogueById.get(gapIdOf(block, value));
    if (!gap) throw new Error(`Facility ${uuid} carries uncatalogued gap "${value}"`);
    gaps.push(gap.id);
    const { costNGN: c, unpriced } = gapCost(gap);
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
     * Two overall readings, both carried.
     *
     * They disagree for 553 facilities, and deployment is never the worse of
     * the two — the pair is nested, not crossing. Showing one and hiding the
     * other would suppress the more interesting half of the finding: a facility
     * can be clear to deploy into and still not be in shape to run an EMR.
     */
    useBand: band(row[COL.useBand], 'EMR-use', uuid),
    deploymentBand: band(row[COL.deploymentBand], 'EMR-deployment', uuid),
    themeBands: Object.fromEntries(
      DOMAINS.map((d) => [d.id, band(row[d.bandCol], d.label, uuid)]),
    ),

    gaps,
    gapCount: gaps.length,
    costNGN,
    costByDomain,
    /** Interventions this facility needs whose price the sheet does not carry.
     *  Query B — 332 facilities, all of them a critical connectivity blocker.
     *  Counted so a total can say what it excludes. */
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

/** Mirrors `gapId` in assessment-source.mjs. Kept in step by the catalogue
 *  lookup failing loudly if it ever drifts. */
function gapIdOf(block, value) {
  return `${slugify(block.subDomain)}__${slugify(value).slice(0, 56)}`.replace(/_+$/, '');
}

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
function validateRow(row, facility, catalogueById, problems) {
  const uuid = facility.uuid;
  const fail = (msg) => problems.push(`${uuid}: ${msg}`);
  let drift = 0;

  // 1. Total gaps = the number of gap columns that fired.
  const statedGaps = Number(row[COL.totalGaps]);
  if (statedGaps !== facility.gapCount) {
    fail(`sheet says ${statedGaps} gaps, ${facility.gapCount} columns carry one`);
  }

  // 2. Each domain subtotal = the sum of that domain's own cost cells.
  for (const d of DOMAINS) {
    const stated = parseMoney(row[d.costTotalCol]) ?? 0;
    if (Math.round(stated) !== Math.round(facility.costByDomain[d.id])) {
      fail(`${d.label} cost: sheet ₦${stated}, gaps sum to ₦${facility.costByDomain[d.id]}`);
    }
  }

  // 3. Facility total = the four domain subtotals, to within the sheet's own
  //    rounding. See ROUNDING_TOLERANCE.
  const statedTotal = parseMoney(row[COL.totalCost]) ?? 0;
  drift = Math.round(statedTotal) - Math.round(facility.costNGN);
  if (Math.abs(drift) > ROUNDING_TOLERANCE) {
    fail(`total cost: sheet ₦${statedTotal}, gaps sum to ₦${facility.costNGN}`);
  }

  // 4. The severity columns count *interventions* by horizon — not gaps, which
  //    is why they do not sum to `Total gaps`.
  const byHorizon = Object.fromEntries(HORIZONS.map((h) => [h, 0]));
  for (const id of facility.gaps) {
    for (const iv of catalogueById.get(id).interventions) byHorizon[iv.horizon] += 1;
  }
  for (const [horizon, col] of Object.entries(HORIZON_SUMMARY_COL)) {
    const stated = Number(row[col]);
    if (stated !== byHorizon[horizon]) {
      fail(`${horizon} count: sheet ${stated}, catalogue implies ${byHorizon[horizon]}`);
    }
  }

  // 5. Deployment readiness is a function of the blocker counts, exactly.
  const critical = byHorizon.critical;
  const major = byHorizon.major;
  const expected =
    critical > 0 ? 'not_ready' : major > 0 ? 'moderately_ready' : 'ready';
  if (facility.deploymentBand !== expected) {
    fail(
      `deployment band is ${facility.deploymentBand}; ` +
        `${critical} critical + ${major} major implies ${expected}`,
    );
  }

  // 6. EMR-use readiness is the technical infrastructure reading, copied.
  if (facility.useBand !== facility.themeBands.technical_infrastructure) {
    fail(
      `use band ${facility.useBand} ≠ technical infrastructure band ` +
        `${facility.themeBands.technical_infrastructure}`,
    );
  }

  // 7. Deployment is never worse than use — the two readings are nested.
  if (BANDS.indexOf(facility.deploymentBand) < BANDS.indexOf(facility.useBand)) {
    fail(`deployment band ${facility.deploymentBand} is worse than use band ${facility.useBand}`);
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

const HORIZON_PRIORITY = {
  critical: 'high',
  major: 'high',
  minor: 'medium',
  long_term: 'low',
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
  const costByDomain = Object.fromEntries(DOMAIN_IDS.map((d) => [d, 0]));
  let unpriced = 0;

  for (const f of facilities) {
    for (const id of f.gaps) {
      gapCounts.set(id, (gapCounts.get(id) ?? 0) + 1);
      const gap = catalogueById.get(id);
      for (const iv of gap.interventions) {
        const line = lines.get(iv.id) ?? {
          id: iv.id,
          label: iv.label,
          domain: gap.domain,
          horizon: iv.horizon,
          unitCostNGN: iv.costNGN,
          quantity: 0,
          facilityCount: 0,
          totalCostNGN: 0,
          /** Lines the sheet does not price. Kept as a flag on the line rather
           *  than folded into a zero, so a reader can see which of them the
           *  total is silent about. */
          priced: iv.costNGN !== null,
        };
        line.quantity += 1;
        line.facilityCount += 1;
        if (iv.costNGN === null) {
          unpriced += 1;
        } else {
          line.totalCostNGN += iv.costNGN;
          costByHorizon[iv.horizon] += iv.costNGN;
          costByDomain[gap.domain] += iv.costNGN;
        }
        lines.set(iv.id, line);
      }
    }
  }

  const rows = [...lines.values()].sort(
    (a, b) => b.totalCostNGN - a.totalCostNGN || a.label.localeCompare(b.label),
  );

  return {
    facilityCount: facilities.length,
    gapCount: facilities.reduce((sum, f) => sum + f.gapCount, 0),
    costNGN: facilities.reduce((sum, f) => sum + f.costNGN, 0),
    /** Interventions in scope carrying no price. Zero everywhere except where
     *  one of Query B's 332 facilities is included. */
    unpricedInterventions: unpriced,
    costByHorizon,
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
    priority: HORIZON_PRIORITY[l.horizon],
    quantity: l.quantity,
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
function coverageFor(desk = null, leadership = null) {
  return {
    /**
     * The band arrives classified, from the coverage workbook, and is copied
     * across untouched.
     *
     * Set on states only — the workbook has no rows below one. An LGA and the
     * national profile keep a null band here, which is *not measured* rather
     * than not ready, and National Coverage already paints those differently.
     */
    band: desk?.band ?? null,

    /**
     * Technical Infrastructure carries the same band; Workforce Capacity stays
     * null.
     *
     * Not a shortcut. The workbook classifies on electricity and internet, both
     * of which are technical infrastructure and nothing else, so the domain
     * reading and the overall reading are the same judgement made from the same
     * two numbers. Saying so lets the Domain lens paint Technical
     * Infrastructure honestly. Workforce is a question this source never asks,
     * and a null there is the truthful answer — the lens drops it.
     *
     * Leadership & Governance comes from a *second* desk source, the leadership
     * scoring workbook, and is a genuinely independent reading: it is scored
     * from four governance answers and knows nothing about electricity. It
     * covers 27 states, so ten carry a null here — not measured, which the page
     * paints as no-data rather than as Not ready.
     */
    themeBands: {
      technical_infrastructure: desk?.band ?? null,
      workforce_capacity: null,
      leadership_governance: leadership?.band ?? null,
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
     * The four answers the Leadership band was scored from.
     *
     * The same relationship `internet` has to the internet rate: this is the
     * arithmetic behind the band directly above it, so a reader told a state is
     * Not ready for leadership can read down and find which of the four things
     * it is missing.
     *
     * Null on the ten unscored states and at every level but the state — the
     * workbook has no LGA rows and makes no national claim. Null is *not
     * measured*, and the pane says so rather than printing four "No"s nobody
     * wrote.
     *
     * A band per sub-domain, already classified in `build-leadership.mjs` by
     * the sheet's own cut points — see `LeadershipBands`. The workbook's mean
     * is validated there and deliberately left there: "bands, not scores" is a
     * type-level invariant, and this is the one source that could have broken
     * it.
     */
    leadership: leadership ? leadership.subDomains : null,
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
  leadership,
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

    /**
     * Both readings, side by side, at every level.
     *
     * The pane shows the pair rather than switching between them: the
     * interesting fact about this dataset is the *distance* between the two,
     * and distance is only visible when both are on screen.
     */
    useDistribution: distributionOf(facilities, 'useBand'),
    deploymentDistribution: distributionOf(facilities, 'deploymentBand'),
    useBand: assessed ? dominantBand(distributionOf(facilities, 'useBand')) : null,
    deploymentBand: assessed
      ? dominantBand(distributionOf(facilities, 'deploymentBand'))
      : null,

    themeBands: Object.fromEntries(
      DOMAIN_IDS.map((d) => {
        const dist = emptyDistribution();
        for (const f of facilities) if (f.themeBands[d]) dist[f.themeBands[d]] += 1;
        return [d, assessed ? dominantBand(dist) : null];
      }),
    ),
    themeDistribution: themeDistributionOf(facilities),

    coverage: coverageFor(desk, leadership),
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

  const { blocks, rows } = parseAssessmentCsv(text);
  process.stderr.write(
    `Parsed ${rows.length} facilities, ${blocks.length} gap columns from ${origin}\n`,
  );

  const gapAreas = extractGapAreas(blocks);
  for (const a of gapAreas) AREA_LABEL.set(a.id, a.label);

  const catalogue = extractCatalogue(rows, blocks);
  const catalogueById = new Map(catalogue.map((g) => [g.id, g]));
  process.stderr.write(
    `Extracted ${gapAreas.length} gap areas, ${catalogue.length} conditions, ` +
      `${new Set(catalogue.flatMap((g) => g.interventions.map((i) => i.id))).size} interventions\n`,
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

  // --- The leadership workbook's desk readings ------------------------------
  //
  // The second desk source, read the same way: committed JSON, extracted and
  // validated by `npm run data:leadership`.
  //
  // Unlike coverage, this one is **deliberately partial**. It scores 27 of the
  // 37 states, so there is no every-state-or-none check here — a state missing
  // from this file is a state nobody has assessed for leadership yet, which is
  // the ordinary case rather than a broken build. What *is* checked is the
  // other direction: a reading for a state the geography does not have would be
  // dropped on the floor at merge time with nothing to show it happened.
  const deskLeadership = readJSON('scripts/source-data/national-leadership.json');
  const leadershipByState = new Map(deskLeadership.states.map((s) => [s.id, s]));

  const misplaced = [...leadershipByState.keys()].filter((id) => !stateMeta.has(id));
  if (misplaced.length) {
    throw new Error(
      `Leadership reading for unknown state(s): ${misplaced.join(', ')}.\n` +
        `Re-run \`npm run data:leadership\`; if that succeeds, the geography ` +
        `and the leadership workbook disagree about the state list.`,
    );
  }

  process.stderr.write(
    `Read desk leadership readings for ${leadershipByState.size} of ` +
      `${stateMeta.size} states (${stateMeta.size - leadershipByState.size} unscored)\n`,
  );

  // --- Facilities -----------------------------------------------------------

  const facilities = [];
  const problems = [];
  let roundingDrift = 0;
  let roundedRows = 0;
  for (const row of rows) {
    const facility = buildFacility(row, blocks, catalogueById, lgaIndex, stateMeta, workbook);
    const drift = validateRow(row, facility, catalogueById, problems);
    if (drift) {
      roundingDrift += drift;
      roundedRows += 1;
    }
    facilities.push(facility);
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
        leadership: leadershipByState.get(stateId),
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
    source: 'assessment — List of gaps and interventions per facility',
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

  write('facilities-summary.json', facilities);
  write('states.json', stateProfiles);
  write('lgas.json', lgaProfiles);
  write('national.json', national);
  write('snapshot.json', snapshot);

  writeGapCatalogue(catalogue, gapAreas);
  writeNationalSplit(national.deploymentDistribution, facilities.length);

  report(facilities, catalogue, national, stateProfiles, { roundingDrift, roundedRows });
}

// ---------------------------------------------------------------------------
// Generated modules
// ---------------------------------------------------------------------------

function writeGapCatalogue(catalogue, areas) {
  const domains = DOMAINS.map((d) => ({ id: d.id, label: d.label, costed: true }));

  writeFileSync(
    resolve(ROOT, 'src/lib/gapCatalogue.ts'),
    `/**
 * GENERATED by scripts/ingest-assessment.mjs — do not edit.
 *
 * The gap dictionary, extracted from the assessment dataset rather than
 * declared. Three levels, as the source has them: **domain → gap area →
 * condition**. Every entry in \`GAPS\` is a condition the survey actually
 * recorded, sitting in one of the twenty areas and carrying the interventions
 * it triggers at the urgency and price the sheet gives them.
 *
 * Emitted rather than fetched: every control that offers a gap needs the whole
 * list before it can render one, so a network round-trip would only buy a
 * spinner on a filter dropdown.
 *
 * There is no leadership & governance domain — it is not assessed at facility
 * level and has no column in the source.
 */

import type {
  Band,
  FacilityThemeId,
  GapAreaId,
  GapDomainId,
  GapSeverity,
  Horizon,
} from './types';

/** Urgencies, worst-first. The source's own four, not a three-level
 *  approximation of them: major and critical are exactly what the deployment
 *  band is computed from. */
export const HORIZONS: Horizon[] = ${JSON.stringify(HORIZONS)};

export const HORIZON_LABEL: Record<Horizon, string> = {
  critical: "Critical — before deployment",
  major: "Major — before deployment",
  minor: "Minor — during deployment",
  long_term: "Optional — after deployment",
};

/** The short form, for a chip beside a gap. */
export const HORIZON_SHORT: Record<Horizon, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  long_term: "Long-term",
};

/** What an intervention's urgency does to its domain's band. */
export const HORIZON_SEVERITY: Record<Horizon, GapSeverity> = {
  critical: "blocking",
  major: "blocking",
  minor: "partial",
  long_term: "partial",
};

export const GAP_DOMAINS = ${JSON.stringify(domains, null, 2)} as const;

export const GAP_DOMAIN_LABEL: Record<GapDomainId, string> = ${JSON.stringify(
      Object.fromEntries(DOMAINS.map((d) => [d.id, d.label])),
      null,
      2,
    )};

export interface GapInterventionDef {
  id: string;
  label: string;
  horizon: Horizon;
  /** Null where the source carries no price. Not zero — see
   *  docs/data-queries/README.md, Query B. */
  costNGN: number | null;
}

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
 * Twenty of them, one per gap column in the source. A facility holds **at most
 * one condition per area**, because a column holds one value, and that is what
 * makes the area the unit a filter and a rollup can count: counting areas
 * counts facilities, where counting conditions counts survey answers.
 *
 * In the sheet's column order, not alphabetical — see \`extractGapAreas\`.
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
  /** The gap area this condition sits in. An id — the label is on
   *  \`GAP_AREA_BY_ID\`, so nothing renders a sliced column header. */
  area: GapAreaId;
  /** The condition the survey recorded, verbatim. */
  label: string;
  severity: GapSeverity;
  interventions: GapInterventionDef[];
}

export const GAPS: GapDef[] = ${JSON.stringify(catalogue, null, 2)};

export const GAP_BY_ID: Record<string, GapDef> = Object.fromEntries(
  GAPS.map((g) => [g.id, g]),
);

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
 * Both filters narrow, and a gap area narrows *which gaps are counted*, not
 * only which facilities are in scope. Selecting a domain's areas and selecting
 * the domain give identical figures, because every gap sits in exactly one area
 * and every area in exactly one domain.
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
 * The worst severity any of its conditions carries — so \`blocking\` means *some
 * facility here is stopped*, not that every one is. Only 3 of the 20 areas
 * qualify, all in Technical Infrastructure; see docs/GAP_TAXONOMY.md.
 */
export function gapAreaSeverity(areaId: GapAreaId): GapSeverity {
  return gapsInArea(areaId).some((g) => g.severity === 'blocking') ? 'blocking' : 'partial';
}

/** The areas a facility carries a gap in. At most one condition feeds each, so
 *  the length is how many of the 20 areas are a problem here. */
export function facilityGapAreas(gapIds: readonly string[]): GapAreaId[] {
  const seen = new Set<GapAreaId>();
  for (const id of gapIds) {
    const area = GAP_BY_ID[id]?.area;
    if (area) seen.add(area);
  }
  return GAP_AREAS.filter((a) => seen.has(a.id)).map((a) => a.id);
}

/** Does this facility carry a gap in any of these areas? The Gap area filter's
 *  own question — OR within the control, like every other multi-select. */
export function hasGapInAreas(gapIds: readonly string[], areas: readonly string[]): boolean {
  if (!areas.length) return true;
  return gapIds.some((id) => areas.includes(GAP_BY_ID[id]?.area ?? ''));
}

/**
 * What a gap costs.
 *
 * No facility argument: nothing in the source is quantity-scaled, so a gap
 * costs the same wherever it appears. Unpriced interventions are reported
 * separately rather than counted as zero, so a total never silently absorbs a
 * missing price.
 */
export function gapCostNGN(gap: GapDef): { costNGN: number; unpriced: number } {
  let costNGN = 0;
  let unpriced = 0;
  for (const iv of gap.interventions) {
    if (iv.costNGN === null) unpriced += 1;
    else costNGN += iv.costNGN;
  }
  return { costNGN, unpriced };
}

/** Band ranks, so a caller can order gap severity beside a readiness band. */
export const SEVERITY_BAND: Record<GapSeverity, Band> = {
  blocking: "not_ready",
  partial: "moderately_ready",
};

/** The four domains a facility is banded on. */
export const FACILITY_DOMAIN_IDS: FacilityThemeId[] = ${JSON.stringify(DOMAIN_IDS)};
`,
  );
}

function writeNationalSplit(distribution, total) {
  writeFileSync(
    resolve(ROOT, 'src/lib/nationalSplit.ts'),
    `/**
 * GENERATED by scripts/ingest-assessment.mjs — do not edit.
 *
 * The national EMR-deployment readiness split, available synchronously so the
 * landing page can paint before \`DataProvider\` has fetched anything.
 *
 * Deployment, not use: this dashboard's question is what it takes to *deploy*
 * an EMR, and a front door that led with the use split reported a different
 * Ready count from every page behind it.
 */

import type { Band } from './types';

export const NATIONAL_DEPLOYMENT_SPLIT: Record<Band, number> = ${JSON.stringify(distribution)};

/** Facilities carrying a band — the denominator every share on the landing
 *  page is taken over. Every assessed facility carries both overall bands, so
 *  this is simply the survey size. */
export const NATIONAL_TOTAL = ${total};
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
  out.push(`  gap variants      ${catalogue.length}`);
  out.push(`  gap instances     ${national.deployment.gapCount.toLocaleString()}`);
  out.push(`  total investment  ${naira(national.deployment.costNGN)}`);
  out.push(`  unpriced actions  ${national.deployment.unpricedInterventions}`);
  out.push(
    `  sheet rounding    ${naira(rounding.roundingDrift)} over ` +
      `${rounding.roundedRows.toLocaleString()} facilities (the sheet's own ₦1 drift)`,
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
  out.push(line('EMR use', national.useDistribution));
  out.push(line('EMR deployment', national.deploymentDistribution));
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
