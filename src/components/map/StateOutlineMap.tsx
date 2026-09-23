import { useMemo, useState, type ReactNode } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import {
  geomToPath,
  geomLabelPoint,
  geomBounds,
  gx,
  gy,
  fitViewBox,
  latAtY,
  lonAtX,
  unitsForMetres,
  MAP_ASPECT_CLASS,
  type GeoCollection,
} from '@/lib/mapProjection';
import {
  adminStrokeFor,
  CHOROPLETH_STROKE,
  UNIT_FOCUS_CLASS,
  fillOpacityFor,
  bandFlatFill,
  type GeoDatum,
  type MapFit,
} from './mapTypes';
import { MapLabel } from './MapLabel';
import { TileLayer, MapAttribution, MapCorner, BaseMapNotice } from './TileLayer';
import { MapNotice } from './MapNotice';
import { useImageryDepth } from './imageryCoverage';
import { StateContextLayer } from './ContextBoundaries';
import { MapToolbar } from './MapToolbar';
import type { MapSearchResult } from './MapSearch';
import { MapBreadcrumb, type Crumb } from './MapBreadcrumb';
import { MapStatusBar } from './MapCoordinates';
import { useRenderSize } from '@/hooks/useRenderSize';
import { useMapViewport } from '@/hooks/useMapViewport';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useGeolocate, geolocateMessage } from '@/hooks/useGeolocate';
import { useMapExport } from '@/hooks/useMapExport';
import { useBaseMapStore } from '@/store/basemapStore';
import { useIsDark } from '@/store/themeStore';
import { useMapLayers } from '@/store/mapLayerStore';
import { Skeleton, EmptyState, LoadError } from '@/components/ui';

/** ~220 m. One ring rather than forty-four, so this can afford to be finer
 *  than the LGA layer's 0.004 and still cost less to draw. */
const OUTLINE_EPS = 0.002;

/** As deep as the camera goes, as a ground distance — see the twin of this in
 *  `StateLGAMap`. Nothing is drawn below the state here, so this is a limit on
 *  looking around rather than a handover point. */
const STATE_MIN_VIEW_M = 500;

const NAME_PX = 13;
const NAME_MIN_PX = 9;

interface StateFeatureProps {
  stateId: string;
  name: string;
}

interface StateOutlineMapProps {
  /** See the note on MapFit. */
  fit?: MapFit;
  stateId: string;
  stateName: string;
  /** The one reading this map draws — the state's own band, and whatever the
   *  caller wants the shape to say for itself in `valueLabel`. */
  datum: GeoDatum;
  /** Zooming back out past the state returns to the national map. */
  onZoomOut?: () => void;
  crumbs?: Crumb[];
  /** Page-supplied furniture drawn inside the map frame so it survives full
   *  screen — the legend, normally. */
  overlay?: ReactNode;
  /** What the fill encodes, named — stamped under an exported image. */
  exportScope?: string;
  onSearch?: (query: string) => MapSearchResult[];
  className?: string;
}

/**
 * One state, drawn as one shape.
 *
 * The bottom of National Coverage, and deliberately the *only* thing below the
 * country there. This layer draws the state's ADM1 outline filled with the
 * state's own readiness band — no internal boundaries, no LGA names, nothing
 * to click into.
 *
 * ## Why it is not `StateLGAMap` with the LGAs turned off
 *
 * Because the geometry is different, not just the styling. Painting a state as
 * one colour out of its 44 LGA polygons leaves 44 shapes that each hit-test,
 * each stroke their shared borders, and each need a reason not to be labelled
 * — and the thing a reader would see is a state quilted out of same-coloured
 * patches, which is exactly the reading this level exists to stop making. A
 * silhouette has to be a silhouette in the data, so this layer fetches the
 * ADM1 ring for the state (`npm run geo:outlines`) and draws that.
 *
 * The rest of the frame is what every other layer here has: the base map under
 * it, the neighbouring states around it, the toolbar, the scale, the export.
 * Only the subject changed.
 *
 * ## What it does not have
 *
 * No drill-in, because there is no level below. No per-unit tooltip: with one
 * shape on screen a card that follows the pointer around says what the pane
 * beside it is already saying, permanently, in more detail. The shape carries
 * its reading in the fill and in its `aria-label`, and the pane carries the
 * figures.
 */
export function StateOutlineMap({
  stateId,
  stateName,
  datum,
  onZoomOut,
  crumbs,
  overlay,
  exportScope,
  onSearch,
  fit = 'aspect',
  className,
}: StateOutlineMapProps) {
  // One file per state, ~1–31 kB — the same split-by-what-is-asked-for the LGA
  // layer uses, and for the same reason: the full ADM1 layer is 2.0 MB.
  const geo = useFetchJSON<GeoCollection<StateFeatureProps> | null>({
    path: DATA_PATHS.stateGeo(stateId),
    fallback: null,
  });
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const isDark = useIsDark();
  const layers = useMapLayers();
  const fullscreen = useFullscreen<HTMLDivElement>();
  const [frameRef, renderPx, renderPxH] = useRenderSize<HTMLDivElement>();
  const mapExport = useMapExport(fullscreen.ref, {
    name: ['state', stateId, exportScope],
    scope: crumbs?.map((c) => c.label).join(' / ') ?? stateName,
    encoding: exportScope,
    baseMap,
  });

  const shape = useMemo(() => {
    const feature = geo.data?.features[0];
    if (!feature) return null;
    return {
      path: geomToPath(feature.geometry, OUTLINE_EPS),
      label: geomLabelPoint(feature.geometry),
      bounds: geomBounds(feature.geometry),
    };
  }, [geo.data]);

  const baseViewBox = useMemo(
    () => (shape ? fitViewBox(shape.bounds) : '0 0 1000 813'),
    [shape],
  );

  const maxScale = useMemo(() => {
    const [, y = 0, w = 1000, h = 813] = baseViewBox.split(' ').map(Number);
    const minW = unitsForMetres(STATE_MIN_VIEW_M, latAtY(y + h / 2));
    return minW > 0 ? Math.max(4, w / minW) : 4;
  }, [baseViewBox]);

  const view = useMapViewport({
    base: baseViewBox,
    maxScale,
    layerKey: 'state',
    ready: shape !== null,
    // Nothing to drill into — the only handover left is back up to the
    // country, which is what zooming out past the state's own extent means.
    onDrillOut: onZoomOut,
  });

  const imagery = useImageryDepth(baseMap, view.rect, renderPx);

  const [myLocation, setMyLocation] = useState<{ x: number; y: number } | null>(null);
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
        what="the state boundary"
        error={geo.error}
        onRetry={geo.refetch}
        className={className}
      />
    );
  }
  if (!shape) {
    return (
      <EmptyState
        title={`No boundary for ${stateName}`}
        message="The outline file for this state is missing or empty. Re-run `npm run geo:outlines`."
      />
    );
  }

  const [, , vbW = 1000, vbH = 813] = baseViewBox.split(' ').map(Number);
  // Derived from the viewBox and divided by the live zoom, so the line holds
  // one visual weight across states of wildly different extents and does not
  // fatten as the reader zooms — see the same derivation in `StateLGAMap`.
  const hairline = Math.min(0.6, Math.max(0.12, vbW / 900)) / view.scale;
  const unitPerPx = Math.max(vbW / renderPx, vbH / renderPxH);
  const nameSize = (NAME_PX * unitPerPx) / view.scale;
  const nameFloor = (NAME_MIN_PX * unitPerPx) / view.scale;
  const adminStroke = adminStrokeFor(baseMap, isDark);
  const bandFill = layers.indicator ? bandFlatFill(datum.band) : undefined;
  const fillOpacity = layers.indicator ? fillOpacityFor(baseMap, { isDark }) : 0;
  const locatePx = (view.rect.w / Math.max(1, renderPx)) * 6;
  /** Neighbours are named only once the reader has zoomed in — at full extent
   *  they are slivers along the edge with nowhere to put a name. */
  const showContextLabels = view.scale > 1.4;

  return (
    <div
      ref={(el) => {
        frameRef(el);
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
          touchAction: view.isZoomed ? 'none' : 'pan-y',
          cursor: view.panning ? 'grabbing' : view.isZoomed ? 'grab' : undefined,
        }}
        role="img"
        aria-label={`${stateName} readiness map`}
        {...view.bind}
        onPointerMove={(e) => {
          view.bind.onPointerMove(e);
          const pt = view.toViewport(e.clientX, e.clientY);
          setCursor({ lat: latAtY(pt.y), lon: lonAtX(pt.x) });
        }}
        onPointerLeave={() => setCursor(null)}
      >
        {baseMap === 'plain' ? (
          <path d={shape.path} className="fill-brand-50" />
        ) : (
          <TileLayer
            baseMap={baseMap}
            viewBox={view.viewBox}
            renderPx={renderPx}
            renderPxH={renderPxH}
            zoomCap={imagery.zoomCap}
            focusPath={shape.path}
          />
        )}

        {/* The states around this one, behind the subject and inert — a map of
            Kano that does not show Jigawa is a diagram of Kano. */}
        {layers.boundaries && (
          <StateContextLayer
            exceptId={stateId}
            strokeWidth={hairline * 1.5}
            showLabels={layers.labels && showContextLabels}
            labelSize={nameSize * 1.1}
          />
        )}

        <g style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.14))' }}>
          <path
            d={shape.path}
            data-unit-id={stateId}
            fill={bandFill}
            fillOpacity={fillOpacity}
            className={cn(
              layers.indicator && !bandFill ? 'fill-nodata' : undefined,
              UNIT_FOCUS_CLASS,
            )}
            stroke={
              !layers.boundaries ? 'transparent' : bandFill ? CHOROPLETH_STROKE : adminStroke
            }
            // Heavier than an LGA border, because this is the only
            // administrative line the layer draws and it has to win against
            // the base map's own version of the same border.
            strokeWidth={bandFill ? hairline * 2 : hairline * 2.6}
            strokeLinejoin="round"
            aria-label={`${stateName}, ${datum.bandLabel ?? (datum.band ? BAND_LABEL[datum.band] : 'no data')}`}
          />
        </g>

        {/* The subject's own name, which is the only name inside the frame now
            that the LGAs have gone. Same treatment the LGA layer gave theirs:
            anchored at the pole of inaccessibility, shrunk to whatever the
            shape can take, haloed so it survives a satellite base map. */}
        {layers.labels && (
          <MapLabel
            x={shape.label.x}
            y={shape.label.y}
            text={stateName}
            mode="shrink"
            halo
            fontWeight={600}
            fontSize={nameSize}
            maxWidth={shape.label.r * 1.9}
            minFontSize={nameFloor}
          />
        )}

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
      <MapCorner>
        {overlay}
        <MapNotice text={geolocateMessage(geolocate.status)} onDismiss={geolocate.clear} />
        <MapNotice text={imagery.notice} />
        <BaseMapNotice baseMap={baseMap} />
        <MapAttribution baseMap={baseMap} />
      </MapCorner>
    </div>
  );
}
