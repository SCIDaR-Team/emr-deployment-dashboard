import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { slugify, formatCount } from '@/lib/format';
import { BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { MapHatchDefs } from './MapHatch';
import { MapLabel } from './MapLabel';
import { TileLayer, MapAttribution, MapClip, MapCorner } from './TileLayer';
import { useRenderSize } from '@/hooks/useRenderSize';
import {
  hatchFill,
  useHatchPatternId,
  bandFlatFill,
  scoreStepFill,
  BOUNDARY_STROKE,
  UNIT_FOCUS_CLASS,
  fillOpacityFor,
  type GeoDatum,
} from './mapTypes';
import { useBaseMapStore } from '@/store/basemapStore';
import { useMapLayers } from '@/store/mapLayerStore';
import type { MapFit } from './mapTypes';
import { MapToolbar } from './MapToolbar';
import type { MapSearchResult } from './MapSearch';
import { MapScaleBar } from './MapScaleBar';
import { MapBreadcrumb, type Crumb } from './MapBreadcrumb';
import { PointerCoordinates } from './MapCoordinates';
import { useMapViewport, unitAtPoint } from '@/hooks/useMapViewport';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useMapExport } from '@/hooks/useMapExport';
import {
  MAP_ASPECT_CLASS,
  SVG_W,
  SVG_H,
  geomToPath,
  geomLabelPoint,
  geomBounds,
  unionBounds,
  fitViewBox,
  latAtY,
  lonAtX,
  type GeoCollection,
} from '@/lib/mapProjection';
import { LoadError, Skeleton } from '@/components/ui';

/** Boundary fidelity in absolute viewBox units — small relative to the
 *  1000-wide national view, so real coastline/border detail survives instead
 *  of being flattened into the blocky look a coarser simplification gives. */
const NATIONAL_EPS = 0.01;

/** One size for every state name. Larger than it was, because the labels no
 *  longer shrink to fit — a state that cannot hold its name at this size goes
 *  unlabelled and is named on hover instead. */
const STATE_LABEL_SIZE = 12;

interface NigeriaChoroplethProps {
  /** See the note on MapFit. */
  fit?: MapFit;
  /** Keyed by state slug id (`akwa_ibom`, `fct`, ...). */
  data: Record<string, GeoDatum>;
  selectedId?: string | null;
  onSelect?: (stateId: string) => void;
  /** The geographic hierarchy above this view — see `MapBreadcrumb`. At
   *  national extent that is one crumb, and it is still worth drawing: it is
   *  where the reader learns the map has levels below it. */
  crumbs?: Crumb[];
  /** Page-supplied furniture drawn inside the map frame, so it survives full
   *  screen — the legend, normally. */
  overlay?: ReactNode;
  /** What the fills encode, named — stamped under an exported image, where the
   *  legend is pixels and the reader cannot hover anything to find out. */
  exportScope?: string;
  /** Resolve a name to a place the map can go to — see `MapSearch`. */
  onSearch?: (query: string) => MapSearchResult[];
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
 * Projects the GRID3/COD-AB ADM1 GeoJSON in `public/geo` through the shared Web
 * Mercator projection in `src/lib/mapProjection.ts`, which is the same math the
 * LGA layer uses — so drilling from a state into its LGAs moves the viewBox and
 * never reprojects, and the two layers agree on where a coordinate lands.
 */
export function NigeriaChoropleth({
  data,
  selectedId,
  onSelect,
  crumbs,
  overlay,
  exportScope,
  onSearch,
  fit = 'aspect',
  className,
}: NigeriaChoroplethProps) {
  const geo = useFetchJSON<GeoCollection | null>({ path: DATA_PATHS.statesGeo, fallback: null });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  /** Live position under the pointer, for the coordinate readout. */
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const hatchId = useHatchPatternId();
  const clipId = `${hatchId}-clip`;
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const layers = useMapLayers();
  const fullscreen = useFullscreen<HTMLDivElement>();
  const [frameRef, renderPx] = useRenderSize<HTMLDivElement>();
  const mapExport = useMapExport(fullscreen.ref, {
    name: ['nigeria-states', exportScope],
    scope: crumbs?.map((c) => c.label).join(' / ') ?? 'Nigeria',
    encoding: exportScope,
    baseMap,
  });

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
    layerKey: 'national',
    // The extent is Nigeria's own bounding box, which is not known until the
    // boundaries land — see the note on `ready`.
    ready: shapes.length > 0,
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

  const selectedShape = selectedId ? shapes.find((sh) => sh.stateId === selectedId) : null;

  return (
    <div
      ref={(el) => {
        frameRef(el);
        // Two refs on one element: the size observer that picks the tile zoom,
        // and the element the full-screen request is made against.
        (fullscreen.ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className={cn(
        'relative w-full',
        fit === 'fill' && 'h-full',
        fullscreen.isFullscreen && 'h-full w-full bg-page',
        className,
      )}
    >
      <svg
        ref={view.svgRef}
        viewBox={view.viewBox}
        className={cn(
          'w-full select-none',
          fit === 'fill' || fullscreen.isFullscreen ? 'h-full' : 'h-auto',
        )}
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
        onPointerMove={(e) => {
          view.bind.onPointerMove(e);
          const pt = view.toViewport(e.clientX, e.clientY);
          setCursor({ lat: latAtY(pt.y), lon: lonAtX(pt.x) });
        }}
        onPointerLeave={() => setCursor(null)}
      >
        <MapHatchDefs id={hatchId} solid={baseMap === 'plain'} />
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

            // A sequential step wins over the band when the caller supplied
            // one — see the note on GeoDatum.step. Otherwise the band's flat
            // colour; the textures these fills used to carry were dropped at
            // the client's direction — see `bandFlatFill`.
            //
            // With the thematic layer switched off the polygons stay — they
            // are the geography, not the finding — but they stop carrying a
            // value and go transparent, so whatever base map is underneath
            // reads at full strength. This is the toggle's whole purpose.
            const bandFill = !layers.indicator
              ? undefined
              : isSecondary
                ? hatchFill(hatchId)
                : (scoreStepFill(datum?.step) ?? bandFlatFill(datum?.band));
            const fillClass = layers.indicator && !bandFill ? 'fill-nodata' : undefined;

            return (
              <path
                key={shape.stateId}
                d={shape.path}
                data-unit-id={shape.stateId}
                fill={bandFill}
                fillOpacity={layers.indicator ? fillOpacity : 0}
                className={cn(fillClass, UNIT_FOCUS_CLASS, 'transition-opacity duration-150')}
                stroke={
                  outlined
                    ? 'hsl(var(--brand-500))'
                    : layers.boundaries
                      ? BOUNDARY_STROKE
                      : 'transparent'
                }
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

        {/* Permanent state labels — on by default, per the FRS: a reader
            should never have to hover to know which state they're looking at.
            Anchored at the pole of inaccessibility and sized to the inscribed
            circle, so a name sits inside its own state rather than over the
            border it shares with the next one. Switchable now, because a name
            is sometimes the thing in the way — see `MapLayerPanel`.

            The halo follows the base map, and that is what closed the first of
            the three conditions `BaseMapControl` set on shipping base-map
            switching. Flat black with no halo is the better reading over the
            band fills — the colours are light enough that a halo is only
            fattening the letters — and it is unreadable over satellite imagery
            or an OSM street map, where a name can land on anything from a
            reservoir to a roof. So the halo appears exactly when there is
            imagery for it to separate the name from. */}
        {layers.labels &&
          shapes.map((shape) => (
            <MapLabel
              key={`label-${shape.stateId}`}
              x={shape.label.x}
              y={shape.label.y}
              text={shape.name}
              halo={baseMap !== 'plain'}
              fontSize={STATE_LABEL_SIZE / view.scale}
              maxWidth={shape.label.r * 1.9}
            />
          ))}

      </svg>

      {crumbs && crumbs.length > 0 && (
        <MapBreadcrumb crumbs={crumbs} className="absolute left-2 top-2 max-w-[min(60%,420px)]" />
      )}

      <MapToolbar
        onZoomIn={() => view.zoomBy(1.6)}
        onZoomOut={() => view.zoomBy(1 / 1.6)}
        onReset={view.reset}
        canReset={view.isZoomed}
        onFitSelection={selectedShape ? () => view.fitTo(selectedShape.bounds, 0.25) : undefined}
        fitLabel={selectedShape ? `Zoom to ${selectedShape.name}` : undefined}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={fullscreen.supported ? fullscreen.toggle : undefined}
        onExport={mapExport.exportPng}
        exporting={mapExport.busy}
        onSearch={onSearch}
        layers={['boundaries', 'labels', 'indicator']}
      />

      <MapScaleBar
        rect={view.rect}
        renderPx={renderPx}
        className="absolute bottom-8 left-3 z-[1]"
      />
      <PointerCoordinates
        lat={cursor?.lat ?? null}
        lon={cursor?.lon ?? null}
        className="absolute bottom-1.5 left-3 z-[1]"
      />
      {/* The bottom-right corner as one stack — legend, then attribution.
          See `MapCorner`. */}
      <MapCorner>
        {overlay}
        <MapAttribution baseMap={baseMap} />
      </MapCorner>

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
                  {BAND_LABEL[hoverDatum.band]} ·{' '}
                  {/* The caller names its own unit: this layer carries
                      facilities on one page and LGAs on another, and a tooltip
                      that says "facilities" on a page with no facilities on it
                      is worse than one that says nothing. */}
                  {hoverDatum.valueLabel ?? `${formatCount(hoverDatum.n)} facilities`}
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
