import { useMemo, useState } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { BAND_LABEL } from '@/lib/bands';
import { formatScore } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  gx,
  gy,
  geomToPath,
  geomBounds,
  fitViewBox,
  MAP_ASPECT_CLASS,
  SVG_W,
  SVG_H,
  type GeoCollection,
} from '@/lib/mapProjection';
import { BOUNDARY_STROKE, bandMarkerPath, useHatchPatternId } from './mapTypes';
import { TileLayer, MapAttribution, MapClip } from './TileLayer';
import { MapZoomControls } from './MapZoomControls';
import { useRenderWidth } from '@/hooks/useRenderWidth';
import { useMapViewport } from '@/hooks/useMapViewport';
import { useBaseMapStore } from '@/store/basemapStore';
import type { Band } from '@/lib/types';
import { LoadError, Skeleton } from '@/components/ui';

const BAND_FILL_CLASS: Record<string, string> = {
  ready: 'fill-ready',
  moderately_ready: 'fill-moderate',
  not_ready: 'fill-notready',
};

/**
 * Facility markers carry their band as a *shape* — circle, square, triangle —
 * not as the texture the polygon layers use. A dot here is a handful of pixels
 * across at base zoom, and a stripe inside one is neither visible nor
 * countable, whereas the silhouette reads at any size. `BAND_MARKER` in
 * `lib/bands.ts` is the source of truth; see `BandPattern.tsx`.
 */
interface LgaFeatureProps {
  id: string;
  lgaId: string;
  stateId: string;
  name: string;
}

export interface FacilityPoint {
  uuid: string;
  name: string;
  lat: number;
  lon: number;
  band: Band | null;
  score?: number | null;
}

interface LGAFacilityMapProps {
  stateId: string;
  lgaId: string;
  lgaName: string;
  facilities: FacilityPoint[];
  selectedFacilityId?: string | null;
  onSelect?: (uuid: string) => void;
  /** Zooming back out past the whole LGA returns to the state's LGA map. */
  onZoomOut?: () => void;
  className?: string;
}

/** The deepest layer, and the one where zoom buys the most — at 12x an urban
 *  LGA's facilities separate into individual compounds on the imagery. */
const FACILITY_MAX_SCALE = 12;

interface HoverInfo {
  uuid: string;
  x: number;
  y: number;
}

/**
 * Facility-level point map within one LGA — adapted from
 * `srh-dashboard/src/components/charts/FacilityMapChart.tsx`'s dot-plotting
 * approach, but scoped to a single LGA and zoomed to its own bounds rather
 * than showing all facilities against the national outline. Positions come
 * straight from each facility's GPS coordinate through the same shared
 * projection as the other two layers.
 */
export function LGAFacilityMap({
  stateId,
  lgaId,
  lgaName,
  facilities,
  selectedFacilityId,
  onSelect,
  onZoomOut,
  className,
}: LGAFacilityMapProps) {
  const geo = useFetchJSON<GeoCollection<LgaFeatureProps> | null>({ path: DATA_PATHS.lgasGeo, fallback: null });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const [frameRef, renderPx] = useRenderWidth<HTMLDivElement>();
  const clipId = `${useHatchPatternId()}-clip`;

  const outline = useMemo(() => {
    if (!geo.data) return null;
    const feature = geo.data.features.find((f) => f.properties.stateId === stateId && f.properties.lgaId === lgaId);
    return feature ? { path: geomToPath(feature.geometry), bounds: geomBounds(feature.geometry) } : null;
  }, [geo.data, stateId, lgaId]);

  const points = useMemo(
    () =>
      facilities
        .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
        .map((f) => ({ ...f, x: gx(f.lon), y: gy(f.lat) })),
    [facilities],
  );

  const baseViewBox = useMemo(() => {
    const pointBounds =
      points.length > 0
        ? {
            x0: Math.min(...points.map((p) => p.x)),
            y0: Math.min(...points.map((p) => p.y)),
            x1: Math.max(...points.map((p) => p.x)),
            y1: Math.max(...points.map((p) => p.y)),
          }
        : { x0: 0, y0: 0, x1: SVG_W, y1: SVG_H };
    return fitViewBox(outline?.bounds ?? pointBounds);
  }, [outline, points]);

  const view = useMapViewport({ base: baseViewBox, maxScale: FACILITY_MAX_SCALE, onDrillOut: onZoomOut });

  if (geo.isLoading && !geo.data) {
    return <Skeleton className={cn(MAP_ASPECT_CLASS, 'w-full', className)} />;
  }
  // This branch was missing: a failed boundary fetch left `isLoading` false and
  // `data` null, so the layer fell through to rendering an outline-less map with
  // no explanation — or, when it failed before any data arrived, sat on the
  // skeleton above forever.
  if (geo.error) {
    return (
      <LoadError
        what="the LGA outline"
        error={geo.error}
        onRetry={geo.refetch}
        className={className}
      />
    );
  }

  const viewBoxStr = baseViewBox;
  const vbWidth = Number(viewBoxStr.split(' ')[2] ?? 100);
  // A pure fraction of the view — no absolute floor. The floor this used to
  // carry was in viewBox units, which is meaningless across layers: 1.5 units
  // is a sensible dot on a 200-unit state and a 40-pixel blob on a 27-unit
  // rural LGA, which is exactly what it rendered as. Divided by the zoom on top
  // of that, so a marker holds its size on screen as the reader goes in rather
  // than swallowing the compound the imagery is there to show.
  const dotRadius = (vbWidth * 0.011) / view.scale;

  const hoverPoint = hover ? points.find((p) => p.uuid === hover.uuid) : null;

  return (
    <div ref={frameRef} className={cn('relative w-full', className)}>
      <svg
        ref={view.svgRef}
        viewBox={view.viewBox}
        className="h-auto w-full select-none"
        style={{
          // Only claim the finger once the reader has deliberately zoomed in.
          // At base scale a one-finger drag is far more likely to be someone
          // scrolling the page past the map than panning it.
          touchAction: view.isZoomed ? 'none' : 'pan-y',
          cursor: view.panning ? 'grabbing' : view.isZoomed ? 'grab' : undefined,
        }}
        role="img"
        aria-label={`${lgaName} facility readiness map`}
        {...view.bind}
      >
        {outline && <MapClip id={clipId} d={outline.path} />}

        {baseMap !== 'plain' && (
          <TileLayer
            baseMap={baseMap}
            viewBox={view.viewBox}
            renderPx={renderPx}
            clipId={outline ? clipId : undefined}
            scrim={0.08}
          />
        )}

        {outline && (
          <path
            d={outline.path}
            className="fill-brand-50"
            // This is the one layer where the base map is the point: the reader
            // is looking at where facilities physically sit. So the wash all
            // but disappears over tiles rather than merely thinning — there is
            // no readiness band at this level for it to be encoding.
            fillOpacity={baseMap === 'plain' ? 1 : 0.06}
            stroke={BOUNDARY_STROKE}
            strokeWidth={Math.min(0.6, Math.max(0.15, vbWidth / 900)) / view.scale}
          />
        )}

        {points.map((p) => {
          const isSelected = selectedFacilityId === p.uuid;
          const fillClass = p.band ? BAND_FILL_CLASS[p.band] : 'fill-nodata';
          const r = isSelected ? dotRadius * 1.5 : dotRadius;
          return (
            <path
              key={p.uuid}
              d={bandMarkerPath(p.band, p.x, p.y, r)}
              className={fillClass}
              strokeLinejoin="round"
              stroke={isSelected ? 'hsl(var(--brand-500))' : 'hsl(var(--surface))'}
              strokeWidth={isSelected ? dotRadius / 1.8 : dotRadius / 4}
              tabIndex={onSelect ? 0 : -1}
              role={onSelect ? 'button' : undefined}
              aria-label={`${p.name}${p.band ? `, ${BAND_LABEL[p.band]}` : ', no data'}`}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(p.uuid);
                }
              }}
              onMouseEnter={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ uuid: p.uuid, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseMove={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ uuid: p.uuid, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(p.uuid)}
            />
          );
        })}

        {/* Deliberately no facility labels. At LGA scale facilities cluster
            within a few viewBox units of each other, so a permanent name on
            every dot overlapped into an unreadable mat and had to be truncated
            to fit — which made it unreliable as well as unreadable. The name,
            band and score are on hover, and in the selection strip below. */}
      </svg>

      <MapZoomControls
        onZoomIn={() => view.zoomBy(1.6)}
        onZoomOut={() => view.zoomBy(1 / 1.6)}
        onReset={view.reset}
        canReset={view.isZoomed}
      />
      <MapAttribution baseMap={baseMap} />

      {hover && hoverPoint && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          <div className="max-w-[220px] font-semibold leading-snug text-foreground">{hoverPoint.name}</div>
          <p className="mt-0.5 text-muted-foreground">
            {hoverPoint.band ? BAND_LABEL[hoverPoint.band] : 'No data'}
            {hoverPoint.score != null ? ` · ${formatScore(hoverPoint.score)}/5` : ''}
          </p>
          {onSelect && (
            <p className="mt-1 text-[11px] font-medium text-brand-600">
              {selectedFacilityId === hoverPoint.uuid ? 'View full Scorecard →' : 'Click to select'}
            </p>
          )}
        </div>
      )}

      {points.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          No GPS-mapped facilities for this selection
        </p>
      )}
    </div>
  );
}
