/**
 * Build the LGA boundary layer, one file per state.
 *
 *     npm run geo:build
 *
 * Reads OCHA's COD-AB Nigeria ADM2 layer (774 LGAs, GRID3-sourced — the same
 * provenance as `public/geo/nigeria-states.geojson`'s ADM1 layer, so the two
 * share naming conventions and CRS) and writes:
 *
 *     public/geo/lgas/<stateId>.json   37 files, one per state
 *     public/geo/lga-index.json        stateId → [{ lgaId, name }]
 *
 * Source: https://data.humdata.org/dataset/cod-ab-nga
 *
 * ## Why per-state files, and not one national layer
 *
 * The raw ADM2 layer is 5.8 MB. Nothing in this dashboard ever draws more than
 * one state's LGAs at a time — the national map draws states, and the drill-down
 * draws exactly the state you clicked — so a national LGA layer would ship 36
 * states' geometry to render one. Split and simplified, a state costs 20–80 kB
 * and arrives while the zoom animation is still running.
 *
 * This is the same failure mode as the NPHCDA PHC dashboard, which fetches an
 * 11 MB uncompressed GeoJSON before it can paint anything. Splitting by the
 * unit the UI actually asks for is the whole fix.
 *
 * ## Simplification
 *
 * Douglas–Peucker at `TOLERANCE` degrees, then coordinates rounded to
 * `PRECISION` decimal places. Both are set for the zoom the LGA layer is read
 * at — a state fills roughly 700 viewBox units, so detail finer than ~150 m is
 * subpixel and costs bytes to draw nothing. Rings that collapse below four
 * points are kept unsimplified rather than dropped: a tiny urban LGA is still
 * an LGA, and a hole in a state's fill reads as a data error.
 */

import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'scripts/source-data/nga_admin2.geojson');
const OUT_DIR = resolve(ROOT, 'public/geo/lgas');
const INDEX = resolve(ROOT, 'public/geo/lga-index.json');

/**
 * ~45 m at Nigeria's latitudes.
 *
 * Was 0.0015 (~167 m), set when the deepest view this dashboard offered was a
 * whole state and anything finer than about 150 m was subpixel. The facility
 * layer now bottoms out at a 500 m frame, where 167 m is not a rounded corner
 * — it is a straight segment running most of the way across the screen, and a
 * boundary drawn that way reads as careless even though the geometry behind it
 * is sound.
 *
 * The cost is per *state*, not for the country: the layer fetches one state's
 * file and never more (see the note on splitting, above). Kano goes 48 kB to
 * 80 kB, about 10 kB more over the wire once compressed, which is well inside
 * the budget that split was made to protect.
 *
 * This does **not** bring our boundaries closer to the ones drawn on the base
 * map. Those come from OpenStreetMap and differ from the COD-AB set by far more
 * than any tolerance here; see `--map-admin` in globals.css for how that is
 * handled. Finer geometry makes our own line crisper and, if anything, makes
 * the disagreement slightly easier to see.
 */
const TOLERANCE = 0.0004;
/** 4 dp ≈ 11 m. Below the simplification tolerance, so it costs no shape. */
const PRECISION = 4;

const slugify = (v) =>
  String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** COD-AB spells the FCT out; the ADM1 layer this must join to says "Fct". */
const STATE_ALIASES = { federal_capital_territory: 'fct' };

// ---------------------------------------------------------------------------
// Douglas–Peucker
// ---------------------------------------------------------------------------

/** Perpendicular distance from p to the segment ab, in degrees. */
function perpendicular(p, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;
  return Math.sqrt(dx * dx + dy * dy);
}

function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Iterative rather than recursive: a ring can carry several thousand points
  // and the recursive form blows the stack on the worst of them.
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const dist = perpendicular(points[i], points[first], points[last]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i += 1) if (keep[i]) out.push(points[i]);
  // A closed ring needs at least four points (the last repeating the first) to
  // enclose any area at all.
  return out.length >= 4 ? out : points;
}

const round = (n) => Number(n.toFixed(PRECISION));

function simplifyGeometry(geometry) {
  const ring = (r) => simplifyRing(r, TOLERANCE).map(([lon, lat]) => [round(lon), round(lat)]);
  const polygon = (p) => p.map(ring);

  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: polygon(geometry.coordinates) };
  }
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(polygon) };
  }
  throw new Error(`Unexpected geometry type: ${geometry.type}`);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const source = JSON.parse(readFileSync(SRC, 'utf8'));

const byState = new Map();
for (const feature of source.features) {
  const rawState = slugify(feature.properties.adm1_name);
  const stateId = STATE_ALIASES[rawState] ?? rawState;
  const name = feature.properties.adm2_name;
  const lgaId = slugify(name);

  const list = byState.get(stateId) ?? [];
  list.push({
    type: 'Feature',
    properties: { id: `${stateId}.${lgaId}`, lgaId, stateId, name },
    geometry: simplifyGeometry(feature.geometry),
  });
  byState.set(stateId, list);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const index = {};
let totalBytes = 0;
let totalFeatures = 0;

for (const [stateId, features] of [...byState.entries()].sort()) {
  // Duplicate LGA slugs inside one state would collide as ids and silently
  // drop a polygon from the drill-down. None occur today; fail loudly if the
  // source ever changes.
  const ids = new Set();
  for (const f of features) {
    if (ids.has(f.properties.lgaId)) {
      throw new Error(`Duplicate LGA slug in ${stateId}: ${f.properties.lgaId}`);
    }
    ids.add(f.properties.lgaId);
  }

  const json = JSON.stringify({ type: 'FeatureCollection', features });
  writeFileSync(resolve(OUT_DIR, `${stateId}.json`), `${json}\n`);
  totalBytes += json.length;
  totalFeatures += features.length;
  index[stateId] = features.map((f) => ({ lgaId: f.properties.lgaId, name: f.properties.name }));
}

writeFileSync(INDEX, `${JSON.stringify(index)}\n`);

const kb = (n) => `${Math.round(n / 1024)} kB`;
console.log(`states          ${byState.size}`);
console.log(`lgas            ${totalFeatures}`);
console.log(`total           ${kb(totalBytes)} (was ${kb(readFileSync(SRC).length)})`);
console.log(`largest state   ${kb(Math.max(...[...byState.values()].map((f) => JSON.stringify(f).length)))}`);
