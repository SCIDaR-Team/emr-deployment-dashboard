import { useCallback, useMemo, useState } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { formatCount } from '@/lib/format';
import { BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import {
  geomToPath,
  geomLabelPoint,
  geomBounds,
  unionBounds,
  fitViewBox,
  MAP_ASPECT_CLASS,
  type GeoCollection,
} from '@/lib/mapProjection';
import {
  BOUNDARY_STROKE,
  fillOpacityFor,
  useHatchPatternId,
  useBandPatternId,
  bandPatternFill,
  scoreStepFill,
  textureUnit,
  type GeoDatum,
} from './mapTypes';
import { BandPatternDefs } from './BandPattern';
import { MapLabel } from './MapLabel';
import { TileLayer, MapAttribution, MapClip } from './TileLayer';
import { MapZoomControls } from './MapZoomControls';
import { useRenderWidth } from '@/hooks/useRenderWidth';
import { useMapViewport, unitAtPoint } from '@/hooks/useMapViewport';
import { useBaseMapStore } from '@/store/basemapStore';
import { Skeleton, EmptyState, LoadError } from '@/components/ui';

/** Small relative to a zoomed-in state viewBox, so real boundary detail
 *  survives instead of flattening into blocky shapes. */
const LGA_EPS = 0.004;

interface LgaFeatureProps {
  id: string;
  lgaId: string;
  stateId: string;
  name: string;
}

interface StateLGAMapProps {
  stateId: string;
  stateName: string;
  /** Keyed by bare LGA slug (`dala`, `orumba_south`, ...). */
  data: Record<string, GeoDatum>;
  selectedLgaId?: string | null;
  onSelect?: (lgaId: string) => void;
  /** Zooming back out past the whole state returns to the national map. */
  onZoomOut?: () => void;
  className?: string;
}

/** A state's LGAs are already small on screen; past this the facility layer is
 *  the one with anything left to add. */
const STATE_MAX_SCALE = 4;

interface HoverInfo {
  lgaId: string;
  x: number;
  y: number;
}

/**
 * LGA choropleth within one state — new, not ported from either reference
 * dashboard (both are state-level only, guide §6.4). Reuses the same
 * projection as `NigeriaChoropleth` and `LGAFacilityMap`, but fits its
 * viewBox to the state's own bounds so zooming in is a viewBox change, never
 * a reprojection (guide §14).
 *
 * Only the 12 primary states have LGA polygons (§14 — "only the 12 primary
 * states need LGA polygons at launch"), so a secondary state renders an
 * explanatory empty state instead of an silently blank map.
 */
export function StateLGAMap({
  stateId,
  stateName,
  data,
  selectedLgaId,
  onSelect,
  onZoomOut,
  className,
}: StateLGAMapProps) {
  const geo = useFetchJSON<GeoCollection<LgaFeatureProps> | null>({ path: DATA_PATHS.lgasGeo, fallback: null });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const [frameRef, renderPx] = useRenderWidth<HTMLDivElement>();
  const clipId = `${useHatchPatternId()}-clip`;
  const bandId = useBandPatternId();

  const shapes = useMemo(() => {
    if (!geo.data) return [];
    return geo.data.features
      .filter((f) => f.properties.stateId === stateId)
      .map((f) => ({
        lgaId: f.properties.lgaId,
        name: f.properties.name,
        path: geomToPath(f.geometry, LGA_EPS),
        label: geomLabelPoint(f.geometry),
        bounds: geomBounds(f.geometry),
      }));
  }, [geo.data, stateId]);

  const baseViewBox = useMemo(
    () => (shapes.length ? fitViewBox(unionBounds(shapes.map((s) => s.bounds))) : '0 0 1000 813'),
    [shapes],
  );

  const view = useMapViewport({
    base: baseViewBox,
    maxScale: STATE_MAX_SCALE,
    onDrillIn: useCallback(
      (point: { x: number; y: number }, svg: SVGSVGElement | null) => {
        const lgaId = unitAtPoint(svg, point);
        if (lgaId) onSelect?.(lgaId);
      },
      [onSelect],
    ),
    onDrillOut: onZoomOut,
  });

  if (geo.isLoading && !geo.data) {
    return <Skeleton className={cn(MAP_ASPECT_CLASS, 'w-full', className)} />;
  }
  if (geo.error) {
    return (
      <LoadError
        what="the LGA boundaries"
        error={geo.error}
        onRetry={geo.refetch}
        className={className}
      />
    );
  }
  if (shapes.length === 0) {
    return (
      <EmptyState
        title={`No LGA boundaries for ${stateName}`}
        message="LGA polygons are only available for the 12 physically-assessed states. Only those states can be drilled into below the state level."
      />
    );
  }

  const [, , vbW = 1000] = baseViewBox.split(' ').map(Number);
  const outlinePath = shapes.map((s) => s.path).join(' ');
  // Absolute stroke widths look right at the national 1000-wide viewBox but
  // balloon once the SVG scales a much smaller state-sized viewBox up to fill
  // the same on-screen card — a "1.8-unit" line in a 150-unit-wide state is
  // ~9x more prominent than the same 1.8 units at national scale. Deriving
  // width from the viewBox keeps the rendered line a constant visual weight
  // regardless of how large or small the state is.
  // ...and divided again by the live zoom, so panning around a zoomed-in state
  // doesn't progressively fatten every LGA border.
  const hairline = Math.min(0.6, Math.max(0.12, vbW / 900)) / view.scale;
  const outlineWidth = hairline * 3;
  const labelSize = Math.min(7, Math.max(3, vbW / 70)) / view.scale;
  const fillOpacity = fillOpacityFor(baseMap);
  const hoverDatum = hover ? data[hover.lgaId] : null;
  const hoverShape = hover ? shapes.find((s) => s.lgaId === hover.lgaId) : null;

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
        aria-label={`${stateName} LGA readiness map`}
        {...view.bind}
      >
        <MapClip id={clipId} d={outlinePath} />
        <BandPatternDefs id={bandId} unit={textureUnit(view.viewBox)} />
        {baseMap === 'plain' ? (
          <path d={outlinePath} className="fill-brand-50" />
        ) : (
          <TileLayer baseMap={baseMap} viewBox={view.viewBox} renderPx={renderPx} clipId={clipId} />
        )}

        <g style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.14))' }}>
          {shapes.map((shape) => {
            const datum = data[shape.lgaId];
            const isSelected = selectedLgaId === shape.lgaId;
            const isFocused = focused === shape.lgaId;
            const interactive = !!onSelect;
            const outlined = isSelected || isFocused;
            // Colour plus texture — see BandPattern. The Tailwind fill class
            // must stay off a patterned path or CSS overrides the attribute.
            // A sequential step wins over the band when the caller supplied
            // one — see the note on GeoDatum.step.
            const bandFill =
              scoreStepFill(datum?.step) ?? bandPatternFill(bandId, datum?.band);

            return (
              <path
                key={shape.lgaId}
                d={shape.path}
                data-unit-id={shape.lgaId}
                fill={bandFill}
                fillOpacity={fillOpacity}
                className={cn(bandFill ? undefined : 'fill-nodata', 'transition-opacity duration-150')}
                stroke={outlined ? 'hsl(var(--brand-500))' : BOUNDARY_STROKE}
                strokeWidth={outlined ? outlineWidth : hairline}
                strokeLinejoin="round"
                tabIndex={interactive ? 0 : -1}
                role={interactive ? 'button' : undefined}
                aria-label={`${shape.name}${datum?.band ? `, ${BAND_LABEL[datum.band]}` : ', no data'}`}
                style={{ cursor: interactive ? 'pointer' : 'default' }}
                onFocus={() => setFocused(shape.lgaId)}
                onBlur={() => setFocused(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect?.(shape.lgaId);
                  }
                }}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ lgaId: shape.lgaId, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseMove={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ lgaId: shape.lgaId, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(shape.lgaId)}
              />
            );
          })}
        </g>

        {/* Anchored at each LGA's pole of inaccessibility, and bounded by its
            inscribed circle — LGA shapes are far more concave than states, so a
            centroid label routinely landed in a neighbouring LGA or on the
            shared border. Long names wrap and shrink to stay inside. */}
        {shapes.map((shape) => (
          <MapLabel
            key={`label-${shape.lgaId}`}
            x={shape.label.x}
            y={shape.label.y}
            text={shape.name}
            fontSize={labelSize}
            maxWidth={shape.label.r * 1.9}
            minFontSize={labelSize * 0.55}
          />
        ))}
      </svg>

      <MapZoomControls
        onZoomIn={() => view.zoomBy(1.6)}
        onZoomOut={() => view.zoomBy(1 / 1.6)}
        onReset={view.reset}
        canReset={view.isZoomed}
      />
      <MapAttribution baseMap={baseMap} />

      {hover && hoverShape && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          <div className="font-semibold text-foreground">{hoverShape.name}</div>
          {hoverDatum?.band ? (
            <p className="mt-0.5 text-muted-foreground">
              {BAND_LABEL[hoverDatum.band]} · {formatCount(hoverDatum.n)} facilities
            </p>
          ) : (
            <p className="mt-0.5 italic text-muted-foreground">No data for this selection</p>
          )}
          {onSelect && <p className="mt-1 text-[11px] font-medium text-brand-600">Click to drill in</p>}
        </div>
      )}
    </div>
  );
}
