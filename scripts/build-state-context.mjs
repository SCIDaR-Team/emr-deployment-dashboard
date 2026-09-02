/**
 * Build the coarse state-outline context layer.
 *
 *     npm run geo:context
 *
 * Reads `public/geo/nigeria-states.geojson` (2.0 MB, the ADM1 layer the
 * national choropleth draws at full fidelity) and writes a heavily simplified
 * copy for the layers *below* national:
 *
 *     public/geo/nigeria-states-context.json
 *
 * ## Why a second file rather than reusing the first
 *
 * The state and LGA layers now draw their neighbours, because a map that stops
 * at the edge of the thing it is about is not a map — a reader zoomed into
 * Chikun needs to see that Kaduna metropolis is next door. But those neighbours
 * are *context*: they are drawn as a thin muted outline behind everything, at a
 * width of one or two device pixels, and no reader will ever resolve a 30 m
 * wiggle in the Kaduna/Niger border through it.
 *
 * Shipping the full ADM1 layer for that would cost 2.0 MB on a cold deep link
 * into a state — the same "download 11 MB to paint one state" failure
 * `build-boundaries.mjs` exists to avoid. Simplified to a kilometre and rounded
 * to three decimals, the same 37 outlines cost a few tens of kB and are
 * pixel-identical at the widths they are actually stroked.
 *
 * The national map keeps the full-fidelity file: there the coastline *is* the
 * subject, and this tolerance would visibly square it off.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'public/geo/nigeria-states.geojson');
const OUT = resolve(ROOT, 'public/geo/nigeria-states-context.json');

/** ~1 km at Nigeria's latitudes — below a device pixel at any zoom this layer
 *  is drawn at, since a context outline is never the subject of the view. */
const TOLERANCE = 0.01;
/** 3 dp ≈ 110 m, comfortably under the tolerance above. */
const PRECISION = 3;

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
  // A ring that collapses below a triangle is not a ring; keep the original
  // rather than emit a hole in the country.
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

const features = src.features.map((feature) => ({
  type: 'Feature',
  // Only what the context layer reads: `statename`, which the app slugifies
  // into the same state id the national layer uses. Every other ADM1 attribute
  // — globalid, editor, timestamp, source — is dropped.
  properties: { statename: feature.properties.statename },
  geometry: simplifyGeometry(feature.geometry),
}));

const json = JSON.stringify({ type: 'FeatureCollection', features });
writeFileSync(OUT, `${json}\n`);

const before = readFileSync(SRC).length;
console.log(
  `nigeria-states-context.json: ${features.length} states, ` +
    `${(json.length / 1024).toFixed(0)} kB (from ${(before / 1024 / 1024).toFixed(1)} MB)`,
);
