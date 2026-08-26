/**
 * Reading the assessment CSV: parsing, geography reconciliation, and the gap
 * catalogue extracted from the data itself.
 *
 * Split out from `ingest-assessment.mjs` so the parts that make *claims about
 * the source* can be tested without running a build. Everything here is pure:
 * bytes in, structures out, no filesystem and no network.
 *
 * See `docs/ASSESSMENT_DATA.md` for what the file contains and why it is shaped
 * the way it is. The two facts that drive every design decision below:
 *
 * 1. **Column headers are not unique.** `Intervention 1`, `When action is
 *    needed` and `Cost 1 (₦)` repeat twenty-odd times, and each triple is only
 *    meaningful relative to the gap column it follows. A header-name lookup
 *    silently reads the wrong column, so everything here works positionally.
 *
 * 2. **The gap → intervention mapping is deterministic.** The same gap value
 *    always produces the same interventions, horizons and costs, in all 2,806
 *    rows. That is what lets the catalogue be *extracted* rather than
 *    hand-maintained — and `extractCatalogue` asserts it while doing so, so a
 *    future sheet edit that breaks it fails the build instead of being
 *    resolved by whichever row happened to be read last.
 */

import Papa from 'papaparse';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The file's four urgency levels, kept as four.
 *
 * The synthetic model had three horizons (`immediate`/`near_term`/`long_term`)
 * and squeezing four values into them would lose the major/critical
 * distinction — which is the exact distinction the deployment band is computed
 * from, and the one the summary columns count. So the model takes the file's
 * vocabulary rather than the other way round.
 *
 * Ordered worst-first. Every sort of gaps or interventions on the page uses
 * this order, so "most urgent" means one thing everywhere.
 */
export const HORIZONS = ['critical', 'major', 'minor', 'long_term'];

/** The sheet's phrasing → our id. Exhaustive: an unknown value throws. */
export const HORIZON_BY_LABEL = {
  'Critical gap to fix before EMR deployment': 'critical',
  'Major gap to fix before EMR deployment': 'major',
  'Minor action to complete during EMR deployment': 'minor',
  'Optional long-term improvement after EMR deployment': 'long_term',
};

/**
 * Which summary column counts each horizon.
 *
 * Columns 108–111 count *interventions*, not gaps — a facility whose power gap
 * fires two interventions on two horizons contributes to two of these. That is
 * why they do not sum to `Total gaps`, and it is the relationship
 * `validateRow` checks.
 */
export const HORIZON_SUMMARY_COL = {
  minor: 108,
  major: 109,
  critical: 110,
  long_term: 111,
};

/**
 * What a horizon does to its domain's band.
 *
 * The file has no severity column — a gap's weight *is* the urgency of the
 * intervention it triggers. Critical and major block deployment (they are
 * precisely what the deployment band keys on); minor and long-term do not.
 */
export const SEVERITY_BY_HORIZON = {
  critical: 'blocking',
  major: 'blocking',
  minor: 'partial',
  long_term: 'partial',
};

/** The sheet's band phrasing → our id. Both suffixes appear; both mean the
 *  same three levels. */
export const BAND_BY_LABEL = {
  'Not Ready for EMR deployment': 'not_ready',
  'Moderately Ready for EMR deployment': 'moderately_ready',
  'Ready for EMR deployment': 'ready',
  'Not Ready for EMR use': 'not_ready',
  'Moderately Ready for EMR use': 'moderately_ready',
  'Ready for EMR use': 'ready',
};

/**
 * The four domains, in the file's own order, with the columns each spans.
 *
 * `costTotalCol` is the sheet's own subtotal for the domain — carried so the
 * ingest can check its arithmetic against the source rather than trusting it.
 *
 * There is no leadership & governance domain. It is not assessed at facility
 * level and has no column in this file, so the model does not carry one.
 */
export const DOMAINS = [
  {
    id: 'technical_infrastructure',
    label: 'Technical Infrastructure',
    sheetBand: 'Technical Infrastructure',
    bandCol: 9,
    costTotalCol: 59,
  },
  {
    id: 'workforce_capacity',
    label: 'Workforce Capacity',
    sheetBand: 'Workforce Capacity',
    bandCol: 10,
    costTotalCol: 76,
  },
  {
    id: 'workflow_transition',
    label: 'Workflow & Transition',
    sheetBand: 'Workflow and Transition',
    bandCol: 11,
    costTotalCol: 93,
  },
  {
    id: 'data_use_reporting',
    label: 'Data Use & Reporting',
    sheetBand: 'Data Use and Reporting',
    bandCol: 12,
    costTotalCol: 106,
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
  deploymentBand: 7,
  useBand: 8,
  mtnBaseStation: 48,
  mtnDistanceKm: 49,
  mtnServiceability: 50,
  mtn4gSignal: 51,
  airtelDistanceM: 52,
  totalGaps: 107,
  dailyClientLoad: 112,
  totalCost: 113,
};

/** Header rows before the data starts. Title, scope note, domain band, headers. */
const HEADER_ROWS = 4;
const BAND_ROW = 2;
const HEADER_ROW = 3;

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
 * Returns `null` for an empty cell and `0` for a literal `₦0` — a distinction
 * the file makes deliberately and the dashboard depends on. Every intervention
 * in the file carries a figure except one (`Check which connection works…`,
 * 332 facilities), whose 332 blanks are the only empty cost cells in the
 * dataset. Collapsing them to zero would price a critical blocker at nothing
 * and hide it inside a total presented as sourced. See
 * `docs/data-queries/README.md`.
 */
export function parseMoney(raw) {
  const s = String(raw ?? '').replace(/[₦,\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Unparseable money cell: ${JSON.stringify(raw)}`);
  return n;
}

/** A short, stable content hash — enough to disambiguate ids, short enough to
 *  live in a URL. */
const shortHash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 6);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the CSV into rows, and locate every gap block positionally.
 *
 * The returned `blocks` are the file's real structure: one per gap column, each
 * knowing its domain, its sub-domain name, and the (intervention, when, cost)
 * column triples that belong to it. Nothing downstream indexes a column by
 * header name.
 */
export function parseAssessmentCsv(text) {
  const { data: rows, errors } = Papa.parse(text.replace(/^\uFEFF/, ''), {
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
  const header = rows[HEADER_ROW];

  // Row 3 is sparse — a domain name appears once, above its first column, and
  // applies until the next one. Forward-fill so every column knows its domain.
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
    const label = String(header[i] ?? '').trim();
    if (!label.endsWith(' gap')) continue;

    const domain = sheetBandToDomain.get(columnDomain[i]);
    if (!domain) {
      throw new Error(
        `Gap column "${label}" (index ${i}) sits under unrecognised domain "${columnDomain[i]}"`,
      );
    }

    // Walk forward in strides of three while the header keeps saying
    // `Intervention N`. This is the whole reason the parse is positional.
    const slots = [];
    for (let j = i + 1; j < header.length; j += 3) {
      if (!String(header[j] ?? '').trim().startsWith('Intervention')) break;
      slots.push({ label: j, when: j + 1, cost: j + 2 });
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
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''));

  return { header, blocks, rows: data };
}

/**
 * Every intervention a row records against one gap block.
 *
 * Empty when the gap column reads `No gap`. Also empty — legitimately — for the
 * one gap variant that carries no intervention at all (Query A, 55 facilities);
 * a gap with no action is still a gap the sheet counted, so it is returned with
 * an empty list rather than dropped.
 */
function interventionsInRow(row, block) {
  const out = [];
  for (const slot of block.slots) {
    const label = String(row[slot.label] ?? '').trim();
    if (!label) continue;
    const whenLabel = String(row[slot.when] ?? '').trim();
    const horizon = HORIZON_BY_LABEL[whenLabel];
    if (!horizon) {
      throw new Error(
        `Unknown "when action is needed" value ${JSON.stringify(whenLabel)} ` +
          `for ${block.subDomain} (column ${slot.when})`,
      );
    }
    out.push({ label, horizon, costNGN: parseMoney(row[slot.cost]) });
  }
  return out;
}

/** The gap value in a row for one block, or null where the sheet says none. */
export function gapValueInRow(row, block) {
  const v = String(row[block.col] ?? '').trim();
  return v === '' || v === 'No gap' ? null : v;
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/** Readable, bounded, stable. The id rides in the URL via the Gap filter. */
function gapId(subDomain, value) {
  const stem = `${slugify(subDomain)}__${slugify(value).slice(0, 56)}`;
  return stem.replace(/_+$/, '');
}

/**
 * An intervention's identity.
 *
 * Keyed on horizon as well as label and cost, because the same action appears
 * at two urgencies: "Install solar panels and batteries that can power the EMR
 * equipment" is *critical* for a facility with no power at all and *major* for
 * one with 1–4 hours a day. Same work, same ₦3,000,000, different place in the
 * plan — so they are two lines, not one, and a plan phased by horizon needs
 * them kept apart.
 */
function interventionId(iv) {
  const stem = slugify(iv.label).split('_').slice(0, 5).join('_');
  return `${stem}__${shortHash(`${iv.label}|${iv.horizon}|${iv.costNGN ?? 'null'}`)}`;
}

/**
 * Extract the gap catalogue from the data, asserting determinism as it goes.
 *
 * Every (sub-domain, gap value) pair becomes one catalogue entry carrying the
 * interventions that pair triggers. If two rows ever disagree about what a
 * given gap value implies, that is a change in the sheet's own logic and this
 * throws rather than silently keeping whichever row came last.
 */
export function extractCatalogue(rows, blocks) {
  const byId = new Map();
  /** gap id → the row that first defined it, for a legible conflict message. */
  const provenance = new Map();

  for (const row of rows) {
    for (const block of blocks) {
      const value = gapValueInRow(row, block);
      if (value === null) continue;

      const id = gapId(block.subDomain, value);
      const interventions = interventionsInRow(row, block).map((iv) => ({
        id: interventionId(iv),
        label: iv.label,
        horizon: iv.horizon,
        costNGN: iv.costNGN,
      }));

      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, {
          id,
          domain: block.domain,
          subDomain: block.subDomain,
          label: value,
          /**
           * The gap's own weight: the worst urgency among its interventions.
           *
           * A gap with no intervention is `partial` — it cannot block anything,
           * because there is nothing it asks anyone to do.
           */
          severity: worstSeverity(interventions),
          interventions,
        });
        provenance.set(id, row[COL.uuid]);
        continue;
      }

      const before = JSON.stringify(existing.interventions);
      const after = JSON.stringify(interventions);
      if (before !== after) {
        throw new Error(
          `Gap "${block.subDomain}: ${value}" is not deterministic.\n` +
            `  facility ${provenance.get(id)} → ${before}\n` +
            `  facility ${row[COL.uuid]} → ${after}\n` +
            `The sheet's gap → intervention mapping has changed. See ` +
            `docs/ASSESSMENT_DATA.md; the catalogue can no longer be extracted ` +
            `until this is resolved.`,
        );
      }
    }
  }

  const gaps = [...byId.values()].sort(
    (a, b) =>
      DOMAIN_IDS.indexOf(a.domain) - DOMAIN_IDS.indexOf(b.domain) ||
      a.subDomain.localeCompare(b.subDomain) ||
      HORIZONS.indexOf(worstHorizon(a.interventions)) -
        HORIZONS.indexOf(worstHorizon(b.interventions)) ||
      a.label.localeCompare(b.label),
  );

  // Ids ride in URLs, so a collision would silently merge two gaps into one
  // filter selection. Truncation makes that possible in principle; assert it
  // has not happened rather than hope.
  const seen = new Set();
  for (const g of gaps) {
    if (seen.has(g.id)) throw new Error(`Duplicate gap id after truncation: ${g.id}`);
    seen.add(g.id);
  }

  return gaps;
}

/** The most urgent horizon in a set, or `long_term` for an empty set. */
function worstHorizon(interventions) {
  let worst = HORIZONS.length - 1;
  for (const iv of interventions) worst = Math.min(worst, HORIZONS.indexOf(iv.horizon));
  return HORIZONS[worst];
}

function worstSeverity(interventions) {
  return interventions.some((iv) => SEVERITY_BY_HORIZON[iv.horizon] === 'blocking')
    ? 'blocking'
    : 'partial';
}

/**
 * What a gap costs, from the catalogue alone.
 *
 * No facility argument, unlike the synthetic model's `gapCostNGN(gap, size)`.
 * Nothing in this file is quantity-scaled — "give each place where staff enter
 * EMR data the number of tablets it is missing" is ₦233,333 in all 1,769 rows
 * that carry it — so a gap costs the same everywhere and the whole
 * `unitBasis`/service-point multiplication layer is gone.
 *
 * Unpriced interventions contribute nothing and are reported separately, so a
 * total never quietly absorbs a missing price as a zero.
 */
export function gapCost(gap) {
  let costNGN = 0;
  let unpriced = 0;
  for (const iv of gap.interventions) {
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
