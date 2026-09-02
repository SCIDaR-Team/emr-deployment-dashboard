import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { formatCount } from '@/lib/format';
import { BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import {
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
  MAP_ASPECT_CLASS,
  type GeoCollection,
} from '@/lib/mapProjection';
import {
  BOUNDARY_STROKE,
  UNIT_FOCUS_CLASS,
  fillOpacityFor,
  bandFlatFill,
  scoreStepFill,
  type GeoDatum,
} from './mapTypes';
import { MapLabel } from './MapLabel';
import {
  TileLayer,
  MapAttribution,
  MapCorner,
  BaseMapNotice,
} from './TileLayer';
import { MapNotice } from './MapNotice';
import { useImageryDepth } from './imageryCoverage';
import { StateContextLayer } from './ContextBoundaries';
import { MapToolbar } from './MapToolbar';
import type { MapSearchResult } from './MapSearch';
import { MapBreadcrumb, type Crumb } from './MapBreadcrumb';
import { MapStatusBar } from './MapCoordinates';
import { useRenderSize } from '@/hooks/useRenderSize';
import { useMapViewport, unitAtPoint } from '@/hooks/useMapViewport';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useGeolocate, geolocateMessage } from '@/hooks/useGeolocate';
import { useMapExport } from '@/hooks/useMapExport';
import { useBaseMapStore } from '@/store/basemapStore';
import { useMapLayers } from '@/store/mapLayerStore';
import type { MapFit } from './mapTypes';
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
  /** See the note on MapFit. */
  fit?: MapFit;
  stateId: string;
  stateName: string;
  /** Keyed by bare LGA slug (`dala`, `orumba_south`, ...). */
  data: Record<string, GeoDatum>;
  selectedLgaId?: string | null;
  onSelect?: (lgaId: string) => void;
  /** Zooming back out past the whole state returns to the national map. */
  onZoomOut?: () => void;
  /** The geographic hierarchy above this view — see `MapBreadcrumb`. */
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

/** A state's LGAs are already small on screen; past this the facility layer is
 *  the one with anything left to add. */
/**
 * Where the state layer hands over to the LGA below it.
 *
 * Unchanged as a *handover* point — four times the state's own extent is about
 * where one LGA fills the frame and its own layer becomes the better thing to
 * be looking at. What changed is that it is no longer also the camera's limit;
 * see `STATE_MIN_VIEW_M`.
 */
const STATE_DRILL_SCALE = 4;

/**
 * And the narrowest frame the camera will show, in metres of ground.
 *
 * Half a kilometre is a street grid with named roads on OSM and individual
 * compounds on imagery. Most readers never get here — the drill fires at 4x and
 * takes them to the LGA layer — but the ones who do are the ones panning across
 * a border into an LGA they have not selected, and stopping them at 4x there
 * would be the map refusing to show ground it is already displaying.
 */
const STATE_MIN_VIEW_M = 500;

/**
 * How large an LGA name is drawn, in CSS pixels — see where it is converted.
 *
 * `LGA_LABEL_MIN_PX` is where shrinking stops rather than a size anything is
 * routinely drawn at: below roughly this, a haloed name on a saturated fill is
 * not a word any more. A name that will not fit at the floor is dropped by
 * MapLabel instead of being drawn smaller.
 */
const LGA_LABEL_PX = 10;
const LGA_LABEL_MIN_PX = 6.5;

interface HoverInfo {
  lgaId: string;
  x: number;
  y: number;
}

/**
 * LGA choropleth within one state.
 *
 * Reuses the same projection as `NigeriaChoropleth`, but fits its viewBox to
 * the state's own bounds, so drilling in is a viewBox change and never a
 * reprojection — the two layers agree on where a coordinate lands.
 *
 * All 37 states have LGA polygons: the boundary set is COD-AB ADM2, all 774 of
 * them, split one file per state. The empty state below is a real failure
 * (a missing or malformed file), not the routine case it used to be.
 */
export function StateLGAMap({
  stateId,
  stateName,
  data,
  selectedLgaId,
  onSelect,
  onZoomOut,
  crumbs,
  overlay,
  exportScope,
  onSearch,
  fit = 'aspect',
  className,
}: StateLGAMapProps) {
  // One file per state — see scripts/build-boundaries.mjs. Switching states
  // switches the request, so drilling into Kano fetches ~50 kB rather than the
  // 927 kB every state's polygons would come to.
  const geo = useFetchJSON<GeoCollection<LgaFeatureProps> | null>({
    path: DATA_PATHS.lgaGeo(stateId),
    fallback: null,
  });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  /** Live position under the pointer, for the coordinate readout. */
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const layers = useMapLayers();
  const fullscreen = useFullscreen<HTMLDivElement>();
  const [frameRef, renderPx, renderPxH] = useRenderSize<HTMLDivElement>();
  const mapExport = useMapExport(fullscreen.ref, {
    name: ['lgas', stateId, exportScope],
    scope: crumbs?.map((c) => c.label).join(' / ') ?? stateName,
    encoding: exportScope,
    baseMap,
  });

  const shapes = useMemo(() => {
    if (!geo.data) return [];
    return geo.data.features.map((f) => ({
      lgaId: f.properties.lgaId,
      name: f.properties.name,
      path: geomToPath(f.geometry, LGA_EPS),
      label: geomLabelPoint(f.geometry),
      bounds: geomBounds(f.geometry),
    }));
  }, [geo.data]);

  const baseViewBox = useMemo(
    () => (shapes.length ? fitViewBox(unionBounds(shapes.map((s) => s.bounds))) : '0 0 1000 813'),
    [shapes],
  );

  /** The camera's own limit, from a ground distance rather than a ratio — a
   *  state's extent varies fivefold, so a fixed multiple would mean five
   *  different depths. See `STATE_MIN_VIEW_M`. */
  const maxScale = useMemo(() => {
    const [, y = 0, w = 1000, h = 813] = baseViewBox.split(' ').map(Number);
    const minW = unitsForMetres(STATE_MIN_VIEW_M, latAtY(y + h / 2));
    return minW > 0 ? Math.max(STATE_DRILL_SCALE, w / minW) : STATE_DRILL_SCALE;
  }, [baseViewBox]);

  const view = useMapViewport({
    base: baseViewBox,
    maxScale,
    drillScale: STATE_DRILL_SCALE,
    layerKey: 'state',
    // The extent is the union of this state's LGAs, which is not known until
    // the boundary file lands — see the note on `ready`.
    ready: shapes.length > 0,
    onDrillIn: useCallback(
      (point: { x: number; y: number }, svg: SVGSVGElement | null) => {
        const lgaId = unitAtPoint(svg, point);
        // Not the one already selected. On the coverage page an LGA selection
        // keeps this same layer mounted at the same extent, so re-firing on it
        // would re-select — and where selection toggles, drop the reader back
        // out of the LGA they were zooming into.
        if (lgaId && lgaId !== selectedLgaId) onSelect?.(lgaId);
      },
      [onSelect, selectedLgaId],
    ),
    onDrillOut: onZoomOut,
  });

  /**
   * How close the imagery actually goes here — see `useImageryDepth`. Caps what
   * the base map is asked for, so a view deeper than the provider's coverage
   * shows enlarged photography of the right place rather than Esri's grey
   * "Map data not yet available" grid.
   */
  const imagery = useImageryDepth(baseMap, view.rect, renderPx);

  const [myLocation, setMyLocation] = useState<{ x: number; y: number } | null>(null);
  // Uncomposed on purpose — see the same note in `NigeriaChoropleth`.
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
        message="The boundary file for this state is missing or empty. Re-run `npm run geo:build`."
      />
    );
  }

  const [, , vbW = 1000, vbH = 813] = baseViewBox.split(' ').map(Number);
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
  // One *rendered* size for every LGA name, in every state.
  //
  // The size has to be handed over in viewBox units, but the quantity worth
  // holding constant is pixels on screen, and the two are not proportional: a
  // state's viewBox is its own extent, so Anambra's is a fifth of Niger's at
  // the same card width. Clamping in viewBox units — which `max(3, vbW / 70)`
  // did — therefore inflates every small state, and measured on one 628px card
  // it ran Niger's labels at 9px and Anambra's at 27px.
  //
  // Both axes, because `preserveAspectRatio` letterboxes: a tall narrow state
  // in a wide frame is drawn at the height ratio and a wide one at the width
  // ratio, so taking the width alone would leave the size state-dependent all
  // over again, just less so. `unitPerPx` is the inverse of whichever ratio
  // won, which is what the SVG is actually scaled by.
  // ...and multiplied by the live zoom for the same reason the hairline is
  // divided by it.
  const unitPerPx = Math.max(vbW / renderPx, vbH / renderPxH);
  const labelSize = (LGA_LABEL_PX * unitPerPx) / view.scale;
  const labelFloor = (LGA_LABEL_MIN_PX * unitPerPx) / view.scale;
  const fillOpacity = fillOpacityFor(baseMap);
  /** A constant on-screen size for the location dot, in viewBox units. */
  const locatePx = (view.rect.w / Math.max(1, renderPx)) * 6;
  /**
   * Neighbouring states are named only once the reader has zoomed in.
   *
   * At full extent the state fills the frame and its neighbours are slivers
   * along the edge, where a name has nowhere to sit and would land half off the
   * map. Zoomed in, those slivers are the ground the reader has panned into and
   * the name is the whole point of drawing them.
   */
  const showContextLabels = view.scale > 1.4;
  const hoverDatum = hover ? data[hover.lgaId] : null;
  const hoverShape = hover ? shapes.find((s) => s.lgaId === hover.lgaId) : null;

  const selectedShape = selectedLgaId ? shapes.find((sh) => sh.lgaId === selectedLgaId) : null;

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
        aria-label={`${stateName} LGA readiness map`}
        {...view.bind}
        onPointerMove={(e) => {
          view.bind.onPointerMove(e);
          const pt = view.toViewport(e.clientX, e.clientY);
          setCursor({ lat: latAtY(pt.y), lon: lonAtX(pt.x) });
        }}
        onPointerLeave={() => setCursor(null)}
      >
        {baseMap === 'plain' ? (
          <path d={outlinePath} className="fill-brand-50" />
        ) : (
          <TileLayer
            baseMap={baseMap}
            viewBox={view.viewBox}
            renderPx={renderPx}
            renderPxH={renderPxH}
            zoomCap={imagery.zoomCap}
            focusPath={outlinePath}
            // Lighter than the national layer's: the neighbouring *states* are
            // somewhere a reader can actually go from here — one drill-out and
            // a click — and at this extent their roads and towns are the
            // context that makes the subject state a place rather than a
            // silhouette.
            surroundScrim={0.45}
          />
        )}

        {/* The states around this one, behind everything and inert. A map of
            Kano that does not show Jigawa is a diagram of Kano — see
            `StateContextLayer`. Drawn under the plain wash too, so the flat
            base map gains the same orientation the tiled ones have. */}
        {layers.boundaries && (
          <StateContextLayer
            exceptId={stateId}
            strokeWidth={hairline * 1.5}
            showLabels={layers.labels && showContextLabels}
            labelSize={labelSize * 1.3}
          />
        )}

        <g style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.14))' }}>
          {shapes.map((shape) => {
            const datum = data[shape.lgaId];
            const isSelected = selectedLgaId === shape.lgaId;
            const isFocused = focused === shape.lgaId;
            const interactive = !!onSelect;
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
            const bandFill = layers.indicator
              ? (scoreStepFill(datum?.step) ?? bandFlatFill(datum?.band))
              : undefined;

            return (
              <path
                key={shape.lgaId}
                d={shape.path}
                data-unit-id={shape.lgaId}
                fill={bandFill}
                fillOpacity={layers.indicator ? fillOpacity : 0}
                className={cn(
                  layers.indicator && !bandFill ? 'fill-nodata' : undefined,
                  UNIT_FOCUS_CLASS,
                  'transition-opacity duration-150',
                )}
                stroke={
                  outlined
                    ? 'hsl(var(--brand-500))'
                    : layers.boundaries
                      ? BOUNDARY_STROKE
                      : 'transparent'
                }
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
            shared border. Long names wrap and shrink to stay inside, and the
            handful that cannot are dropped rather than spilled. */}
        {layers.labels && shapes.map((shape) => (
          <MapLabel
            key={`label-${shape.lgaId}`}
            x={shape.label.x}
            y={shape.label.y}
            text={shape.name}
            // `shrink` with a halo — see the note on MapLabel for why this
            // layer is labelled differently from the national one.
            mode="shrink"
            halo
            fontWeight={600}
            fontSize={labelSize}
            maxWidth={shape.label.r * 1.9}
            minFontSize={labelFloor}
          />
        ))}

        {myLocation && (
          <g pointerEvents="none">
            <circle cx={myLocation.x} cy={myLocation.y} r={locatePx * 2} className="fill-brand-500/20" />
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
      {/* The bottom-right corner as one stack — legend, then attribution.
          See `MapCorner`. */}
      <MapCorner>
        {overlay}
        <MapNotice text={geolocateMessage(geolocate.status)} onDismiss={geolocate.clear} />
        <MapNotice text={imagery.notice} />
        <BaseMapNotice baseMap={baseMap} />
        <MapAttribution baseMap={baseMap} />
      </MapCorner>

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
