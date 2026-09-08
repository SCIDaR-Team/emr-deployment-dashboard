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
 * 2. **A gap no longer implies one set of interventions.** It used to: every
 *    row carrying a given gap value fired the same actions at the same prices,
 *    which is what let the catalogue be *extracted* rather than declared. The
 *    revised costing model broke that on purpose — the same power gap now
 *    draws a ₦3,000,000 solar install at one facility and a ₦1,200,000 top-up
 *    at another, with or without a ₦500,000 grid connection behind it.
 *
 *    So a condition carries **variants**, and a facility's actual cost is read
 *    from its own row rather than looked up. What is still asserted, because
 *    the dashboard's bands depend on it, is that every variant of a condition
 *    agrees about **severity** — see `extractCatalogue`.
 *
 * 3. **The sheet carries one overall reading.** `Overall readiness for EMR
 *    deployment`, and nothing beside it. An earlier revision had a second
 *    column for readiness to *use* an EMR; it was a copy of the technical
 *    infrastructure band and has been withdrawn.
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
 * Columns 107–110 count *interventions*, not gaps — a facility whose power gap
 * fires two interventions on two horizons contributes to two of these. That is
 * why they do not sum to `Total gaps`, and it is the relationship
 * `validateRow` checks.
 */
export const HORIZON_SUMMARY_COL = {
  minor: 107,
  major: 108,
  critical: 109,
  long_term: 110,
};

/**
 * Two cells the revised sheet leaves in a state it does not mean, repaired
 * here by name so the repair is arguable rather than invisible.
 *
 * Both are recoverable from the revised file alone — neither reaches back to
 * the superseded costing model, which is gone. `parseAssessmentCsv` asserts the
 * scope of each, so a future export that spreads either one fails the build
 * rather than being quietly patched wider than it was checked.
 *
 * **`0` for a Backup-connectivity condition** (199 facilities). The column
 * holds a sentence everywhere else; these hold the number zero, and their cost
 * cell is ₦0 like every other row in an area that now funds nothing. Read as
 * *no gap* — there is no condition here to name and no action behind it.
 *
 * **A missing urgency on the Physical service-point action** (2,066
 * facilities). The action and its ₦54,378 are present; only `When action is
 * needed` is blank, and it is blank in every row that carries the action, so
 * there is no surviving example to read the intended value off. Desks, chairs,
 * fans and lockable doors are fitted while the EMR goes in, which is what
 * `minor` means, so that is what the blank is read as.
 */
export const BLANK_GAP_VALUE = '0';
export const BLANK_GAP_AREA = 'Backup-connectivity';
export const DEFAULT_HORIZON_AREA = 'Physical service-point';
export const DEFAULT_HORIZON = 'minor';

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

/**
 * The sheet's band phrasing → our id.
 *
 * Both suffixes still appear and both mean the same three levels: the overall
 * column is phrased "for EMR deployment", the four domain columns "for EMR
 * use". That is the sheet's wording, not two scales — there is one overall
 * reading in this dataset, and the domain readings sit under it.
 */
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
    bandCol: 8,
    costTotalCol: 58,
  },
  {
    id: 'workforce_capacity',
    label: 'Workforce Capacity',
    sheetBand: 'Workforce Capacity',
    bandCol: 9,
    costTotalCol: 75,
  },
  {
    id: 'workflow_transition',
    label: 'Workflow & Transition',
    sheetBand: 'Workflow and Transition',
    bandCol: 10,
    costTotalCol: 92,
  },
  {
    id: 'data_use_reporting',
    label: 'Data Use & Reporting',
    sheetBand: 'Data Use and Reporting',
    bandCol: 11,
    costTotalCol: 105,
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
  /** The one overall reading. There is no second band column. */
  deploymentBand: 7,
  mtnBaseStation: 47,
  mtnDistanceKm: 48,
  mtnServiceability: 49,
  mtn4gSignal: 50,
  airtelDistanceM: 51,
  totalGaps: 106,
  dailyClientLoad: 111,
  totalCost: 112,
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

  assertRepairsAreScoped(data, blocks);

  return { header, blocks, rows: data };
}

/**
 * Hold the two source repairs to the columns they were verified against.
 *
 * Each is a reading of one specific defect in one specific column. Applied
 * anywhere else it would be a guess, so a `0` in a gap column that is not
 * Backup-connectivity, or a missing urgency outside Physical service-point,
 * stops the build and asks to be looked at rather than being patched by a rule
 * nobody checked against it. See `BLANK_GAP_VALUE`.
 */
function assertRepairsAreScoped(rows, blocks) {
  for (const block of blocks) {
    for (const row of rows) {
      const value = String(row[block.col] ?? '').trim();
      if (value === BLANK_GAP_VALUE && block.subDomain !== BLANK_GAP_AREA) {
        throw new Error(
          `"${BLANK_GAP_VALUE}" appears as a ${block.subDomain} gap value ` +
            `(facility ${row[COL.uuid]}). It is read as "no gap" in ` +
            `${BLANK_GAP_AREA} only — see BLANK_GAP_VALUE in ` +
            `scripts/assessment-source.mjs.`,
        );
      }
      if (value === '' || value === 'No gap') continue;
      if (block.subDomain === DEFAULT_HORIZON_AREA) continue;

      for (const slot of block.slots) {
        if (!String(row[slot.label] ?? '').trim()) continue;
        if (String(row[slot.when] ?? '').trim()) continue;
        throw new Error(
          `A ${block.subDomain} intervention at facility ${row[COL.uuid]} has ` +
            `no "when action is needed" value. The blank is read as ` +
            `"${DEFAULT_HORIZON}" in ${DEFAULT_HORIZON_AREA} only — see ` +
            `DEFAULT_HORIZON_AREA in scripts/assessment-source.mjs.`,
        );
      }
    }
  }
}

/**
 * Every intervention a row records against one gap block.
 *
 * **This is where a facility's cost comes from**, now that a condition no
 * longer implies one set of actions. The catalogue says what a gap *can*
 * trigger; this says what this facility's row actually asks for.
 *
 * Empty when the gap column reads `No gap`. Also empty — legitimately — where a
 * condition carries no action at all: 81 facilities whose backup power is
 * partly working, and every gap in the six areas the revised model no longer
 * funds. A gap with no action is still a gap the sheet counted, so it is
 * returned with an empty list rather than dropped.
 */
export function interventionsInRow(row, block) {
  const out = [];
  for (const slot of block.slots) {
    const label = String(row[slot.label] ?? '').trim();
    if (!label) continue;
    const whenLabel = String(row[slot.when] ?? '').trim();
    const horizon =
      whenLabel === '' && block.subDomain === DEFAULT_HORIZON_AREA
        ? DEFAULT_HORIZON
        : HORIZON_BY_LABEL[whenLabel];
    if (!horizon) {
      throw new Error(
        `Unknown "when action is needed" value ${JSON.stringify(whenLabel)} ` +
          `for ${block.subDomain} (column ${slot.when})`,
      );
    }
    out.push({
      id: interventionId({ label, horizon, costNGN: parseMoney(row[slot.cost]) }),
      label,
      horizon,
      costNGN: parseMoney(row[slot.cost]),
    });
  }
  return out;
}

/**
 * The gap value in a row for one block, or null where the sheet says none.
 *
 * `0` in the Backup-connectivity column is a third way of saying none — see
 * `BLANK_GAP_VALUE`. Facilities repaired this way therefore carry one gap fewer
 * than the sheet's own `Total gaps`, which `validateRow` accounts for exactly.
 */
export function gapValueInRow(row, block) {
  const v = String(row[block.col] ?? '').trim();
  if (v === '' || v === 'No gap') return null;
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
 * The sheet has always had it (it is the column header, minus the word "gap"),
 * and the model has never carried it, which is why the Gap filter offered 73
 * conditions in one flat list and no control could ask the question a planner
 * actually asks: *which facilities have a power problem?*
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
 * problem wants. Alphabetical would open Technical Infrastructure on
 * Backup-connectivity.
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
 * Extract the gap catalogue from the data.
 *
 * Every (gap area, gap value) pair becomes one catalogue entry. What it carries
 * is no longer a single list of interventions but a list of **variants** — the
 * distinct action sets the sheet fires for that condition across the dataset.
 *
 * Four of the 71 conditions have more than one. All four are power:
 * *No functional electricity source* draws a ₦3,000,000 solar install, and for
 * 474 of its 571 facilities a ₦500,000 grid connection behind it; the two
 * partial-coverage conditions choose between that ₦3,000,000 install and a
 * ₦1,200,000 top-up, each again with or without the grid line. This is the
 * revised costing model doing deliberate work — a facility already on the grid
 * is not sold a connection to it — so the extraction records the choice rather
 * than refusing it.
 *
 * What the extraction still refuses is a condition whose variants **disagree
 * about severity**. Severity is what the deployment band keys on, so a
 * condition that blocks deployment at one facility and not at another would
 * make the band unreadable rather than merely imprecise. It holds for all 71
 * conditions today; if it ever stops holding, that is a change in the sheet's
 * logic and the build should stop.
 */
export function extractCatalogue(rows, blocks) {
  const byId = new Map();
  /** gap id → the row that first defined each variant, for a legible message. */
  const provenance = new Map();

  for (const row of rows) {
    for (const block of blocks) {
      const value = gapValueInRow(row, block);
      if (value === null) continue;

      const id = gapId(block.subDomain, value);
      const interventions = interventionsInRow(row, block);
      const severity = worstSeverity(interventions);

      let entry = byId.get(id);
      if (!entry) {
        entry = {
          id,
          domain: block.domain,
          /** The gap area this condition sits in — see `extractGapAreas`. An id
           *  rather than the display string the header carries, so a control
           *  can group, scope and filter on it. */
          area: gapAreaId(block.subDomain),
          label: value,
          /**
           * The gap's own weight: the worst urgency among the actions it
           * triggers, and the same at every facility that carries it.
           *
           * A gap with no intervention is `partial` — it cannot block anything,
           * because there is nothing it asks anyone to do.
           */
          severity,
          variants: [],
        };
        byId.set(id, entry);
        provenance.set(id, new Map());
      }

      if (severity !== entry.severity) {
        const first = provenance.get(id).get(entry.severity);
        throw new Error(
          `Gap "${block.subDomain}: ${value}" is ${entry.severity} at facility ` +
            `${first} and ${severity} at facility ${row[COL.uuid]}.\n` +
            `Severity is what the deployment band is computed from, so a ` +
            `condition cannot carry two. See docs/ASSESSMENT_DATA.md.`,
        );
      }

      const shape = variantKey(interventions);
      if (!entry.variants.some((v) => variantKey(v) === shape)) {
        entry.variants.push(interventions);
      }
      if (!provenance.get(id).has(severity)) provenance.get(id).set(severity, row[COL.uuid]);
    }
  }

  // Ordered the way the sheet is: domain, then gap area in column order, then
  // worst-first within an area. Alphabetical by area would open Technical
  // Infrastructure on Backup-connectivity rather than Power.
  const areaOrder = new Map(extractGapAreas(blocks).map((a) => [a.id, a.order]));
  const gaps = [...byId.values()].sort(
    (a, b) =>
      DOMAIN_IDS.indexOf(a.domain) - DOMAIN_IDS.indexOf(b.domain) ||
      areaOrder.get(a.area) - areaOrder.get(b.area) ||
      HORIZONS.indexOf(worstHorizon(catalogueInterventions(a))) -
        HORIZONS.indexOf(worstHorizon(catalogueInterventions(b))) ||
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

/** A variant's identity: which actions, in which order. */
const variantKey = (interventions) => interventions.map((iv) => iv.id).join('+');

/**
 * Every distinct action a condition can trigger, across all its variants.
 *
 * The union, not a sum: the ₦3,000,000 install and the ₦1,200,000 top-up are
 * alternatives, and a reader of the taxonomy wants to see both listed against
 * the condition without either being read as a population cost. Populations are
 * costed from facilities, in `deploymentFor`.
 */
export function catalogueInterventions(gap) {
  const out = [];
  const seen = new Set();
  for (const variant of gap.variants) {
    for (const iv of variant) {
      if (seen.has(iv.id)) continue;
      seen.add(iv.id);
      out.push(iv);
    }
  }
  return out;
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
 * What one set of interventions costs.
 *
 * Takes the actions, not a gap — because a gap no longer has one price. Pass a
 * facility's own `interventionsInRow` to cost that facility, or one variant to
 * price that branch of a condition. The old signature took a catalogue entry
 * and could not have expressed either.
 *
 * Nothing here is quantity-scaled: "give each place where staff enter EMR data
 * the number of tablets it is missing" is ₦233,333 in every row that carries
 * it, so an action costs the same wherever it appears and the whole
 * `unitBasis`/service-point multiplication layer stays gone.
 *
 * Unpriced interventions contribute nothing and are counted separately, so a
 * total never quietly absorbs a missing price as a zero. There are 2,274 of
 * them in the revised sheet, all of them routine device maintenance.
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
