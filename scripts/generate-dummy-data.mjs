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
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Per-domain band weights at a state of average strength.
 *
 * Read down the columns: technical infrastructure is not_ready roughly three
 * times as often as workforce capacity is. This table is the entire national
 * finding — everything else in the output follows from it.
 */
const DOMAIN_WEIGHTS = {
  technical_infrastructure: { not_ready: 45, moderately_ready: 38, ready: 17 },
  workforce_capacity: { not_ready: 12, moderately_ready: 46, ready: 42 },
  workflow_transition: { not_ready: 34, moderately_ready: 46, ready: 20 },
  data_use_reporting: { not_ready: 28, moderately_ready: 45, ready: 27 },
};

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

/**
 * A facility's overall band from its four domain bands.
 *
 * The band-only restatement of the assessment's archetype rule: a gap in either
 * core domain (infrastructure, workforce) cannot be bought off with strength in
 * the supporting two.
 */
function classify(themeBands) {
  const rank = { not_ready: 1, moderately_ready: 2, ready: 3 };
  const core = Math.min(
    rank[themeBands.technical_infrastructure],
    rank[themeBands.workforce_capacity],
  );
  const supporting = Math.min(
    rank[themeBands.workflow_transition],
    rank[themeBands.data_use_reporting],
  );
  if (core === 1) return 'not_ready';
  if (core === 3 && supporting >= 2) return 'ready';
  return 'moderately_ready';
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
const lgasGeo = readGeo('public/geo/nigeria-lgas.geojson');

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

/** state slug → LGA features, with a bbox to scatter facilities inside. */
const lgasByState = new Map();
for (const f of lgasGeo.features) {
  const list = lgasByState.get(f.properties.stateId) ?? [];
  list.push({
    lgaId: f.properties.lgaId,
    id: f.properties.id,
    name: f.properties.name,
    bbox: bounds(f.geometry),
  });
  lgasByState.set(f.properties.stateId, list);
}

const facilities = [];
const lgaProfiles = [];
const stateProfiles = [];

for (const [stateSlug, meta] of [...stateMeta.entries()].sort()) {
  const primaryCount = PRIMARY_STATE_FACILITY_COUNTS[meta.name] ?? 0;
  const isPrimary = primaryCount > 0;

  /** How this state does relative to the national picture. Drawn once and
   *  applied to every facility in it, which is what makes states differ. */
  const strength = between(-0.55, 0.55);

  if (!isPrimary) {
    // Desk-reviewed: state-level readings, no facility rows behind them.
    const themeBands = Object.fromEntries(
      [...THEMES, 'leadership_governance'].map((t) => [
        t,
        weighted(tilt(DOMAIN_WEIGHTS[t] ?? DOMAIN_WEIGHTS.data_use_reporting, strength)),
      ]),
    );
    stateProfiles.push({
      id: stateSlug,
      level: 'state',
      name: meta.name,
      parentId: null,
      zone: meta.zone,
      evidenceGrade: 'secondary',
      facilityCount: 0,
      lgaCount: 0,
      archetypeDistribution: emptyDistribution(),
      themeBands,
      themeDistribution: themeDistributionFor([]),
      band: classify(themeBands),
      investments: [],
      deployment: null,
    });
    continue;
  }

  const lgas = lgasByState.get(stateSlug) ?? [];
  const stateFacilities = [];

  // Spread the state's facilities over its LGAs: an even base, then the
  // remainder scattered, so LGA counts vary the way a real sample does.
  const base = Math.floor(primaryCount / lgas.length);
  const counts = lgas.map(() => base);
  for (let i = 0; i < primaryCount - base * lgas.length; i += 1) {
    counts[intBetween(0, lgas.length - 1)] += 1;
  }

  lgas.forEach((lga, i) => {
    const lgaFacilities = [];
    const [minLon, minLat, maxLon, maxLat] = lga.bbox;
    // Urban LGAs skew readier, and there are fewer of them.
    const urbanShare = weighted([
      [0.85, 12],
      [0.35, 30],
      [0.1, 58],
    ]);

    for (let n = 0; n < counts[i]; n += 1) {
      const geography = rand() < urbanShare ? 'urban' : 'rural';
      const localStrength = strength + (geography === 'urban' ? 0.22 : -0.08);

      const themeBands = Object.fromEntries(
        THEMES.map((t) => [t, weighted(tilt(DOMAIN_WEIGHTS[t], localStrength))]),
      );

      const facility = {
        uuid: `f-${String(facilities.length + 1).padStart(5, '0')}`,
        name: `${lga.name} ${weighted(FACILITY_KINDS)}${counts[i] > 1 ? ` ${n + 1}` : ''}`,
        state: meta.name,
        stateId: stateSlug,
        lga: lga.name,
        lgaId: lga.lgaId,
        zone: meta.zone,
        geography,
        // Inset from the bbox edge so a point does not land in the sea off a
        // coastal LGA. Not a point-in-polygon test — close enough at the zoom
        // levels the facility layer is read at.
        lat: Number(between(minLat + (maxLat - minLat) * 0.18, maxLat - (maxLat - minLat) * 0.18).toFixed(5)),
        lon: Number(between(minLon + (maxLon - minLon) * 0.18, maxLon - (maxLon - minLon) * 0.18).toFixed(5)),
        functionalityLevel: weighted(FUNCTIONALITY),
        isBHCPF: rand() < 0.42,
        archetype: classify(themeBands),
        themeBands,
      };

      facilities.push(facility);
      stateFacilities.push(facility);
      lgaFacilities.push(facility);
    }

    const dist = emptyDistribution();
    for (const f of lgaFacilities) dist[f.archetype] += 1;

    lgaProfiles.push({
      id: `${stateSlug}.${lga.lgaId}`,
      level: 'lga',
      name: lga.name,
      parentId: stateSlug,
      zone: null,
      evidenceGrade: 'primary',
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
      investments: investmentsFor(lgaFacilities),
      deployment: null,
    });
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
  // Leadership & Governance has no facility instrument behind it anywhere —
  // it is a state-level desk reading in the primary states too.
  themeBands.leadership_governance = weighted(
    tilt({ not_ready: 24, moderately_ready: 48, ready: 28 }, strength),
  );

  const readyShare = dist.ready / stateFacilities.length;
  const wave = readyShare > 0.07 ? 1 : readyShare > 0.035 ? 2 : 3;

  stateProfiles.push({
    id: stateSlug,
    level: 'state',
    name: meta.name,
    parentId: null,
    zone: meta.zone,
    evidenceGrade: 'primary',
    facilityCount: stateFacilities.length,
    lgaCount: lgas.length,
    archetypeDistribution: dist,
    themeBands,
    themeDistribution: themeDistributionFor(stateFacilities),
    band: dominantBand(dist),
    investments: investmentsFor(stateFacilities),
    deployment: {
      wave,
      startQuarter: ['Q1 2026', 'Q3 2026', 'Q1 2027'][wave - 1],
      facilityCount: stateFacilities.length,
      costNGN: investmentsFor(stateFacilities).reduce((sum, i) => sum + i.totalCostNGN, 0),
    },
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
  investments: investmentsFor(facilities),
  deployment: null,
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
console.log(`national band   ${national.band}`);
