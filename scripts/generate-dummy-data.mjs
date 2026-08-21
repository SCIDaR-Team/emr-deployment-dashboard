/**
 * Generate the synthetic dataset the dashboard runs on.
 *
 *     npm run data:generate
 *
 * Writes `public/data/*.json` and `src/lib/nationalSplit.ts`. Both are
 * committed: the build never runs this script, so nothing in CI can regenerate
 * them.
 *
 * ## What is real and what is invented
 *
 * The *geography* is real, and deliberately so — 37 states with their true
 * geopolitical zones, and the 305 LGAs of the 12 primary states, both read
 * straight out of `public/geo/*.geojson` so every id joins to a polygon the
 * maps can actually draw. Facility coordinates are jittered inside their own
 * LGA's bounding box, so a state map looks like a state rather than a scatter.
 *
 * The *findings* are invented. Every readiness band, every investment quantity
 * and every cost in the output is drawn from the seeded generator below.
 *
 * ## Why it is seeded
 *
 * `SEED` is fixed, so two runs produce byte-identical output. That matters more
 * than it sounds: the dataset is committed, so an unseeded generator would put
 * 2,825 changed facility rows in the diff of any commit that happened to re-run
 * it, and nobody would ever read that diff again.
 *
 * ## The shape of the invented finding
 *
 * Bands are not drawn uniformly. The dataset is built to carry the same
 * headline the real assessment found, because a demo that shows a flat random
 * split demonstrates nothing about how the dashboard reads:
 *
 *   - technical infrastructure is the binding constraint — power, connectivity
 *     and backup fail far more often than anything else
 *   - workforce capacity is the strongest domain
 *   - states differ from each other, so a ranked table has something to rank
 *   - urban facilities do better than rural ones
 *
 * ## Two layers that do not derive from each other
 *
 * There are two separate readiness stories in this file, and keeping them
 * separate is deliberate because that is how the real data will arrive:
 *
 *   **Facility-derived** — a state's `archetypeDistribution` is a count of the
 *   facilities inside it, and its facility bands roll up from theirs. This is
 *   what Assessed States and the Investment Plan read.
 *
 *   **Precomputed state readiness** — `band`, `themeBands` and `measures` on
 *   states and LGAs arrive already computed, from a model outside this
 *   dashboard. National Coverage reads only these. They are drawn here from the
 *   same per-state `strength`, so a state that does badly on one tends to do
 *   badly on the other and nothing looks absurd — but no band is *calculated*
 *   from any measure, and nothing in the app may recompute one. A state can be
 *   Ready with unremarkable MTN coverage; that is the source model's business,
 *   not ours.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FACILITY_GAPS,
  GAPS,
  GAP_DOMAINS,
  HORIZONS,
  HORIZON_LABEL,
  STATE_GAPS,
  bandFromGaps,
  classifyFacility,
  quantityFor,
} from './gap-catalogue.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data');

const SEED = 20260820;

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, and good enough for demo data. */
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(SEED);

/** Pick from `[[value, weight], ...]`. Weights need not sum to 1. */
function weighted(entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

const slugify = (v) =>
  String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const ZONE_BY_CODE = {
  NCZ: 'North Central',
  NEZ: 'North East',
  NWZ: 'North West',
  SEZ: 'South East',
  SSZ: 'South South',
  SWZ: 'South West',
};

const PRIMARY_STATE_FACILITY_COUNTS = {
  Kano: 444,
  Anambra: 282,
  Jigawa: 267,
  Niger: 257,
  Oyo: 257,
  'Akwa Ibom': 250,
  Imo: 229,
  Adamawa: 201,
  Bauchi: 181,
  Lagos: 159,
  Nasarawa: 152,
  Rivers: 146,
};

const THEMES = [
  'technical_infrastructure',
  'workforce_capacity',
  'workflow_transition',
  'data_use_reporting',
];

/** The two domains National Coverage bands. */
const COVERAGE_THEMES = ['technical_infrastructure', 'workforce_capacity'];

/**
 * State-level readiness band weights, at average strength.
 *
 * Deliberately a wider spread than the facility picture: this is a different
 * measurement of a different thing (a state's enabling environment, not a
 * clinic's equipment), and a coverage map where 34 of 37 states are one colour
 * would demonstrate nothing about how the page reads.
 */
const STATE_BAND_WEIGHTS = { not_ready: 30, moderately_ready: 45, ready: 25 };

const BANDS = ['not_ready', 'moderately_ready', 'ready'];

function emptyDistribution() {
  return { not_ready: 0, moderately_ready: 0, ready: 0 };
}

/** Per-domain band counts over a facility population, plus an empty slot for
 *  Leadership & Governance — it has no facility instrument anywhere, so its
 *  counts are always zero and its reading is always the state-level band. */
function themeDistributionFor(rows) {
  const out = {};
  for (const t of THEMES) {
    const d = emptyDistribution();
    for (const f of rows) d[f.themeBands[t]] += 1;
    out[t] = d;
  }
  out.leadership_governance = emptyDistribution();
  return out;
}

/** The same rule the UI documents in `lib/bands.ts`. Kept in step by hand —
 *  there is exactly one other copy and this comment is the link between them. */
function dominantBand(dist) {
  const total = BANDS.reduce((sum, b) => sum + (dist[b] ?? 0), 0);
  if (!total) return null;
  if (dist.ready / total > 0.5) return 'ready';
  if (dist.not_ready / total > 0.5) return 'not_ready';
  return 'moderately_ready';
}

function readGeo(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

/** Bounding box of a GeoJSON geometry, as [minLon, minLat, maxLon, maxLat]. */
function bounds(geometry) {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const c of coords) visit(c);
  };
  visit(geometry.coordinates);
  return [minLon, minLat, maxLon, maxLat];
}

// ---------------------------------------------------------------------------
// The readiness model
// ---------------------------------------------------------------------------

/**
 * Gaps come first and the band is read off them — not the other way round.
 *
 * The generator used to draw a band per domain and then invent interventions to
 * match it. That made the program's central claim — close these gaps and the
 * facility turns Ready — an assertion nobody could check, and one the data
 * could contradict: a facility could sit at Not ready with an empty gap list.
 *
 * Now `gap-catalogue.mjs` holds the prevalence of each gap, a facility draws
 * its gaps, and `bandFromGaps` reads the band off what it drew. The claim
 * becomes true by construction — an empty gap list *is* Ready, because Ready is
 * defined as nothing left to fix — and the national finding still lands where
 * the real assessment put it, because the prevalences were fitted to it.
 *
 * @see gap-catalogue.mjs for the weights and how they were fitted.
 */

/**
 * Gaps that cannot be true at the same time as another gap.
 *
 * Every entry is a blocking gap suppressing a partial one, and that direction
 * matters: a facility with no working backup at all cannot also have a
 * *partially* working generator, and one with no internet cannot also have slow
 * internet. Left in, the dataset would sell two solar systems to a facility
 * that needs one and print gap counts nobody could reconcile.
 *
 * Because every suppression runs blocking -> partial, it cannot change any
 * band: a facility holding the blocking gap is Not ready either way, and a
 * facility holding none of them keeps its full partial list. The fitted
 * distribution survives intact.
 */
const GAP_EXCLUSIONS = {
  backup_none: ['backup_partial_solar', 'backup_partial_generator', 'backup_partial_inverter'],
  no_internet: ['internet_personal_device', 'internet_slow'],
  devices_none: ['devices_below_service_points'],
};

/**
 * Draw one facility's gaps.
 *
 * `strength` runs -1 (this facility's state does badly) to +1. It scales every
 * prevalence by `1 - strength/2`, so a strong state carries about half the gaps
 * a weak one does and the mean across the country stays on the fitted figure.
 */
function drawGaps(strength, level) {
  const scale = 1 - strength / 2;
  const pool = level === 'state' ? STATE_GAPS : FACILITY_GAPS;
  const present = new Set();
  for (const gap of pool) {
    if (rand() < Math.max(0, Math.min(0.97, gap.weight * scale))) present.add(gap.id);
  }
  for (const [blocking, suppressed] of Object.entries(GAP_EXCLUSIONS)) {
    if (present.has(blocking)) for (const id of suppressed) present.delete(id);
  }
  return pool.filter((g) => present.has(g.id));
}

/** The four facility domains, banded from the gaps drawn in each. */
function bandsFromGaps(gaps) {
  return Object.fromEntries(
    THEMES.map((t) => [t, bandFromGaps(gaps.filter((g) => g.domain === t))]),
  );
}

/**
 * Cost a facility's gaps into intervention lines.
 *
 * Interventions are keyed rather than concatenated because two gaps can call
 * for the same one — a facility that is both off-grid and short of backup wants
 * one solar system, not two. Where they disagree on quantity the larger wins,
 * which is the only reading that leaves the facility actually fixed.
 */
function interventionsFor(gaps, facility) {
  const byId = new Map();
  for (const gap of gaps) {
    for (const iv of gap.interventions) {
      const quantity = quantityFor(iv.unitBasis, facility);
      const seen = byId.get(iv.id);
      if (seen) {
        seen.quantity = Math.max(seen.quantity, quantity);
        seen.gapIds.push(gap.id);
      } else {
        byId.set(iv.id, {
          id: iv.id,
          label: iv.label,
          domain: gap.domain,
          horizon: iv.horizon,
          unitBasis: iv.unitBasis,
          unitCostNGN: iv.unitCostNGN,
          quantity,
          gapIds: [gap.id],
        });
      }
    }
  }
  return [...byId.values()].map((iv) => ({
    ...iv,
    totalCostNGN: iv.quantity * iv.unitCostNGN,
  }));
}

/**
 * Tilt a weight table toward or away from readiness.
 *
 * `strength` runs -1 (this state does badly) to +1 (well). Applied to the two
 * outer bands only, so the middle stays the middle and a tilt cannot flip a
 * distribution end to end.
 */
function tilt(weights, strength) {
  const k = 1 + strength;
  return [
    ['not_ready', weights.not_ready * (2 - k)],
    ['moderately_ready', weights.moderately_ready],
    ['ready', weights.ready * k],
  ];
}


// ---------------------------------------------------------------------------
// Precomputed readiness — built bottom-up so it holds together
// ---------------------------------------------------------------------------

/**
 * The consistency contract.
 *
 * An earlier version of this file drew a state's overall band, its two domain
 * bands and its LGAs' bands independently around one latent strength. That is
 * defensible as a *model* of how the real data arrives — precomputed elsewhere,
 * not derived here — but it produced states like Yobe: Ready overall, both
 * domains Moderately ready, and most of its 17 LGAs Not ready. Nobody reading
 * that believes the dashboard, and rightly.
 *
 * So the synthetic hierarchy is built from the bottom up and obeys three rules.
 * They are properties of *this generator*, not of the app — nothing in `src/`
 * recomputes a band, and when the real figures arrive they will simply replace
 * what this writes.
 *
 *   1. AN AREA IS NO READIER THAN ITS WEAKEST CORE DOMAIN, OR THAN ITS PARTS.
 *      Overall = min(technical infrastructure, workforce, majority of
 *      children). Both domains are core — a gap in either cannot be offset by
 *      strength in the other, which is the assessment's own governing principle
 *      — and a state cannot read better than most of the LGAs inside it. So no
 *      state is Ready above a Moderately ready domain, and none is Moderately
 *      ready while two-thirds of its LGAs are Not ready.
 *
 *   2. A PARENT'S DOMAIN BAND IS ITS CHILDREN'S MAJORITY.
 *      A state's infrastructure band is the majority band across its LGAs'
 *      infrastructure; the national band is the majority across states. More
 *      than half must agree, or the parent lands Moderately ready — an even
 *      split is not a strong result.
 *
 *   3. THE FIGURES MATCH THE BAND THEY SIT UNDER.
 *      An LGA's network and grid percentages are drawn from ranges belonging to
 *      its infrastructure band, and its staff count from ranges belonging to
 *      its workforce band; states and the nation roll those up. So a Ready
 *      infrastructure reading never appears above 14% grid connection.
 *
 * Rule 3 is the one place this generator is *less* faithful to the real world
 * than the old version: sub-domain figures genuinely do not determine bands in
 * the source model, and a real Ready state might well have mediocre coverage.
 * But a demo where the numbers contradict the colours teaches readers to
 * distrust the page, so the demo data is coherent even where reality may not
 * be. `validate()` at the foot of this file enforces all three.
 */

const RANK = { not_ready: 1, moderately_ready: 2, ready: 3 };
const BY_RANK = { 1: 'not_ready', 2: 'moderately_ready', 3: 'ready' };

/** Rule 1: the weaker of two core readings governs. */
function weakerOf(a, b) {
  if (!a || !b) return a ?? b ?? null;
  return BY_RANK[Math.min(RANK[a], RANK[b])];
}

/**
 * Rule 2: the majority band across children, else Moderately ready.
 *
 * Same rule the app documents as `dominantBand` in lib/bands.ts, applied here
 * to build the data rather than to summarise it in the UI.
 */
function majorityBand(bands) {
  const dist = emptyDistribution();
  let total = 0;
  for (const b of bands) {
    if (!b) continue;
    dist[b] += 1;
    total += 1;
  }
  if (!total) return null;
  if (dist.ready / total > 0.5) return 'ready';
  if (dist.not_ready / total > 0.5) return 'not_ready';
  return 'moderately_ready';
}

/** Count a list of bands into a distribution — for the run report below. */
function countBands(bands) {
  const dist = emptyDistribution();
  for (const b of bands) if (b) dist[b] += 1;
  return dist;
}

/**
 * Rule 3: sub-domain ranges per band.
 *
 * Deliberately overlapping at the edges — a Moderately ready LGA at the top of
 * its range can carry a higher figure than a Ready one at the bottom of its.
 * Non-overlapping ranges would let a reader read the band straight off the
 * number, which would make the band redundant and the page a lie about how the
 * source model works.
 */
const MEASURE_RANGES = {
  not_ready: { mtn: [14, 48], grid: [3, 20], staffPerLga: [18, 62] },
  moderately_ready: { mtn: [40, 74], grid: [16, 42], staffPerLga: [48, 130] },
  ready: { mtn: [66, 96], grid: [36, 74], staffPerLga: [110, 280] },
};

/**
 * One LGA's figures, drawn from the ranges its own bands put it in.
 *
 * Network and power follow the infrastructure band; staff follows workforce.
 * They are drawn separately because they answer to different domains — an LGA
 * can be well staffed and unpowered, which is the single most common real
 * finding in this programme.
 */
function drawMeasures(infraBand, workforceBand) {
  const infra = MEASURE_RANGES[infraBand] ?? MEASURE_RANGES.moderately_ready;
  const workforce = MEASURE_RANGES[workforceBand] ?? MEASURE_RANGES.moderately_ready;

  const clamp = (v) => Math.max(1, Math.min(99, Math.round(v)));
  const mtn = clamp(between(...infra.mtn));

  return {
    networkMtnPct: mtn,
    // Airtel trails MTN in most of the country, but not everywhere and not by a
    // fixed margin — a flat offset would draw the same bar twice.
    networkAirtelPct: clamp(mtn - between(-7, 20)),
    gridConnectionPct: clamp(between(...infra.grid)),
    staffCount: Math.round(between(...workforce.staffPerLga)),
  };
}

/** Mean of a field across a list of measure objects, or null when none carry it. */
function meanOf(list, key) {
  const values = list.map((m) => m[key]).filter((v) => v != null);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Roll child measures up to a parent.
 *
 * Percentages take an unweighted mean and headcount sums, because the two
 * answer different questions: coverage is a proportion of area, staff is a
 * total. Unweighted because this dataset carries no population to weight by —
 * stated rather than hidden, since the real data may well want a weighted mean.
 */
function rollUpMeasures(list) {
  return {
    networkMtnPct: meanOf(list, 'networkMtnPct'),
    networkAirtelPct: meanOf(list, 'networkAirtelPct'),
    gridConnectionPct: meanOf(list, 'gridConnectionPct'),
    staffCount: list.reduce((sum, m) => sum + (m.staffCount ?? 0), 0) || null,
  };
}

/**
 * A harder tilt, for the coverage layer only.
 *
 * `tilt` above is deliberately gentle — it shapes a facility population where
 * the interesting variation is between facilities, not between states. Applied
 * to the coverage hierarchy it produced a country of one colour: rule 2 needs
 * *more than half* an LGA population to agree before a state takes a side, and
 * a gentle tilt never gets a band past about 40%, so all 37 states landed
 * Moderately ready and the map said nothing.
 *
 * This version drains the middle as strength grows — a strong state's LGAs are
 * mostly ready rather than merely leaning that way — which is also the more
 * realistic shape: enabling environments cluster regionally rather than
 * scattering evenly inside a state.
 */
function tiltHard(weights, strength) {
  const k = Math.abs(strength);
  return [
    ['not_ready', weights.not_ready * Math.max(0.1, 1 - strength * 1.6)],
    ['moderately_ready', weights.moderately_ready * (1 - 0.62 * k)],
    ['ready', weights.ready * Math.max(0.1, 1 + strength * 1.6)],
  ];
}

/** An LGA's two domain bands, drawn around its state's strength. */
function drawLgaDomains(strength) {
  return Object.fromEntries(
    COVERAGE_THEMES.map((t) => [t, weighted(tiltHard(STATE_BAND_WEIGHTS, strength))]),
  );
}

/**
 * Build a coverage profile from domain bands, measures and (above LGA level)
 * the children it is made of.
 *
 * The overall band is held down by *both* rules at once — it is no readier than
 * the weakest domain, and no readier than what a majority of its children are.
 * Either alone leaves a hole. Kano showed it: infrastructure not-ready in 21 of
 * 44 LGAs is short of a majority, so both its domains rounded to Moderately
 * ready and the state did too — while 30 of those 44 LGAs were Not ready
 * overall, because each of them had been pulled down by whichever of its own
 * two domains was weaker. A state cannot honestly read Moderately ready when
 * two-thirds of it is Not ready, whatever the domain arithmetic says.
 */
function coverageFrom(themeBands, measures, childBands) {
  const fromDomains = weakerOf(
    themeBands.technical_infrastructure,
    themeBands.workforce_capacity,
  );
  const fromChildren = childBands?.length ? majorityBand(childBands) : null;

  return {
    band: fromChildren ? weakerOf(fromDomains, fromChildren) : fromDomains,
    themeBands,
    measures,
  };
}

// ---------------------------------------------------------------------------
// Investment catalogue
// ---------------------------------------------------------------------------

/**
 * What a facility needs, by the domain that failed it.
 *
 * `perFacilityNGN` is a plausible unit cost, not a quoted one — the whole
 * dataset is synthetic and the Investment Plan page needs numbers to add up.
 * `triggerBands` says which readings pull the item in.
 */
const INVESTMENT_CATALOGUE = [
  {
    id: 'solar_backup',
    label: 'Install inverter and solar backup power system',
    themeId: 'technical_infrastructure',
    category: 'infrastructure',
    priority: 'high',
    unitCostNGN: 1_850_000,
    triggerBands: ['not_ready'],
  },
  {
    id: 'wiring_upgrade',
    label: 'Upgrade internal electrical wiring and socket provision',
    themeId: 'technical_infrastructure',
    category: 'infrastructure',
    priority: 'high',
    unitCostNGN: 420_000,
    triggerBands: ['not_ready', 'moderately_ready'],
  },
  {
    id: 'connectivity',
    label: 'Provision broadband or LTE connectivity with 12-month subscription',
    themeId: 'technical_infrastructure',
    category: 'infrastructure',
    priority: 'high',
    unitCostNGN: 640_000,
    triggerBands: ['not_ready', 'moderately_ready'],
  },
  {
    id: 'devices',
    label: 'Supply computing devices to the facility minimum',
    themeId: 'technical_infrastructure',
    category: 'infrastructure',
    priority: 'high',
    unitCostNGN: 980_000,
    triggerBands: ['not_ready'],
  },
  {
    id: 'device_maintenance',
    label: 'Enrol facility in the device maintenance and replacement scheme',
    themeId: 'technical_infrastructure',
    category: 'infrastructure',
    priority: 'medium',
    unitCostNGN: 145_000,
    triggerBands: ['not_ready', 'moderately_ready'],
  },
  {
    id: 'digital_skills',
    label: 'Run baseline digital skills training for permanent staff',
    themeId: 'workforce_capacity',
    category: 'workforce',
    priority: 'high',
    unitCostNGN: 310_000,
    triggerBands: ['not_ready'],
  },
  {
    id: 'emr_focal_person',
    label: 'Designate and stipend an EMR focal person',
    themeId: 'workforce_capacity',
    category: 'workforce',
    priority: 'medium',
    unitCostNGN: 480_000,
    triggerBands: ['not_ready', 'moderately_ready'],
  },
  {
    id: 'support_desk',
    label: 'Attach facility to the LGA technical support desk',
    themeId: 'workforce_capacity',
    category: 'workforce',
    priority: 'medium',
    unitCostNGN: 95_000,
    triggerBands: ['not_ready'],
  },
  {
    id: 'workflow_mapping',
    label: 'Map service-point workflow and remove duplicate documentation',
    themeId: 'workflow_transition',
    category: 'workflow',
    priority: 'medium',
    unitCostNGN: 260_000,
    triggerBands: ['not_ready', 'moderately_ready'],
  },
  {
    id: 'service_point_fitout',
    label: 'Fit out documenting service points (desk, seating, lockable store)',
    themeId: 'workflow_transition',
    category: 'workflow',
    priority: 'low',
    unitCostNGN: 375_000,
    triggerBands: ['not_ready'],
  },
  {
    id: 'data_review',
    label: 'Establish monthly data review meeting with LGA M&E',
    themeId: 'data_use_reporting',
    category: 'data_use',
    priority: 'medium',
    unitCostNGN: 130_000,
    triggerBands: ['not_ready', 'moderately_ready'],
  },
  {
    id: 'data_backup',
    label: 'Provision routine data backup for service-delivery records',
    themeId: 'data_use_reporting',
    category: 'data_use',
    priority: 'high',
    unitCostNGN: 210_000,
    triggerBands: ['not_ready'],
  },
];

/**
 * Roll a facility population up into a deployment plan.
 *
 * Two halves, and the second is why the page is not called an investment plan.
 * `gaps` counts *what is wrong* — every gap in the population, by how many
 * facilities carry it, whether or not closing it costs anything. `lines` counts
 * *what to do about it*, priced, phased and summed. Data use gaps appear in the
 * first with a facility count and in the second at ₦0, which is the whole point
 * of tracking them: they are work with a quantity and no invoice.
 *
 * Cost is broken out by horizon here rather than at the point of use, because
 * both pages need it and neither should be re-deriving it: Assessed States adds
 * the three together and shows one number, the Deployment Plan pulls them apart
 * and phases the programme against them.
 */
function deploymentFor(facilities) {
  const gapCounts = new Map();
  const lines = new Map();
  const byHorizon = Object.fromEntries(HORIZONS.map((h) => [h, 0]));
  const byDomain = Object.fromEntries(GAP_DOMAINS.map((d) => [d.id, 0]));

  for (const f of facilities) {
    for (const id of f.gaps) gapCounts.set(id, (gapCounts.get(id) ?? 0) + 1);
    for (const iv of f.interventions ?? []) {
      const line = lines.get(iv.id) ?? {
        id: iv.id,
        label: iv.label,
        domain: iv.domain,
        horizon: iv.horizon,
        unitBasis: iv.unitBasis,
        unitCostNGN: iv.unitCostNGN,
        quantity: 0,
        facilityCount: 0,
        totalCostNGN: 0,
      };
      line.quantity += iv.quantity;
      line.facilityCount += 1;
      line.totalCostNGN += iv.totalCostNGN;
      lines.set(iv.id, line);
      byHorizon[iv.horizon] += iv.totalCostNGN;
      byDomain[iv.domain] += iv.totalCostNGN;
    }
  }

  const rows = [...lines.values()].sort((a, b) => b.totalCostNGN - a.totalCostNGN);
  return {
    facilityCount: facilities.length,
    gapCount: facilities.reduce((sum, f) => sum + f.gapCount, 0),
    costNGN: rows.reduce((sum, r) => sum + r.totalCostNGN, 0),
    byHorizon,
    byDomain,
    gaps: FACILITY_GAPS.filter((g) => gapCounts.has(g.id)).map((g) => ({
      id: g.id,
      domain: g.domain,
      subDomain: g.subDomain,
      indicator: g.indicator,
      label: g.label,
      severity: g.severity,
      facilityCount: gapCounts.get(g.id),
    })),
    lines: rows,
  };
}

/** Roll a facility population up into the investment lines it triggers. */
function investmentsFor(facilities) {
  const items = [];
  for (const def of INVESTMENT_CATALOGUE) {
    const triggered = facilities.filter((f) =>
      def.triggerBands.includes(f.themeBands[def.themeId]),
    );
    if (!triggered.length) continue;
    items.push({
      id: def.id,
      label: def.label,
      themeId: def.themeId,
      category: def.category,
      priority: def.priority,
      quantity: triggered.length,
      unitCostNGN: def.unitCostNGN,
      totalCostNGN: triggered.length * def.unitCostNGN,
      facilityCount: triggered.length,
    });
  }
  return items.sort((a, b) => b.totalCostNGN - a.totalCostNGN);
}

// ---------------------------------------------------------------------------
// Facility names
// ---------------------------------------------------------------------------

const FACILITY_KINDS = [
  ['Primary Health Centre', 34],
  ['Health Post', 26],
  ['Basic Health Clinic', 16],
  ['Comprehensive Health Centre', 10],
  ['Maternal and Child Health Clinic', 8],
  ['Model Primary Health Centre', 6],
];

const FUNCTIONALITY = [
  ['Functional L1', 30],
  ['Functional L2', 46],
  ['Partially Functional', 24],
];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const statesGeo = readGeo('public/geo/nigeria-states.geojson');
/** stateId → [{ lgaId, name }] for all 774. Written by build-boundaries.mjs,
 *  which is the source of truth for which LGAs exist. */
const lgaIndex = readGeo('public/geo/lga-index.json');

/** state slug → { name, zone } for all 37. */
const stateMeta = new Map();
for (const f of statesGeo.features) {
  const raw = String(f.properties.statename);
  const name = raw === 'Fct' ? 'FCT' : raw;
  stateMeta.set(slugify(name), {
    name,
    zone: ZONE_BY_CODE[f.properties.geozone] ?? null,
  });
}

/**
 * Bounding boxes for one state's LGAs, read on demand.
 *
 * Only the 12 states carrying facilities need them, and the per-state boundary
 * files are 20–80 kB each — reading 12 of those beats holding all 774 polygons
 * in memory to use 40% of them.
 */
function lgaBoxes(stateId) {
  const geo = readGeo(`public/geo/lgas/${stateId}.json`);
  return new Map(geo.features.map((f) => [f.properties.lgaId, bounds(f.geometry)]));
}

const facilities = [];
const lgaProfiles = [];
const stateProfiles = [];

for (const [stateSlug, meta] of [...stateMeta.entries()].sort()) {
  const lgas = lgaIndex[stateSlug] ?? [];
  if (!lgas.length) throw new Error(`No LGAs indexed for ${stateSlug}`);

  const facilityTarget = PRIMARY_STATE_FACILITY_COUNTS[meta.name] ?? 0;
  const isPrimary = facilityTarget > 0;

  /**
   * How this state does relative to the national picture. Drawn once and
   * applied to everything in it — facilities, LGA readiness, coverage figures —
   * which is what makes states differ from each other rather than each state
   * being 37 independent coin flips.
   */
  const strength = between(-0.55, 0.55);

  /**
   * The same idea for the coverage layer, drawn separately and wider.
   *
   * Separate because the two layers describe different things and the facility
   * draw is already tuned; wider because rule 2's majority threshold needs
   * states that genuinely commit. A state at +0.8 has most of its LGAs ready,
   * which is what lets it be Ready itself.
   */
  const coverageStrength = between(-0.95, 0.95);

  const boxes = isPrimary ? lgaBoxes(stateSlug) : null;

  // Spread the state's facilities over its LGAs: an even base, then the
  // remainder scattered, so LGA counts vary the way a real sample does.
  const base = isPrimary ? Math.floor(facilityTarget / lgas.length) : 0;
  const counts = lgas.map(() => base);
  if (isPrimary) {
    for (let i = 0; i < facilityTarget - base * lgas.length; i += 1) {
      counts[intBetween(0, lgas.length - 1)] += 1;
    }
  }

  const stateFacilities = [];
  const stateLgaProfiles = [];

  lgas.forEach((lga, i) => {
    // An LGA is drawn around its state's strength, not independently — a weak
    // state's LGAs are mostly weak, with enough spread that the drill-down has
    // something to show.
    const lgaStrength = Math.max(-1, Math.min(1, coverageStrength + between(-0.3, 0.3)));
    // Domains first, then the figures that belong to those bands, then the
    // overall band as the weaker of the two. Rules 1 and 3.
    const lgaDomains = drawLgaDomains(lgaStrength);
    const coverage = coverageFrom(
      lgaDomains,
      drawMeasures(lgaDomains.technical_infrastructure, lgaDomains.workforce_capacity),
    );

    const lgaFacilities = [];
    const box = boxes?.get(lga.lgaId);

    for (let n = 0; n < counts[i]; n += 1) {
      const geography = rand() < 0.28 ? 'urban' : 'rural';
      /**
       * The facility's own quality, on top of its state's and its setting's.
       *
       * Drawn once and applied to all four domains together, which is the whole
       * point of it: without it every domain is an independent coin flip and a
       * facility that is Ready on infrastructure is no likelier than any other
       * to be Ready on workforce. The real assessment is not like that — a
       * well-run facility tends to be well-run in every direction — and the
       * difference is not cosmetic. Independent domains put only 12% of
       * facilities in Ready overall against the real 19%, because overall Ready
       * needs three domains to come good at once.
       */
      const localStrength =
        strength + (geography === 'urban' ? 0.22 : -0.08) + between(-0.5, 0.5);

      /**
       * How big the facility is, drawn before its gaps because the gaps are
       * counted against it.
       *
       * `servicePoints` is the one that matters most: registration, triage,
       * consultation, laboratory, pharmacy are the points a facility documents
       * at, and furniture, sockets and devices are all bought per point. A plan
       * that assumed one per facility would understate the workflow bill four
       * times over. `deviceShortfall` is the same arithmetic the workbook does
       * — points that have no device to document on.
       */
      const servicePoints = intBetween(2, 6);
      const staffCount = intBetween(3, 17);
      const deviceCount = Math.max(0, servicePoints - intBetween(0, 3));
      const size = {
        servicePoints,
        staffCount,
        deviceCount,
        deviceShortfall: Math.max(0, servicePoints - deviceCount),
      };

      const gaps = drawGaps(localStrength, 'facility');
      const themeBands = bandsFromGaps(gaps);
      const interventions = interventionsFor(gaps, size);

      // Inset from the bbox edge so a point does not land in the sea off a
      // coastal LGA. Not a point-in-polygon test — close enough at the zoom
      // levels the facility layer is read at.
      const [minLon, minLat, maxLon, maxLat] = box ?? [0, 0, 0, 0];
      const inset = (lo, hi) => between(lo + (hi - lo) * 0.18, hi - (hi - lo) * 0.18);

      const facility = {
        uuid: `f-${String(facilities.length + 1).padStart(5, '0')}`,
        name: `${lga.name} ${weighted(FACILITY_KINDS)}${counts[i] > 1 ? ` ${n + 1}` : ''}`,
        state: meta.name,
        stateId: stateSlug,
        lga: lga.name,
        lgaId: lga.lgaId,
        zone: meta.zone,
        geography,
        lat: Number(inset(minLat, maxLat).toFixed(5)),
        lon: Number(inset(minLon, maxLon).toFixed(5)),
        functionalityLevel: weighted(FUNCTIONALITY),
        isBHCPF: rand() < 0.42,
        archetype: classifyFacility(themeBands),
        themeBands,
        ...size,
        /** Gap ids, in catalogue order. The band above is read off exactly
         *  these — see `bandFromGaps`. */
        gaps: gaps.map((g) => g.id),
        gapCount: gaps.length,
        /** What closing them costs. Zero is a real answer here, not a missing
         *  one: data use gaps are tracked and cost nothing to close. */
        costNGN: interventions.reduce((sum, iv) => sum + iv.totalCostNGN, 0),
      };

      facility.interventions = interventions;

      facilities.push(facility);
      stateFacilities.push(facility);
      lgaFacilities.push(facility);
    }

    const dist = emptyDistribution();
    for (const f of lgaFacilities) dist[f.archetype] += 1;

    const profile = {
      id: `${stateSlug}.${lga.lgaId}`,
      level: 'lga',
      name: lga.name,
      parentId: stateSlug,
      zone: null,
      evidenceGrade: isPrimary ? 'primary' : 'secondary',
      facilityCount: lgaFacilities.length,
      archetypeDistribution: dist,
      themeBands: Object.fromEntries(
        THEMES.map((t) => {
          const d = emptyDistribution();
          for (const f of lgaFacilities) d[f.themeBands[t]] += 1;
          return [t, dominantBand(d)];
        }).concat([['leadership_governance', null]]),
      ),
      themeDistribution: themeDistributionFor(lgaFacilities),
      band: dominantBand(dist),
      coverage,
      investments: investmentsFor(lgaFacilities),
      deployment: deploymentFor(lgaFacilities),
    };

    lgaProfiles.push(profile);
    stateLgaProfiles.push(profile);
  });

  const dist = emptyDistribution();
  for (const f of stateFacilities) dist[f.archetype] += 1;

  const themeBands = Object.fromEntries(
    THEMES.map((t) => {
      const d = emptyDistribution();
      for (const f of stateFacilities) d[f.themeBands[t]] += 1;
      return [t, dominantBand(d)];
    }),
  );
  themeBands.leadership_governance = weighted(
    tilt({ not_ready: 24, moderately_ready: 48, ready: 28 }, strength),
  );

  const readyShare = stateFacilities.length ? dist.ready / stateFacilities.length : 0;
  const wave = readyShare > 0.07 ? 1 : readyShare > 0.035 ? 2 : 3;

  stateProfiles.push({
    id: stateSlug,
    level: 'state',
    name: meta.name,
    parentId: null,
    zone: meta.zone,
    evidenceGrade: isPrimary ? 'primary' : 'secondary',
    facilityCount: stateFacilities.length,
    lgaCount: lgas.length,
    archetypeDistribution: dist,
    themeBands,
    themeDistribution: themeDistributionFor(stateFacilities),
    band: dominantBand(dist),
    // Rule 2 for the domains, rule 1 for the overall band, and figures rolled
    // up from the LGAs — so a reader who drills into this state sees the parts
    // that produced every number and every colour on its own card.
    coverage: coverageFrom(
      Object.fromEntries(
        COVERAGE_THEMES.map((t) => [
          t,
          majorityBand(stateLgaProfiles.map((p) => p.coverage.themeBands[t])),
        ]),
      ),
      rollUpMeasures(stateLgaProfiles.map((p) => p.coverage.measures)),
      stateLgaProfiles.map((p) => p.coverage.band),
    ),
    investments: investmentsFor(stateFacilities),
    deployment: isPrimary
      ? {
          wave,
          startQuarter: ['Q1 2026', 'Q3 2026', 'Q1 2027'][wave - 1],
          ...deploymentFor(stateFacilities),
          /**
           * Leadership & governance, which belongs to the state and stops here.
           *
           * Held apart from `gaps` rather than merged into it, because merging
           * would make the two columns beside each other mean different things:
           * a facility count of 281 against "no digital health strategy" would
           * be counting facilities for a fact that is true of the state once.
           * It has no LGA reading and no facility reading — there is no
           * instrument behind it at those levels — so nothing below this line
           * inherits it.
           */
          stateGaps: drawGaps(strength, 'state').map((g) => ({
            id: g.id,
            domain: g.domain,
            subDomain: g.subDomain,
            indicator: g.indicator,
            label: g.label,
            severity: g.severity,
            interventions: g.interventions.map((iv) => ({
              id: iv.id,
              label: iv.label,
              horizon: iv.horizon,
              // Zero, always, and stated rather than omitted. See the note on
              // uncosted domains in `gap-catalogue.mjs`.
              totalCostNGN: 0,
            })),
          })),
        }
      : null,
  });
}

// --- National ---------------------------------------------------------------

const nationalDist = emptyDistribution();
for (const f of facilities) nationalDist[f.archetype] += 1;

const nationalThemeBands = Object.fromEntries(
  THEMES.map((t) => {
    const d = emptyDistribution();
    for (const f of facilities) d[f.themeBands[t]] += 1;
    return [t, dominantBand(d)];
  }),
);
{
  // Leadership pools the state-level readings, one vote per state.
  const d = emptyDistribution();
  for (const s of stateProfiles) {
    if (s.themeBands.leadership_governance) d[s.themeBands.leadership_governance] += 1;
  }
  nationalThemeBands.leadership_governance = dominantBand(d);
}

const national = {
  id: 'national',
  level: 'national',
  name: 'Nigeria',
  parentId: null,
  zone: null,
  evidenceGrade: 'primary',
  facilityCount: facilities.length,
  lgaCount: lgaProfiles.length,
  archetypeDistribution: nationalDist,
  themeBands: nationalThemeBands,
  themeDistribution: themeDistributionFor(facilities),
  band: dominantBand(nationalDist),
  // The country has no enabling environment of its own, only 37 of them: the
  // same two rules, one level up.
  coverage: coverageFrom(
    Object.fromEntries(
      COVERAGE_THEMES.map((t) => [
        t,
        majorityBand(stateProfiles.map((s) => s.coverage.themeBands[t])),
      ]),
    ),
    rollUpMeasures(stateProfiles.map((s) => s.coverage.measures)),
    stateProfiles.map((s) => s.coverage.band),
  ),
  investments: investmentsFor(facilities),
  deployment: deploymentFor(facilities),
};

const snapshot = {
  builtAt: new Date(Date.UTC(2026, 7, 20)).toISOString(),
  source: 'synthetic — scripts/generate-dummy-data.mjs',
  facilityCount: facilities.length,
  lgaCount: lgaProfiles.length,
  statesPrimary: stateProfiles.filter((s) => s.evidenceGrade === 'primary').length,
  statesSecondary: stateProfiles.filter((s) => s.evidenceGrade === 'secondary').length,
};

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

/**
 * Enforce the three consistency rules on the output, not just in the code that
 * wrote it.
 *
 * The rules are easy to state and easy to break silently — a refactor that
 * reorders two lines can leave a state Ready above a Not ready domain, and
 * nothing on screen says so except the one reader who notices and stops
 * trusting the page. Failing the generator is cheaper than that.
 */
function validate() {
  const problems = [];
  const label = (a) => `${a.name} (${a.level})`;

  const checkOverall = (area, children) => {
    const { band, themeBands } = area.coverage;
    const fromDomains = weakerOf(
      themeBands.technical_infrastructure,
      themeBands.workforce_capacity,
    );
    const fromChildren = children?.length
      ? majorityBand(children.map((c) => c.coverage.band))
      : null;
    const expected = fromChildren ? weakerOf(fromDomains, fromChildren) : fromDomains;

    if (band !== expected) {
      problems.push(
        `${label(area)}: overall ${band}, but domains say ${fromDomains}` +
          (fromChildren ? ` and children say ${fromChildren}` : ''),
      );
    }
  };

  const checkMajority = (parent, children) => {
    for (const t of COVERAGE_THEMES) {
      const expected = majorityBand(children.map((c) => c.coverage.themeBands[t]));
      if (parent.coverage.themeBands[t] !== expected) {
        problems.push(
          `${label(parent)}: ${t} is ${parent.coverage.themeBands[t]}, children say ${expected}`,
        );
      }
    }
  };

  const checkMeasuresFit = (area) => {
    const infra = area.coverage.themeBands.technical_infrastructure;
    const grid = area.coverage.measures.gridConnectionPct;
    // Only meaningful at LGA level, where a measure was drawn rather than
    // averaged: a state's mean can legitimately sit outside its band's range.
    if (area.level === 'lga' && infra && grid != null) {
      const [lo, hi] = MEASURE_RANGES[infra].grid;
      if (grid < lo - 1 || grid > hi + 1) {
        problems.push(`${label(area)}: grid ${grid}% outside ${infra} range ${lo}–${hi}`);
      }
    }
  };

  for (const lga of lgaProfiles) {
    checkOverall(lga, null);
    checkMeasuresFit(lga);
  }
  for (const state of stateProfiles) {
    const kids = lgaProfiles.filter((l) => l.parentId === state.id);
    checkOverall(state, kids);
    checkMajority(state, kids);
  }
  checkOverall(national, stateProfiles);
  checkMajority(national, stateProfiles);

  if (problems.length) {
    console.error(`\nConsistency check failed — ${problems.length} problems:`);
    for (const p of problems.slice(0, 12)) console.error(`  ${p}`);
    if (problems.length > 12) console.error(`  …and ${problems.length - 12} more`);
    process.exit(1);
  }
}

validate();

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
const write = (name, value) => {
  writeFileSync(resolve(OUT, name), `${JSON.stringify(value)}\n`);
};

write('facilities-summary.json', facilities);
write('states.json', stateProfiles);
write('lgas.json', lgaProfiles);
write('national.json', national);
write('snapshot.json', snapshot);

/**
 * The national split, emitted as a module.
 *
 * The landing page paints its waffle before any fetch resolves, so it needs
 * these three numbers at build time. Generating the constant rather than
 * hand-copying it is the only way the page and the dataset cannot drift apart.
 */
writeFileSync(
  resolve(ROOT, 'src/lib/gapCatalogue.ts'),
  `/**
 * GENERATED by scripts/generate-dummy-data.mjs — do not edit.
 *
 * The gap dictionary, as the app sees it. The build-time source of truth is
 * \`scripts/gap-catalogue.mjs\`; this is the same table with the generator's
 * private fields — prevalence weights, exclusions — left behind, because a
 * running dashboard has no business knowing how often a gap was *drawn*.
 *
 * Emitted rather than fetched: every control that offers a gap needs the whole
 * list before it can render one, so a network round-trip would only buy a
 * spinner on a filter dropdown.
 */

import type { Band, FacilityThemeId, GapDomainId, GapSeverity, Horizon } from './types';

export const HORIZONS: Horizon[] = ${JSON.stringify(HORIZONS)};

export const HORIZON_LABEL: Record<Horizon, string> = ${JSON.stringify(HORIZON_LABEL, null, 2)};

/** The five domains. Two of them carry gaps that cost nothing to close, and one
 *  of those attaches to a state rather than a facility. */
export const GAP_DOMAINS = ${JSON.stringify(GAP_DOMAINS, null, 2)} as const;

export const GAP_DOMAIN_LABEL: Record<GapDomainId, string> = ${JSON.stringify(Object.fromEntries(GAP_DOMAINS.map((d) => [d.id, d.label])), null, 2)};

export interface GapDef {
  id: string;
  domain: GapDomainId;
  subDomain: string;
  indicator: string;
  label: string;
  severity: GapSeverity;
  interventions: {
    id: string;
    label: string;
    horizon: Horizon;
    unitBasis: string;
    unitCostNGN: number;
  }[];
}

export const GAPS: GapDef[] = ${JSON.stringify(GAPS.map(({ weight, ...rest }) => rest), null, 2)};

export const GAP_BY_ID: Record<string, GapDef> = Object.fromEntries(
  GAPS.map((g) => [g.id, g]),
);

/** Gaps for a domain selection. No domains ticked means every facility-level
 *  gap, which is what the Gap control offers when Domain is left alone. */
export function gapsForDomains(domains: readonly string[]): GapDef[] {
  const facilityLevel = GAPS.filter(
    (g) => g.domain !== 'leadership_governance' || domains.includes(g.domain),
  );
  if (!domains.length) return facilityLevel.filter((g) => g.domain !== 'leadership_governance');
  return GAPS.filter((g) => domains.includes(g.domain));
}

/** A gap's cost for one facility-shaped thing, at the quantities it implies. */
export function gapCostNGN(
  gap: GapDef,
  size: { servicePoints: number; staffCount: number; deviceShortfall: number },
): number {
  return gap.interventions.reduce((sum, iv) => {
    const q =
      iv.unitBasis === 'per_service_point'
        ? size.servicePoints
        : iv.unitBasis === 'per_staff'
          ? size.staffCount
          : iv.unitBasis === 'per_device'
            ? Math.max(1, size.deviceShortfall)
            : 1;
    return sum + q * iv.unitCostNGN;
  }, 0);
}

/** Band ranks, so a caller can order gap severity beside a readiness band. */
export const SEVERITY_BAND: Record<GapSeverity, Band> = {
  blocking: 'not_ready',
  partial: 'moderately_ready',
};

/** The four domains a facility is banded on. Leadership is a state's. */
export const FACILITY_DOMAIN_IDS: FacilityThemeId[] = ${JSON.stringify(THEMES)};
`,
);

writeFileSync(
  resolve(ROOT, 'src/lib/nationalSplit.ts'),
  `/**
 * GENERATED by scripts/generate-dummy-data.mjs — do not edit.
 *
 * The national readiness split, available synchronously so the landing page
 * can paint before \`DataProvider\` has fetched anything.
 */

import type { Band } from './types';

export const NATIONAL_SPLIT: Record<Band, number> = ${JSON.stringify(
    nationalDist,
    null,
    2,
  )};

/** Facilities carrying a band — the denominator every share on the landing
 *  page is taken over. */
export const NATIONAL_TOTAL = ${facilities.length};
`,
);

const pct = (n) => `${((n / facilities.length) * 100).toFixed(1)}%`;
console.log(`facilities      ${facilities.length}`);
console.log(`lgas            ${lgaProfiles.length}`);
console.log(`states          ${stateProfiles.length} (${snapshot.statesPrimary} primary)`);
console.log(`ready           ${nationalDist.ready} (${pct(nationalDist.ready)})`);
console.log(`moderately      ${nationalDist.moderately_ready} (${pct(nationalDist.moderately_ready)})`);
console.log(`not ready       ${nationalDist.not_ready} (${pct(nationalDist.not_ready)})`);
console.log(`national band   ${national.band} (facility-derived)`);

const stateBands = countBands(stateProfiles.map((s) => s.coverage.band));
console.log(
  `state readiness ${stateBands.ready} ready · ${stateBands.moderately_ready} moderate · ${stateBands.not_ready} not ready`,
);
for (const t of COVERAGE_THEMES) {
  const d = countBands(stateProfiles.map((s) => s.coverage.themeBands[t]));
  console.log(
    `  ${t.padEnd(26)}${d.ready} / ${d.moderately_ready} / ${d.not_ready}`,
  );
}
console.log(
  `national mtn ${national.coverage.measures.networkMtnPct}% · airtel ${national.coverage.measures.networkAirtelPct}% · grid ${national.coverage.measures.gridConnectionPct}% · staff ${national.coverage.measures.staffCount}`,
);
