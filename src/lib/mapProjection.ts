/**
 * Shared Web Mercator projection for every map layer.
 *
 * National (states), state (LGAs) and LGA (facility points) all plot the same
 * GRID3/COD-AB-sourced lon/lat coordinates through this one set of constants,
 * per build guide §14: "keep the projection constants identical across all
 * layers... a state zoom is a viewBox change rather than a reprojection."
 * Both `NPHCDA_dashboard_int` and `srh-dashboard` converge on these same
 * lon/lat bounds independently — do not tune them per layer.
 *
 * Mercator, not the equirectangular this file used to carry: the map now
 * renders optional OpenStreetMap / satellite raster tiles underneath the
 * polygons, and every web tile service in existence is Web Mercator. Under
 * equirectangular the tiles and the boundaries would drift apart by a few
 * kilometres across Nigeria's latitude span — visible as coastline sitting
 * off the coast. Mercator is a *linear* function of tile-world coordinates,
 * so a tile is an exact axis-aligned rectangle in viewBox units (see
 * WORLD_SIZE below) and the two layers register perfectly at any zoom.
 */

const DEG = Math.PI / 180;

/** Web Mercator northing, in radians, for a latitude in degrees. */
function mercator(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
}

export const MIN_LON = 2.67;
export const MAX_LON = 14.68;
export const MIN_LAT = 4.27;
export const MAX_LAT = 13.9;

const X_MIN = MIN_LON * DEG;
const X_MAX = MAX_LON * DEG;
const Y_MIN = mercator(MIN_LAT);
const Y_MAX = mercator(MAX_LAT);

export const SVG_W = 1000;

/** viewBox units per radian of Mercator space — one scale for both axes, which
 *  is what keeps the projection conformal and tiles square. */
const K = SVG_W / (X_MAX - X_MIN);

/**
 * Derived, never hand-set: at SVG_W = 1000 this is ~813.5. The old 760 was a
 * vertical squash of the true aspect; with tiles underneath, any mismatch
 * would show up as stretched imagery. `MAP_ASPECT_CLASS` below is the Tailwind
 * class that matches it (arbitrary values must be literal for the scanner).
 */
export const SVG_H = (Y_MAX - Y_MIN) * K;

/** Loading-skeleton aspect ratio — keep in step with SVG_H. */
export const MAP_ASPECT_CLASS = 'aspect-[1000/813]';

export function gx(lon: number): number {
  return (lon * DEG - X_MIN) * K;
}

export function gy(lat: number): number {
  return (Y_MAX - mercator(lat)) * K;
}

// ---------------------------------------------------------------------------
// Tile-world anchors
// ---------------------------------------------------------------------------

/**
 * Slippy-map tile coordinates are normalised: the whole world spans u,v ∈ [0,1]
 * at zoom 0, and a tile at zoom z covers exactly 1/2^z of each axis. Because
 * this projection is linear in Mercator space, that normalised world maps onto
 * our viewBox by a single scale and offset:
 *
 *     svgX = u * WORLD_SIZE - WORLD_X0
 *     svgY = v * WORLD_SIZE - WORLD_Y0
 *
 * which makes tile placement pure arithmetic — see components/map/tiles.ts.
 */
export const WORLD_SIZE = 2 * Math.PI * K;
export const WORLD_X0 = (Math.PI + X_MIN) * K;
export const WORLD_Y0 = (Math.PI - Y_MAX) * K;

// ---------------------------------------------------------------------------
// GeoJSON
// ---------------------------------------------------------------------------

export interface GeoFeature<P = Record<string, unknown>> {
  type: 'Feature';
  properties: P;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: [number, number][][] | [number, number][][][];
  };
}

export interface GeoCollection<P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: GeoFeature<P>[];
}

/** Drop points that don't move the path more than `eps` viewBox units — keeps
 *  a ~300-vertex LGA ring from costing 300 SVG path commands. */
export function simplifyRing(ring: [number, number][], eps = 0.015): [number, number][] {
  if (ring.length <= 3) return ring;
  // Non-null: every index below is guarded by the loop bounds against `ring`,
  // which is known non-empty (length > 3 here).
  const out: [number, number][] = [ring[0]!];
  for (let i = 1; i < ring.length - 1; i++) {
    const [px, py] = out[out.length - 1]!;
    const [cx, cy] = ring[i]!;
    if (Math.abs(cx - px) >= eps || Math.abs(cy - py) >= eps) out.push(ring[i]!);
  }
  out.push(ring[ring.length - 1]!);
  return out;
}

function ringToPath(ring: [number, number][], eps?: number): string {
  const pts = simplifyRing(ring, eps);
  return (
    pts
      .map(([lon, lat], i) => `${i === 0 ? 'M' : 'L'}${gx(lon).toFixed(2)},${gy(lat).toFixed(2)}`)
      .join(' ') + ' Z'
  );
}

// GeoJSON Polygon/MultiPolygon coordinates are never empty in valid data — the
// outer ring (index 0) always exists. Non-null assertions below reflect that
// invariant rather than suppress a real possibility of absence.

/**
 * Derivation caches, keyed on the geometry object itself.
 *
 * Everything below — the path, the label anchor, the bounding box — is a pure
 * function of one geometry and (for the path) an `eps`. None of it depends on
 * scores, filters, theme or viewport, so it is worth computing exactly once per
 * geometry per session.
 *
 * It was not. Each map component derives its shapes in a `useMemo`, and a memo
 * lives and dies with its component instance: `NigeriaChoropleth` unmounts when
 * the explorer drills into a state and mounts again on the way back out, so a
 * reader drilling in and out repaid the whole national derivation every time
 * — 132 ms measured per drill-out on a desktop, and ~490 ms on the first, cold
 * one. The same applies to switching between the two routes that show the
 * national map. `geo.data` is already a stable reference across those mounts
 * (`useFetchJSON` caches parsed JSON per path for the session), so the memo
 * *inputs* never changed — only the memo did.
 *
 * A `WeakMap` rather than a `Map` so that clearing the fetch cache still lets
 * the geometry, and these derivations with it, be collected.
 */
const pathCache = new WeakMap<GeoFeature['geometry'], Map<number, string>>();
const labelCache = new WeakMap<GeoFeature['geometry'], { x: number; y: number; r: number }>();
const boundsCache = new WeakMap<
  GeoFeature['geometry'],
  { x0: number; y0: number; x1: number; y1: number }
>();

/**
 * `eps` is in the same absolute viewBox units regardless of caller — pass a
 * smaller value for a layer that gets zoomed into (LGA boundaries), where the
 * default would otherwise still be a visible fraction of the much smaller
 * on-screen shape once the viewBox shrinks to fit one state.
 *
 * Cached per (geometry, eps): the same LGA is drawn at one eps on the state
 * drill-down and another on the facility layer, so a single slot per geometry
 * would thrash between them.
 */
export function geomToPath(geom: GeoFeature['geometry'], eps?: number): string {
  // -1 stands in for "caller passed nothing", which resolves to ringToPath's own
  // default. A real eps is always positive, so the two can never collide.
  const key = eps ?? -1;
  let byEps = pathCache.get(geom);
  if (!byEps) {
    byEps = new Map();
    pathCache.set(geom, byEps);
  }
  const hit = byEps.get(key);
  if (hit !== undefined) return hit;

  const path =
    geom.type === 'Polygon'
      ? ringToPath((geom.coordinates as [number, number][][])[0]!, eps)
      : (geom.coordinates as [number, number][][][])
          .map((poly) => ringToPath(poly[0]!, eps))
          .join(' ');
  byEps.set(key, path);
  return path;
}

/** Bounding box of a geometry, in SVG viewBox units — used to fit a viewBox
 *  around one state's LGAs when the explorer zooms in. */
export function geomBounds(geom: GeoFeature['geometry']): { x0: number; y0: number; x1: number; y1: number } {
  const cached = boundsCache.get(geom);
  if (cached) return cached;
  const box = computeBounds(geom);
  boundsCache.set(geom, box);
  return box;
}

function computeBounds(geom: GeoFeature['geometry']): { x0: number; y0: number; x1: number; y1: number } {
  const rings: [number, number][][] =
    geom.type === 'Polygon'
      ? [(geom.coordinates as [number, number][][])[0]!]
      : (geom.coordinates as [number, number][][][]).map((poly) => poly[0]!);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      const px = gx(lon);
      const py = gy(lat);
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
  }
  return { x0, y0, x1, y1 };
}

export function unionBounds(
  boxes: { x0: number; y0: number; x1: number; y1: number }[],
): { x0: number; y0: number; x1: number; y1: number } {
  return boxes.reduce(
    (a, b) => ({
      x0: Math.min(a.x0, b.x0),
      y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1),
      y1: Math.max(a.y1, b.y1),
    }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  );
}

/**
 * Pad a bounding box into a viewBox that frames it evenly.
 *
 * Deliberately *not* clamped to 0..SVG_W/H. That clamp used to exist to keep a
 * state from asking for a viewBox outside the national box, but the national
 * box is just Nigeria's own bounding box — so every state on a national edge
 * (Lagos, Borno, Sokoto, Rivers) lost its padding on that side and rendered
 * jammed against the card edge while floating in the middle on the other axis.
 * Nothing downstream needs the clamp: the raster tile layer is happy to serve
 * the sliver of ocean or Niger that a coastal or border state's padding now
 * includes, and it reads as a map rather than a cropped one.
 */
export function fitViewBox(
  box: { x0: number; y0: number; x1: number; y1: number },
  padFrac = 0.06,
): string {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const pad = Math.max(Math.max(w, h) * padFrac, 4);
  const x0 = box.x0 - pad;
  const y0 = box.y0 - pad;
  const x1 = box.x1 + pad;
  const y1 = box.y1 + pad;
  return `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Label anchoring — pole of inaccessibility
// ---------------------------------------------------------------------------

type Pt = [number, number];

/**
 * Signed distance to the polygon boundary — positive inside, negative out.
 *
 * This is the hot loop of the whole map layer: `polylabel` calls it once per
 * candidate cell, and each call walks every segment of every ring. Measured on
 * the national view (37 states, 53,761 vertices) it accounted for ~435 ms of the
 * ~490 ms the choropleth spent before its first paint.
 *
 * Two exact optimisations, neither of which changes a single returned value —
 * verified across all 37 states and all 305 LGAs at zero label displacement and
 * zero inscribed-radius delta:
 *
 * - **Compare squared distances.** The caller only ever ranks distances against
 *   each other, so the `sqrt` inside `Math.hypot` is paid once at the end
 *   instead of once per segment.
 * - **Reject a segment by its bounding box first.** If the gap between the
 *   probe point and the segment's own bbox already exceeds the best distance so
 *   far, no point on that segment can beat it, so the projection arithmetic is
 *   skipped. Most segments of a 1,500-vertex ring are nowhere near the pole.
 *
 * The tempting *approximate* optimisation — simplifying the ring before running
 * polylabel, the way `geomToPath` already simplifies before emitting commands —
 * was measured and rejected. At an eps large enough to matter (3.4x at eps=1) it
 * moved labels by up to 40 viewBox units on a 1000-unit-wide map, which is
 * exactly the "label is not inside its own area" failure the pole of
 * inaccessibility exists to prevent. Correctness first; the cache below is where
 * the rest of the win comes from.
 */
function signedDistance(px: number, py: number, rings: Pt[][]): number {
  let inside = false;
  let min2 = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      const ax = a[0];
      const ay = a[1];
      const bx = b[0];
      const by = b[1];

      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
        inside = !inside;
      }

      // Bounding-box reject, per axis, against the best distance so far.
      const loX = ax < bx ? ax : bx;
      const hiX = ax < bx ? bx : ax;
      const gapX = px < loX ? loX - px : px > hiX ? px - hiX : 0;
      if (gapX * gapX >= min2) continue;
      const loY = ay < by ? ay : by;
      const hiY = ay < by ? by : ay;
      const gapY = py < loY ? loY - py : py > hiY ? py - hiY : 0;
      if (gapY * gapY >= min2) continue;

      let x = ax;
      let y = ay;
      const dx = bx - ax;
      const dy = by - ay;
      if (dx !== 0 || dy !== 0) {
        const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
          x = bx;
          y = by;
        } else if (t > 0) {
          x += dx * t;
          y += dy * t;
        }
      }
      const ex = px - x;
      const ey = py - y;
      const d2 = ex * ex + ey * ey;
      if (d2 < min2) min2 = d2;
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(min2);
}

interface Cell {
  x: number;
  y: number;
  /** Half the cell's side. */
  h: number;
  /** Signed distance from the cell centre to the polygon. */
  d: number;
  /** Upper bound on `d` anywhere in this cell — the branch-and-bound key. */
  max: number;
}

function makeCell(x: number, y: number, h: number, rings: Pt[][]): Cell {
  const d = signedDistance(x, y, rings);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

/** Max-heap on `max`. A plain sorted array would be re-sorted thousands of
 *  times across 774 LGAs; this keeps label placement off the critical path. */
class CellQueue {
  private items: Cell[] = [];

  get size(): number {
    return this.items.length;
  }

  push(cell: Cell): void {
    const a = this.items;
    a.push(cell);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]!.max >= a[i]!.max) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }

  pop(): Cell | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last !== undefined) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let big = i;
        if (l < a.length && a[l]!.max > a[big]!.max) big = l;
        if (r < a.length && a[r]!.max > a[big]!.max) big = r;
        if (big === i) break;
        [a[big], a[i]] = [a[i]!, a[big]!];
        i = big;
      }
    }
    return top;
  }
}

/**
 * Pole of inaccessibility — the point furthest from any edge, i.e. the centre
 * of the largest circle that fits inside the polygon (Mapbox's polylabel,
 * inlined rather than added as a dependency).
 *
 * This is what a label should hang off, not a centroid. A vertex-mean centroid
 * of a concave shape — a crescent-shaped LGA, a state wrapped around a river
 * bend — lands *outside* the polygon or right on its boundary, which is
 * exactly the "label is not inside its own area" problem. The returned `r` is
 * the inscribed radius, so callers also know how much room the label has.
 */
function polylabel(rings: Pt[][], precision: number): { x: number; y: number; r: number } {
  const outer = rings[0]!;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of outer) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }

  const w = x1 - x0;
  const h = y1 - y0;
  const cellSize = Math.min(w, h);
  if (cellSize === 0) return { x: x0, y: y0, r: 0 };

  const queue = new CellQueue();
  const half = cellSize / 2;
  for (let x = x0; x < x1; x += cellSize) {
    for (let y = y0; y < y1; y += cellSize) {
      queue.push(makeCell(x + half, y + half, half, rings));
    }
  }

  let best = makeCell(x0 + w / 2, y0 + h / 2, 0, rings);

  // Bounded so a pathological ring can never stall a render.
  let guard = 20_000;
  while (queue.size > 0 && guard-- > 0) {
    const cell = queue.pop()!;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const q = cell.h / 2;
    queue.push(makeCell(cell.x - q, cell.y - q, q, rings));
    queue.push(makeCell(cell.x + q, cell.y - q, q, rings));
    queue.push(makeCell(cell.x - q, cell.y + q, q, rings));
    queue.push(makeCell(cell.x + q, cell.y + q, q, rings));
  }

  return { x: best.x, y: best.y, r: Math.max(0, best.d) };
}

function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
  }
  return Math.abs(a / 2);
}

function projectRing(ring: [number, number][]): Pt[] {
  return ring.map(([lon, lat]) => [gx(lon), gy(lat)] as Pt);
}

/**
 * Where to put this shape's label, in viewBox units, plus the radius of the
 * largest circle that fits around it.
 *
 * For a MultiPolygon the label goes on the *largest* part by area — for Lagos
 * or Bayelsa that is the mainland, not whichever islet happens to have the
 * most digitised vertices (which is what a vertex-count heuristic picks).
 */
export function geomLabelPoint(geom: GeoFeature['geometry']): { x: number; y: number; r: number } {
  const cached = labelCache.get(geom);
  if (cached) return cached;
  const point = computeLabelPoint(geom);
  labelCache.set(geom, point);
  return point;
}

function computeLabelPoint(geom: GeoFeature['geometry']): { x: number; y: number; r: number } {
  let rings: Pt[][];
  if (geom.type === 'Polygon') {
    rings = (geom.coordinates as [number, number][][]).map(projectRing);
  } else {
    const polys = geom.coordinates as [number, number][][][];
    const largest = polys.reduce((best, poly) =>
      ringArea(projectRing(poly[0]!)) > ringArea(projectRing(best[0]!)) ? poly : best,
    polys[0]!);
    rings = largest.map(projectRing);
  }

  // Precision relative to the shape's own size: a 400-unit-wide state and a
  // 4-unit-wide LGA both converge in a comparable number of subdivisions.
  const outer = rings[0]!;
  let span = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [x] of outer) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  span = maxX - minX;

  return polylabel(rings, Math.max(span / 200, 0.005));
}
