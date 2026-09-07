/**
 * Build the single-state outline layer, one file per state.
 *
 *     npm run geo:outlines
 *
 * Reads `public/geo/nigeria-states.geojson` (2.0 MB, the ADM1 layer the
 * national choropleth draws at full fidelity) and writes:
 *
 *     public/geo/states/<stateId>.json   37 files, one Feature each
 *
 * ## Why this exists
 *
 * National Coverage has two levels: the country, and one state. The second one
 * draws the state as a *silhouette* — one filled shape, no internal lines —
 * because an LGA is not a unit this page classifies and drawing 44 of them
 * inside the subject was 44 divisions the reader has no reading for.
 *
 * That shape cannot come from either file we already ship.
 *
 * `nigeria-states.geojson` has exactly the right geometry, and costs 2.0 MB to
 * get one state out of it — the "download 11 MB to paint one state" failure
 * that `build-boundaries.mjs` exists to avoid, and worse here, because this is
 * a view a reader flips into and out of.
 *
 * `nigeria-states-context.json` is the same 37 outlines at 65 kB, and is the
 * obvious candidate until you look at what it was simplified *for*: a hairline
 * drawn behind the subject at one device pixel, where a kilometre of tolerance
 * is invisible. Fill that outline and make it the subject and the tolerance
 * stops being invisible — a kilometre is about three screen pixels at a state's
 * extent, so Lagos' lagoon edge and the Niger delta arrive visibly squared off.
 * The context script says as much about the national map, and a state's own
 * silhouette is the same argument one level down.
 *
 * So: the same split-by-what-the-UI-asks-for as the LGA layer, at the LGA
 * layer's own tolerance, which keeps a state's border and its LGAs' borders on
 * the same geometry if the two are ever drawn together.
 */

import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'public/geo/nigeria-states.geojson');
const OUT_DIR = resolve(ROOT, 'public/geo/states');

/** ~45 m, matching `build-boundaries.mjs` — the subject of a state view is
 *  read at the same zoom whether it is one polygon or forty-four. */
const TOLERANCE = 0.0004;
/** 4 dp ≈ 11 m, under the tolerance, so it costs no shape. */
const PRECISION = 4;

const slugify = (v) =>
  String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

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
  return Math.hypot(p[0] - x, p[1] - y);
}

/** Douglas–Peucker, iterative so a 40,000-point coastline cannot blow the
 *  stack. Lifted from `build-state-context.mjs`; same shape, finer tolerance. */
function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let max = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out = points.filter((_, i) => keep[i]);
  // A ring that collapses below a triangle is not a ring — an island in the
  // delta is still land, and a dropped one reads as a hole in the state.
  return out.length >= 4 ? out : points;
}

const round = (v) => Number(v.toFixed(PRECISION));

function simplifyGeometry(geometry) {
  const ring = (r) => simplifyRing(r, TOLERANCE).map(([lon, lat]) => [round(lon), round(lat)]);
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(ring) };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map((poly) => poly.map(ring)),
  };
}

const src = JSON.parse(readFileSync(SRC, 'utf8'));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const written = new Map();

for (const feature of src.features) {
  const name = String(feature.properties.statename ?? '');
  const stateId = slugify(name);
  if (!stateId) throw new Error('ADM1 feature with no statename');
  // One file per state id, so a duplicated ADM1 row would silently overwrite a
  // state's geometry with a fragment of itself. None occur today.
  if (written.has(stateId)) throw new Error(`Duplicate state slug: ${stateId}`);

  const json = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        // Only what the layer reads. Every other ADM1 attribute — globalid,
        // editor, timestamp, source — is dropped, as in the context build.
        properties: { stateId, name },
        geometry: simplifyGeometry(feature.geometry),
      },
    ],
  });
  writeFileSync(resolve(OUT_DIR, `${stateId}.json`), `${json}\n`);
  written.set(stateId, json.length);
}

const kb = (n) => `${Math.round(n / 1024)} kB`;
const sizes = [...written.entries()].sort((a, b) => b[1] - a[1]);
console.log(`states          ${written.size}`);
console.log(`total           ${kb(sizes.reduce((s, [, n]) => s + n, 0))} (was ${kb(readFileSync(SRC).length)})`);
console.log(`largest         ${sizes[0][0]} ${kb(sizes[0][1])}`);
console.log(`smallest        ${sizes[sizes.length - 1][0]} ${kb(sizes[sizes.length - 1][1])}`);
