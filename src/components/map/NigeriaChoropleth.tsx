import { useCallback, useMemo, useState } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { slugify, formatCount } from '@/lib/format';
import { BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { MapHatchDefs } from './MapHatch';
import { BandPatternDefs } from './BandPattern';
import { MapLabel } from './MapLabel';
import { TileLayer, MapAttribution, MapClip } from './TileLayer';
import { useRenderWidth } from '@/hooks/useRenderWidth';
import {
  hatchFill,
  useHatchPatternId,
  useBandPatternId,
  bandPatternFill,
  scoreStepFill,
  textureUnit,
  BOUNDARY_STROKE,
  fillOpacityFor,
  type GeoDatum,
} from './mapTypes';
import { useBaseMapStore } from '@/store/basemapStore';
import { MapZoomControls } from './MapZoomControls';
import { useMapViewport, unitAtPoint } from '@/hooks/useMapViewport';
import {
  MAP_ASPECT_CLASS,
  SVG_W,
  SVG_H,
  geomToPath,
  geomLabelPoint,
  geomBounds,
  unionBounds,
  fitViewBox,
  type GeoCollection,
} from '@/lib/mapProjection';
import { LoadError, Skeleton } from '@/components/ui';

/** Boundary fidelity in absolute viewBox units — small relative to the
 *  1000-wide national view, so real coastline/border detail survives instead
 *  of being flattened into the blocky look a coarser simplification gives. */
const NATIONAL_EPS = 0.01;

const STATE_LABEL_SIZE = 9.5;

interface NigeriaChoroplethProps {
  /** Keyed by state slug id (`akwa_ibom`, `fct`, ...). */
  data: Record<string, GeoDatum>;
  selectedId?: string | null;
  onSelect?: (stateId: string) => void;
  className?: string;
}

/** How far the national map can zoom before the state's own LGA layer is the
 *  better thing to be looking at. */
const NATIONAL_MAX_SCALE = 5;

interface HoverInfo {
  stateId: string;
  x: number;
  y: number;
}

/**
 * National choropleth — all 37 states.
 *
 * Adapted from `NPHCDA_dashboard_int/src/components/map/NigeriaMap.tsx`, but
 * projects the same GRID3/COD-AB GeoJSON `srh-dashboard` already ships
 * (`nigeria-states.geojson`) through the shared Web Mercator projection in
 * `src/lib/mapProjection.ts`, rather than NPHCDA's hand-tuned inline SVG paths
 * — that keeps this layer on the exact same lon/lat → viewBox math as the LGA
 * and facility layers (guide §14).
 */
export function NigeriaChoropleth({ data, selectedId, onSelect, className }: NigeriaChoroplethProps) {
  const geo = useFetchJSON<GeoCollection | null>({ path: DATA_PATHS.statesGeo, fallback: null });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const hatchId = useHatchPatternId();
  const bandId = useBandPatternId();
  const clipId = `${hatchId}-clip`;
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const [frameRef, renderPx] = useRenderWidth<HTMLDivElement>();

  const shapes = useMemo(() => {
    if (!geo.data) return [];
    return geo.data.features.map((f) => {
      const raw = String((f.properties as Record<string, unknown>).statename ?? '');
      const stateId = slugify(raw);
      return {
        stateId,
        name: raw === 'Fct' ? 'FCT' : raw,
        path: geomToPath(f.geometry, NATIONAL_EPS),
        label: geomLabelPoint(f.geometry),
        bounds: geomBounds(f.geometry),
      };
    });
  }, [geo.data]);

  // Framed to the country's own bounds rather than the projection's rectangle,
  // so the map is evenly inset in its card instead of touching the edges.
  const baseViewBox = useMemo(
    () => (shapes.length ? fitViewBox(unionBounds(shapes.map((s) => s.bounds)), 0.02) : `0 0 ${SVG_W} ${SVG_H}`),
    [shapes],
  );

  const view = useMapViewport({
    base: baseViewBox,
    maxScale: NATIONAL_MAX_SCALE,
    // Zooming past what this layer can usefully show is the same intent as
    // clicking the state under the crosshair — so it does the same thing.
    onDrillIn: useCallback(
      (point: { x: number; y: number }, svg: SVGSVGElement | null) => {
        const stateId = unitAtPoint(svg, point);
        if (stateId && data[stateId]?.evidenceGrade !== 'secondary') onSelect?.(stateId);
      },
      [onSelect, data],
    ),
  });

  if (geo.isLoading && !geo.data) {
    return <Skeleton className={cn(MAP_ASPECT_CLASS, 'w-full', className)} />;
  }
  if (geo.error) {
    return (
      <LoadError
        what="the state boundaries"
        error={geo.error}
        onRetry={geo.refetch}
        className={className}
      />
    );
  }

  const hoverDatum = hover ? data[hover.stateId] : null;
  const outlinePath = shapes.map((s) => s.path).join(' ');
  const fillOpacity = fillOpacityFor(baseMap);

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
        aria-label="Nigeria states readiness map"
        {...view.bind}
      >
        <MapHatchDefs id={hatchId} solid={baseMap === 'plain'} />
        <BandPatternDefs id={bandId} unit={textureUnit(view.viewBox)} />
        <MapClip id={clipId} d={outlinePath} />
        {/* Plain: a wash behind the landmass so states read as sitting on a
            map rather than floating on the card's own background. Otherwise
            the reader's chosen base map, clipped to the country — see
            TileLayer. */}
        {baseMap === 'plain' ? (
          <path d={outlinePath} className="fill-brand-50" />
        ) : (
          // The live viewBox, not the base one: tiles then re-cut themselves at
          // the zoom the reader is actually at, so imagery sharpens on the way
          // in instead of upscaling.
          <TileLayer baseMap={baseMap} viewBox={view.viewBox} renderPx={renderPx} clipId={clipId} />
        )}

        <g style={{ filter: 'drop-shadow(0 2px 5px rgb(0 0 0 / 0.16))' }}>
          {shapes.map((shape) => {
            const datum = data[shape.stateId];
            const isSecondary = datum?.evidenceGrade === 'secondary';
            const isSelected = selectedId === shape.stateId;
            const isFocused = focused === shape.stateId;
            const interactive = !isSecondary && !!onSelect;
            const outlined = isSelected || isFocused;

            // A band fill is a `<pattern>` — colour plus texture, so the scale
            // survives a colour-vision deficiency and a greyscale print. The
            // Tailwind fill class has to come *off* when one is in use: a class
            // sets `fill` through CSS, which outranks the attribute, and the
            // state would render flat with the texture silently dropped.
            // A sequential step wins over the band when the caller supplied
            // one — see the note on GeoDatum.step. Otherwise a band fill is a
            // `<pattern>`: colour plus texture, so the scale survives a
            // colour-vision deficiency and a greyscale print.
            const bandFill = isSecondary
              ? hatchFill(hatchId)
              : (scoreStepFill(datum?.step) ?? bandPatternFill(bandId, datum?.band));
            const fillClass = bandFill ? undefined : 'fill-nodata';

            return (
              <path
                key={shape.stateId}
                d={shape.path}
                data-unit-id={shape.stateId}
                fill={bandFill}
                fillOpacity={fillOpacity}
                className={cn(fillClass, 'transition-opacity duration-150')}
                stroke={outlined ? 'hsl(var(--brand-500))' : BOUNDARY_STROKE}
                // Divided by the zoom: stroke width is in viewBox units, so
                // without this every boundary thickens as the reader zooms in,
                // and the map ends up more line than fill.
                strokeWidth={(outlined ? 2.2 : 1) / view.scale}
                strokeLinejoin="round"
                tabIndex={interactive ? 0 : -1}
                role={interactive ? 'button' : undefined}
                aria-label={
                  isSecondary
                    ? `${shape.name}, secondary evidence — desk review only, no facility detail`
                    : `${shape.name}${
                        datum?.valueLabel
                          ? `, ${datum.valueLabel}`
                          : datum?.band
                            ? `, ${BAND_LABEL[datum.band]}`
                            : ', no data'
                      }`
                }
                style={{ cursor: interactive ? 'pointer' : 'default' }}
                onFocus={() => interactive && setFocused(shape.stateId)}
                onBlur={() => setFocused(null)}
                onKeyDown={(e) => {
                  if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect?.(shape.stateId);
                  }
                }}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ stateId: shape.stateId, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseMove={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ stateId: shape.stateId, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => interactive && onSelect?.(shape.stateId)}
              />
            );
          })}
        </g>

        {/* Permanent state labels — always on, per the FRS: a reader should
            never have to hover to know which state they're looking at. Anchored
            at the pole of inaccessibility and sized to the inscribed circle, so
            a name sits inside its own state rather than over the border it
            shares with the next one. */}
        {shapes.map((shape) => (
          <MapLabel
            key={`label-${shape.stateId}`}
            x={shape.label.x}
            y={shape.label.y}
            text={shape.name}
            fontSize={STATE_LABEL_SIZE / view.scale}
            maxWidth={shape.label.r * 1.9}
            minFontSize={(STATE_LABEL_SIZE * 0.62) / view.scale}
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

      {hover &&
        (() => {
          const shape = shapes.find((s) => s.stateId === hover.stateId);
          if (!shape) return null;
          const isSecondary = hoverDatum?.evidenceGrade === 'secondary';
          return (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop"
              style={{ left: hover.x, top: hover.y - 10 }}
            >
              <div className="font-semibold text-foreground">{shape.name}</div>
              {isSecondary ? (
                <p className="mt-0.5 max-w-[200px] italic text-muted-foreground">
                  Secondary evidence — desk review only, no facility-level detail
                </p>
              ) : hoverDatum?.band ? (
                <p className="mt-0.5 text-muted-foreground">
                  {BAND_LABEL[hoverDatum.band]} · {formatCount(hoverDatum.n)} facilities
                </p>
              ) : (
                <p className="mt-0.5 italic text-muted-foreground">No data for this selection</p>
              )}
              {!isSecondary && onSelect && (
                <p className="mt-1 text-[11px] font-medium text-brand-600">
                  {selectedId === hover.stateId ? 'Click to clear' : 'Click to drill in'}
                </p>
              )}
            </div>
          );
        })()}
    </div>
  );
}
