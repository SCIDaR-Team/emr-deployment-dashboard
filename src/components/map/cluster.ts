/**
 * Grouping facility points that overlap at the current zoom.
 *
 * At the extent of a whole LGA, a marker is a few pixels across and facilities
 * are routinely a few hundred metres apart — so the dots for six clinics along
 * one road are not six dots, they are one blob. That blob is worse than
 * unhelpful: it under-reports. A reader counting marks on the map to judge how
 * much equipment an area needs counts one, and every one of the six is
 * individually unclickable because they are all under each other.
 *
 * Clustering answers both. Overlapping points collapse into a single marker
 * carrying its own count, so the number is *stated* rather than left to be
 * counted off a picture that cannot show it, and clicking one frames its
 * members — the standard "zoom to expand" contract, which is what makes the
 * individual facilities reachable again.
 *
 * ## Why a grid rather than a distance-based clusterer
 *
 * A proper hierarchical clusterer (supercluster and friends) earns its keep on
 * datasets of 10⁵–10⁶ points, where the cost is in the index and the payoff is
 * not rebuilding it per frame. The largest population here is one LGA's
 * facilities — tens, occasionally low hundreds — and a grid pass over that is
 * microseconds. The grid also has a property worth having on its own terms: it
 * is *stable under panning*, because a cell is defined by the projection rather
 * than by which point the algorithm happened to visit first. Distance-based
 * clusters re-form as you pan and markers visibly jump; these do not.
 *
 * The cell is sized in **screen pixels**, not in viewBox units, which is the
 * whole mechanism by which clusters dissolve as the reader zooms: the same
 * pixel budget covers less and less ground, so members that were sharing a cell
 * stop sharing one and separate into individual markers. There is no threshold
 * to tune and no level at which clustering switches off — it simply runs out of
 * points to merge.
 */

import type { Band } from '@/lib/types';

export interface ClusterablePoint {
  uuid: string;
  x: number;
  y: number;
  band: Band | null;
}

export interface Cluster<P extends ClusterablePoint> {
  /** Stable across pans at a given zoom — it is the cell's own address. */
  key: string;
  /** Centre of mass of the members, so the marker sits where its points are
   *  rather than at the centre of an arbitrary grid cell. */
  x: number;
  y: number;
  members: P[];
  /**
   * The worst band present.
   *
   * A cluster has to carry *some* reading or it is a hole in the choropleth,
   * and the worst-case is the only summary that cannot mislead in the direction
   * that matters: a cluster shown as ready must not contain a facility that is
   * not. Averaging would produce exactly that.
   */
  band: Band | null;
}

/** Severity order for the summary above — worst first. */
const BAND_RANK: Record<Band, number> = { not_ready: 0, moderately_ready: 1, ready: 2 };

/**
 * How much room one marker needs to itself, in CSS pixels.
 *
 * Two points closer than this on screen are drawn on top of each other, which
 * is the condition being detected — so the cell is the marker's own footprint
 * plus a little separation, not an arbitrary radius.
 */
const CELL_PX = 26;

export function clusterPoints<P extends ClusterablePoint>(
  points: P[],
  /** viewBox units per CSS pixel at the current zoom — the caller has both
   *  numbers and this keeps the conversion in one place. */
  unitsPerPx: number,
): Cluster<P>[] {
  const cell = CELL_PX * unitsPerPx;
  if (!Number.isFinite(cell) || cell <= 0) {
    return points.map((p) => ({ key: p.uuid, x: p.x, y: p.y, members: [p], band: p.band }));
  }

  const cells = new Map<string, P[]>();
  for (const p of points) {
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(p);
    else cells.set(key, [p]);
  }

  const out: Cluster<P>[] = [];
  for (const [key, members] of cells) {
    let sx = 0;
    let sy = 0;
    let worst: Band | null = null;
    for (const m of members) {
      sx += m.x;
      sy += m.y;
      if (m.band && (worst === null || BAND_RANK[m.band] < BAND_RANK[worst])) worst = m.band;
    }
    out.push({
      // A lone point keys on its own uuid rather than its cell, so a marker
      // that never merges keeps its React identity as the reader zooms and the
      // grid resizes underneath it.
      key: members.length === 1 ? members[0]!.uuid : `c:${key}`,
      x: sx / members.length,
      y: sy / members.length,
      members,
      band: worst,
    });
  }

  // Largest last, so a big cluster paints over the small ones it sits among
  // rather than under them.
  return out.sort((a, b) => a.members.length - b.members.length);
}
