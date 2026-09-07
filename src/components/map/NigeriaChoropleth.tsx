import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { slugify, formatCount } from '@/lib/format';
import { BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { MapHatchDefs } from './MapHatch';
import { MapLabel } from './MapLabel';
import {
  TileLayer,
  MapAttribution,
  MapCorner,
  BaseMapNotice,
} from './TileLayer';
import { MapNotice } from './MapNotice';
import { useImageryDepth } from './imageryCoverage';
import { useRenderSize } from '@/hooks/useRenderSize';
import {
  hatchFill,
  useHatchPatternId,
  bandFlatFill,
  scoreStepFill,
  adminStrokeFor,
  CHOROPLETH_STROKE,
  UNIT_FOCUS_CLASS,
  fillOpacityFor,
  type GeoDatum,
} from './mapTypes';
import { useBaseMapStore } from '@/store/basemapStore';
import { useIsDark } from '@/store/themeStore';
import { useMapLayers } from '@/store/mapLayerStore';
import type { MapFit } from './mapTypes';
import { MapToolbar } from './MapToolbar';
import type { MapSearchResult } from './MapSearch';
import { MapBreadcrumb, type Crumb } from './MapBreadcrumb';
import { MapStatusBar } from './MapCoordinates';
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
  gx,
  gy,
  unionBounds,
  fitViewBox,
  latAtY,
  lonAtX,
  unitsForMetres,
  type GeoCollection,
} from '@/lib/mapProjection';
import { useGeolocate, geolocateMessage } from '@/hooks/useGeolocate';
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

/**
 * How far the national map can zoom before the state's own LGA layer is the
 * better thing to be looking at.
 *
 * A *handover* point, not a wall. Push past it over a surveyed state and the
 * map drills into it; push past it over one this page has nothing to say about
 * and the camera simply keeps going, which is what `NATIONAL_MAX_SCALE` below
 * is now for.
 */
const NATIONAL_DRILL_SCALE = 5;

/**
 * And how far the camera itself goes.
 *
 * Expressed as the narrowest frame the layer will show rather than as a
 * multiple, so it means the same thing regardless of how the country happens to
 * be framed: two kilometres across is a town's street grid on OSM and its roofs
 * on imagery. Nothing forces a reader to zoom the *national* layer that far —
 * the drill takes them to the state's own layer long before — but the twenty-
 * five unsurveyed states have no layer below this one, and the old 5x limit
 * meant the map simply refused to show them at any useful scale.
 */
const NATIONAL_MIN_VIEW_M = 2_000;

/**
 * What a hovered polygon's fill rises to.
 *
 * Well above the resting 0.38/0.48 — a hover has to be unmistakable at a
 * glance, and the polygon is momentarily the subject rather than one of
 * thirty-seven. Deliberately short of 1: even hovered, the town under the
 * pointer should still be readable, which is half of why the reader is
 * hovering it.
 */
const HOVER_FILL_OPACITY = 0.7;

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
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const isDark = useIsDark();
  const layers = useMapLayers();
  const fullscreen = useFullscreen<HTMLDivElement>();
  const [frameRef, renderPx, renderPxH] = useRenderSize<HTMLDivElement>();
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

  /**
   * The camera's limit, derived from the frame rather than fixed.
   *
   * `unitsForMetres` at the middle of the country: Mercator's scale factor
   * varies across Nigeria's latitude span, so a metre is a slightly different
   * number of viewBox units in Sokoto than on the coast, and taking the middle
   * keeps the limit honest to within a percent either way.
   */
  const maxScale = useMemo(() => {
    const [, y = 0, w = SVG_W, h = SVG_H] = baseViewBox.split(' ').map(Number);
    const minW = unitsForMetres(NATIONAL_MIN_VIEW_M, latAtY(y + h / 2));
    return minW > 0 ? Math.max(NATIONAL_DRILL_SCALE, w / minW) : NATIONAL_DRILL_SCALE;
  }, [baseViewBox]);

  const view = useMapViewport({
    base: baseViewBox,
    maxScale,
    drillScale: NATIONAL_DRILL_SCALE,
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

  /**
   * The reader's own position, as a place on this map.
   *
   * Recentres without changing zoom — see `centreOn`. A fix outside Nigeria is
   * still honoured: the clamp keeps the camera near the country, so someone
   * viewing from abroad gets the nearest edge rather than a silent no-op, and
   * the marker tells them where the fix actually landed.
   */
  /**
   * How close the imagery actually goes here — see `useImageryDepth`. Caps what
   * the base map is asked for, so a view deeper than the provider's coverage
   * shows enlarged photography of the right place rather than Esri's grey
   * "Map data not yet available" grid.
   */
  const imagery = useImageryDepth(baseMap, view.rect, renderPx);

  const [myLocation, setMyLocation] = useState<{ x: number; y: number } | null>(null);
  // Passed uncomposed rather than through `useCallback`: `useGeolocate` keeps
  // the latest handler in a ref, and memoising this one would freeze it around
  // the `view` from the first render — whose camera is still framed on the
  // placeholder extent, since the boundaries have not landed yet.
  const geolocate = useGeolocate((lat, lon) => {
    const point = { x: gx(lon), y: gy(lat) };
    setMyLocation(point);
    view.centreOn(point);
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
  // Per *polygon* rather than per layer: this component paints the sequential
  // need ramp on Assessed States and the categorical readiness bands on
  // National Coverage, and the two want different opacities — see
  // `fillOpacityFor`. Which one a shape is carrying is decided by whether the
  // caller supplied a `step`.
  /** Boundary ink for the unfilled case — see `adminStrokeFor`. */
  const adminStroke = adminStrokeFor(baseMap, isDark);
  const bandOpacity = fillOpacityFor(baseMap, { isDark });
  const rampOpacity = fillOpacityFor(baseMap, { isDark, sequential: true });
  /** How wide "my location" is drawn, in viewBox units — a constant size on
   *  screen, like every other marker on these maps. */
  const locatePx = (view.rect.w / Math.max(1, renderPx)) * 6;

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
        {/* Plain: a wash behind the landmass so states read as sitting on a
            map rather than floating on the card's own background. Otherwise
            the reader's chosen base map, drawn across the whole frame with the
            country picked out of it — see TileLayer for why this stopped being
            a clip. */}
        {baseMap === 'plain' ? (
          <path d={outlinePath} className="fill-brand-50" />
        ) : (
          // The live viewBox, not the base one: tiles then re-cut themselves at
          // the zoom the reader is actually at, so imagery sharpens on the way
          // in instead of upscaling.
          <TileLayer
            baseMap={baseMap}
            viewBox={view.viewBox}
            renderPx={renderPx}
            renderPxH={renderPxH}
            zoomCap={imagery.zoomCap}
            // Still handed the outline, though nothing is masked with it any
            // more: it is what the tile layer would need if a scrim were ever
            // reinstated, and passing it costs nothing. Neighbouring countries
            // now read as edge because they carry no fill, not because they
            // have been faded out.
            focusPath={outlinePath}
          />
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
            // Hover lifts the fill rather than only opening a tooltip — the
            // polygon under the pointer is the one being asked about, and it
            // should look like it. Same move on the LGA layer.
            const isHovered = hover?.stateId === shape.stateId;
            const restOpacity = datum?.step != null ? rampOpacity : bandOpacity;
            const paintedFill = !layers.indicator
              ? 0
              : isHovered
                ? Math.max(HOVER_FILL_OPACITY, restOpacity)
                : restOpacity;

            return (
              <path
                key={shape.stateId}
                d={shape.path}
                data-unit-id={shape.stateId}
                fill={bandFill}
                fillOpacity={paintedFill}
                className={cn(fillClass, UNIT_FOCUS_CLASS, 'transition-opacity duration-150')}
                stroke={
                  outlined || isHovered
                    ? 'hsl(var(--brand-500))'
                    : !layers.boundaries
                      ? 'transparent'
                      : // A white hairline between two filled polygons, dark
                        // ink where there is no fill — see `ADMIN_STROKE`.
                        bandFill
                        ? CHOROPLETH_STROKE
                        : adminStroke
                }
                // Divided by the zoom: stroke width is in viewBox units, so
                // without this every boundary thickens as the reader zooms in,
                // and the map ends up more line than fill.
                strokeWidth={
                  (outlined || isHovered ? 2.2 : bandFill ? 1 : 1.8) / view.scale
                }
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

        {/* The reader's own position, in the convention every map uses for it —
            a filled dot inside a ring. Drawn last so nothing paints over it,
            and sized in pixels so it stays a dot at every zoom. */}
        {myLocation && (
          <g pointerEvents="none">
            <circle
              cx={myLocation.x}
              cy={myLocation.y}
              r={locatePx * 2}
              className="fill-brand-500/20"
            />
            <circle
              cx={myLocation.x}
              cy={myLocation.y}
              r={locatePx}
              className="fill-brand-600 stroke-white"
              strokeWidth={locatePx / 3}
            />
          </g>
        )}
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
        onLocate={geolocate.supported ? geolocate.locate : undefined}
        locating={geolocate.status === 'locating'}
        layers={['boundaries', 'labels', 'indicator']}
      />

      <MapStatusBar
        rect={view.rect}
        renderPx={renderPx}
        cursor={cursor}
        className="absolute bottom-2 left-3 z-[1]"
      />
      {/* The bottom-right corner as one stack — legend, attribution, and
          whatever the base map has to say for itself. See `MapCorner`. */}
      <MapCorner>
        {overlay}
        <MapNotice text={geolocateMessage(geolocate.status)} onDismiss={geolocate.clear} />
        <MapNotice text={imagery.notice} />
        <BaseMapNotice baseMap={baseMap} />
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
