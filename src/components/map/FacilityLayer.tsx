import { BAND_LABEL } from '@/lib/bands';
import { formatScore } from '@/lib/format';
import { cn } from '@/lib/cn';
import { boundsOfPoints, type Box } from '@/lib/mapProjection';
import { bandMarkerPath, UNIT_FOCUS_CLASS } from './mapTypes';
import { clusterPoints } from './cluster';
import { formatLatLon } from './coordinates';
import type { FacilityPoint, PlottedFacility } from './facilityPoints';
import type { Band } from '@/lib/types';

export type { FacilityPoint, PlottedFacility };

/**
 * Facility point features — the deepest layer's marks.
 *
 * Drawn only inside one LGA, and that is the design rather than a limitation.
 * The map is a progressive drill-down: the country resolves into states, a
 * state into its LGAs, an LGA into the facilities inside it. Scattering
 * facility points across the state and national views would collapse that
 * hierarchy into a single dense plot, and at national extent it also lies —
 * 2,825 points cluster into groups of eighty, and a group has no readiness to
 * report that is not either misleading or vacuous. Facilities appear when the
 * reader has drilled to the level facilities belong to.
 *
 * Kept as its own component so the markers, the clustering and the tooltip are
 * one implementation rather than inline in the layer that happens to use them.
 *
 * ## Marker size
 *
 * Sized in **screen pixels** rather than as a fraction of the viewBox. That is
 * what makes a marker hold its size as the reader zooms, so going in reveals
 * the compound underneath rather than a larger circle covering it — and a
 * fraction of the viewBox is meaningless anyway when one LGA's extent is a
 * twentieth of another's.
 */

/** What the tooltip needs, without knowing that clusters exist. */
export interface FacilityHover {
  /** Position within the map frame, in CSS pixels. */
  x: number;
  y: number;
  members: PlottedFacility[];
}

const BAND_FILL_CLASS: Record<Band, string> = {
  ready: 'fill-ready',
  moderately_ready: 'fill-moderate',
  not_ready: 'fill-notready',
};

/**
 * Marker radius in CSS pixels — see the note above on why this is not a
 * fraction of the viewBox.
 *
 * Raised from 4 at the client's request. The band is carried by the marker's
 * *silhouette* here — circle, square, triangle — and at a 4px radius the three
 * were near enough indistinguishable until the reader zoomed; a triangle needs
 * more pixels to read as a triangle than a dot needs to read as a dot. The
 * cluster cell in `cluster.ts` is 26px and still comfortably clears the wider
 * mark, so grouping behaviour is unchanged.
 */
const MARKER_R_PX = 5.5;

export function FacilityLayer({
  points,
  unitsPerPx,
  cluster,
  selectedId,
  onSelect,
  onExpand,
  showLabels = false,
  onHover,
}: {
  points: PlottedFacility[];
  /** viewBox units per CSS pixel at the live zoom. Sets the marker size and the
   *  cluster cell, so both are constant on screen. */
  unitsPerPx: number;
  cluster: boolean;
  selectedId?: string | null;
  onSelect?: (uuid: string) => void;
  /** Called with the bounding box of a cluster's members when it is clicked —
   *  the "zoom to expand" contract. The caller flies there, because only it
   *  knows its own zoom limit. */
  onExpand?: (box: Box) => void;
  /** Whether points have room for their names. The caller decides, because the
   *  threshold is a property of the level — see `LGAFacilityMap`. */
  showLabels?: boolean;
  onHover?: (hover: FacilityHover | null) => void;
}) {
  const r0 = MARKER_R_PX * unitsPerPx;
  const groups = cluster
    ? clusterPoints(points, unitsPerPx)
    : points.map((p) => ({ key: p.uuid, x: p.x, y: p.y, members: [p], band: p.band }));

  const report = (e: React.MouseEvent, members: PlottedFacility[]) => {
    const box = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect();
    if (!box) return;
    onHover?.({ x: e.clientX - box.left, y: e.clientY - box.top, members });
  };

  return (
    <g>
      {groups.map((c) => {
        const lone = c.members.length === 1;
        const member = c.members[0]!;
        const isSelected = lone && selectedId === member.uuid;
        // A cluster grows with what it holds, but on a log scale — a 40-member
        // cluster is not forty times the ink of a single point, it is roughly
        // twice the radius, which is what keeps a dense urban LGA from being
        // one marker swallowing the map.
        const r = lone
          ? isSelected
            ? r0 * 1.5
            : r0
          : r0 * (1 + Math.log2(c.members.length) * 0.42);

        const label = lone
          ? `${member.name}${member.band ? `, ${BAND_LABEL[member.band]}` : ', no data'}`
          : `Cluster of ${c.members.length} facilities — zoom in to separate them`;

        const activate = () => {
          if (lone) {
            onSelect?.(member.uuid);
            return;
          }
          // Clicking a cluster frames its members, which is what pulls them
          // apart: the grid cell is sized in screen pixels, so a closer view is
          // by construction a view where they no longer share one.
          const box = boundsOfPoints(c.members, r0 * 3);
          if (box) onExpand?.(box);
        };

        return (
          <g key={c.key}>
            <path
              d={bandMarkerPath(c.band, c.x, c.y, r)}
              className={cn(c.band ? BAND_FILL_CLASS[c.band] : 'fill-nodata', UNIT_FOCUS_CLASS)}
              strokeLinejoin="round"
              stroke={isSelected ? 'hsl(var(--brand-500))' : 'hsl(var(--surface))'}
              strokeWidth={isSelected ? r0 / 1.8 : r0 / 4}
              fillOpacity={lone ? 1 : 0.88}
              tabIndex={onSelect ? 0 : -1}
              role={onSelect ? 'button' : undefined}
              aria-label={label}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate();
                }
              }}
              onMouseEnter={(e) => report(e, c.members)}
              onMouseMove={(e) => report(e, c.members)}
              onMouseLeave={() => onHover?.(null)}
              onClick={activate}
            />

            {/* The count is the whole reason a cluster is better than a blob: it
                states the number the overlapping dots could not. Not
                interactive — the marker under it takes the click.

                Ink, not surface: the band fills are the client's pastels and
                are lighter than --surface in both schemes, so a knocked-out
                numeral would be white on near-white. */}
            {!lone && (
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={r * 1.05}
                fontWeight={700}
                pointerEvents="none"
                className="fill-black"
              >
                {c.members.length}
              </text>
            )}

            {/* Zoom-dependent detail: names appear only once the points have
                room for them. */}
            {lone && showLabels && (
              <text
                x={c.x}
                y={c.y - r * 1.7}
                textAnchor="middle"
                fontSize={11 * unitsPerPx}
                fontWeight={600}
                pointerEvents="none"
                className="fill-black"
                style={{
                  paintOrder: 'stroke',
                  stroke: 'rgb(255 255 255 / 0.85)',
                  strokeWidth: 11 * unitsPerPx * 0.3,
                  strokeLinejoin: 'round',
                }}
              >
                {member.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/**
 * What one marker says on hover.
 *
 * Rendered by the map frame rather than inside the `<svg>`, because it is HTML
 * — so every layer that carries facilities renders this beside its SVG rather
 * than the layer component owning it.
 *
 * A cluster and a single facility answer different questions, so they get
 * different tooltips: one names a place, the other says how many places are
 * hiding under the mark and what to do about it.
 */
export function FacilityTooltip({
  hover,
  selectedId,
  selectable,
}: {
  hover: FacilityHover | null;
  selectedId?: string | null;
  /** Whether clicking does anything — the hint line is a lie otherwise. */
  selectable?: boolean;
}) {
  if (!hover) return null;
  const lone = hover.members.length === 1;
  const f = hover.members[0]!;

  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop"
      style={{ left: hover.x, top: hover.y - 10 }}
    >
      {lone ? (
        <>
          <div className="max-w-[220px] font-semibold leading-snug text-foreground">{f.name}</div>
          <p className="mt-0.5 text-muted-foreground">
            {f.band ? BAND_LABEL[f.band] : 'No data'}
            {f.score != null ? ` · ${formatScore(f.score)}/5` : ''}
          </p>
          {/* The geography, for the levels where the frame is not already one
              LGA — a name alone does not say which of the twelve states a
              marker on the national map belongs to. */}
          {(f.lga || f.state) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {[f.lga, f.state].filter(Boolean).join(', ')}
            </p>
          )}
          <p className="mono mt-0.5 text-[10px] text-muted-foreground">
            {formatLatLon(f.lat, f.lon)}
          </p>
          {selectable && (
            <p className="mt-1 text-[11px] font-medium text-brand-600">
              {selectedId === f.uuid ? 'View full Scorecard →' : 'Click to select'}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="font-semibold leading-snug text-foreground">
            {hover.members.length} facilities here
          </div>
          <p className="mt-0.5 text-muted-foreground">
            Too close together to separate at this zoom
          </p>
          <p className="mt-1 text-[11px] font-medium text-brand-600">Click to zoom in</p>
        </>
      )}
    </div>
  );
}
