import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import {
  latAtY,
  lonAtX,
  geomToPath,
  geomBounds,
  boundsOfPoints,
  fitViewBox,
  MAP_ASPECT_CLASS,
  SVG_W,
  SVG_H,
  type Box,
  type GeoCollection,
} from '@/lib/mapProjection';
import { BOUNDARY_STROKE, useHatchPatternId } from './mapTypes';
import { TileLayer, MapAttribution, MapClip } from './TileLayer';
import { MapToolbar } from './MapToolbar';
import type { MapSearchResult } from './MapSearch';
import { MapScaleBar } from './MapScaleBar';
import { MapBreadcrumb, type Crumb } from './MapBreadcrumb';
import { PointerCoordinates, FacilityCoordinates } from './MapCoordinates';
import { FacilityLayer, FacilityTooltip, type FacilityHover } from './FacilityLayer';
import { projectFacilities, type FacilityPoint } from './facilityPoints';
import { useRenderSize } from '@/hooks/useRenderSize';
import { useMapViewport } from '@/hooks/useMapViewport';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useMapExport } from '@/hooks/useMapExport';
import { useBaseMapStore } from '@/store/basemapStore';
import { useMapLayers } from '@/store/mapLayerStore';
import type { MapFit } from './mapTypes';
import { LoadError, Skeleton } from '@/components/ui';

/**
 * Facility markers carry their band as a *shape* — circle, square, triangle —
 * not as the texture the polygon layers use. A dot is a handful of pixels
 * across at base zoom, and a stripe inside one is neither visible nor
 * countable, whereas the silhouette reads at any size. `BAND_MARKER` in
 * `lib/bands.ts` is the source of truth. The markers
 * themselves live in `FacilityLayer`, which all three levels now share.
 */
interface LgaFeatureProps {
  id: string;
  lgaId: string;
  stateId: string;
  name: string;
}

/** Defined with the layer that draws it, and re-exported here because this is
 *  where callers have always imported it from. */
export type { FacilityPoint };

interface LGAFacilityMapProps {
  /** See the note on MapFit. */
  fit?: MapFit;
  stateId: string;
  lgaId: string;
  lgaName: string;
  facilities: FacilityPoint[];
  selectedFacilityId?: string | null;
  onSelect?: (uuid: string) => void;
  /** Zooming back out past the whole LGA returns to the state's LGA map. */
  onZoomOut?: () => void;
  /** The geographic hierarchy above this view — see `MapBreadcrumb`. */
  crumbs?: Crumb[];
  /**
   * Page-supplied furniture drawn inside the map frame — the legend, normally.
   *
   * Inside rather than beside, because the frame is what goes full screen: a
   * legend rendered as the map's sibling is on a part of the document the
   * reader can no longer see the moment they give the map the display.
   */
  overlay?: ReactNode;
  /** What the marks encode, named — stamped under an exported image, where the
   *  legend is pixels and the reader cannot hover anything to find out. */
  exportScope?: string;
  /** Resolve a name to a place the map can go to — see `MapSearch`. */
  onSearch?: (query: string) => MapSearchResult[];
  className?: string;
}

/** The deepest layer, and the one where zoom buys the most — at 12x an urban
 *  LGA's facilities separate into individual compounds on the imagery. */
const FACILITY_MAX_SCALE = 12;

/**
 * How far in before facilities are named on the map itself.
 *
 * Labels were deliberately absent from this layer, and the reasoning was sound
 * at the extent it was reasoning about: at base zoom facilities cluster within
 * a few viewBox units of each other, so a permanent name on every dot overlaps
 * into an unreadable mat. But that is an argument about *density*, and density
 * is exactly what zoom resolves — by the time the reader is this far in they
 * are looking at a handful of separated points with room between them, and
 * withholding the names there is withholding them for a reason that has
 * stopped applying. Below this they stay off, for the original reason.
 */
const FACILITY_LABEL_SCALE = 4.5;

/**
 * Facility-level point map within one LGA — the deepest of the three spatial
 * layers, and the only one whose features are points rather than polygons.
 *
 * Positions come straight from each facility's surveyed GPS coordinate through
 * the same shared projection as the other two layers, so a facility sits where
 * it sits: at 12x on satellite imagery a marker lands on the compound, and the
 * coordinate readout under the pointer agrees with the one on the facility's
 * own card.
 */
export function LGAFacilityMap({
  stateId,
  lgaId,
  lgaName,
  facilities,
  selectedFacilityId,
  onSelect,
  onZoomOut,
  crumbs,
  overlay,
  exportScope,
  onSearch,
  fit = 'aspect',
  className,
}: LGAFacilityMapProps) {
  // The state's own boundary file — see the note on DATA_PATHS.lgaGeo. The one
  // LGA this layer outlines is picked out of it below.
  const geo = useFetchJSON<GeoCollection<LgaFeatureProps> | null>({
    path: DATA_PATHS.lgaGeo(stateId),
    fallback: null,
  });
  const [hover, setHover] = useState<FacilityHover | null>(null);
  /** Live position under the pointer, for the coordinate readout. Null
   *  whenever the pointer is off the map — see `PointerCoordinates`. */
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const layers = useMapLayers();
  const [frameRef, renderPx, renderPxH] = useRenderSize<HTMLDivElement>();
  const fullscreen = useFullscreen<HTMLDivElement>();
  const mapExport = useMapExport(fullscreen.ref, {
    name: ['facilities', stateId, lgaId],
    scope: crumbs?.map((c) => c.label).join(' / ') ?? lgaName,
    encoding: exportScope ?? 'Facility readiness',
    baseMap,
  });
  const clipId = `${useHatchPatternId()}-clip`;

  const outline = useMemo(() => {
    if (!geo.data) return null;
    const feature = geo.data.features.find((f) => f.properties.lgaId === lgaId);
    return feature ? { path: geomToPath(feature.geometry), bounds: geomBounds(feature.geometry) } : null;
  }, [geo.data, lgaId]);

  const points = useMemo(() => projectFacilities(facilities), [facilities]);

  const baseViewBox = useMemo(() => {
    const fallback: Box = { x0: 0, y0: 0, x1: SVG_W, y1: SVG_H };
    return fitViewBox(outline?.bounds ?? boundsOfPoints(points, 0.4) ?? fallback);
  }, [outline, points]);

  const view = useMapViewport({
    base: baseViewBox,
    maxScale: FACILITY_MAX_SCALE,
    layerKey: 'lga',
    // The extent is this LGA's outline, which is not known until the state's
    // boundary file lands — see the note on `ready`.
    ready: !!geo.data,
    onDrillOut: onZoomOut,
  });

  /**
   * viewBox units per CSS pixel at the live zoom. Drives the marker size and
   * the cluster cell, so both are constant on screen.
   *
   * **Both axes**, because `preserveAspectRatio` letterboxes: the SVG is fitted
   * to whichever axis runs out first, so a map given more width than its
   * viewBox's aspect wants is scaled by its *height* and the width ratio
   * overstates how large a unit is drawn. Taking the width alone made every
   * facility marker come out around 30% smaller than the pixel size it asked
   * for — measured at 7px across where 11px was specified — and shrank the
   * cluster cell with it, so points that overlapped on screen were not being
   * grouped. Same correction `StateLGAMap` already makes for its label sizing.
   */
  const unitsPerPx = Math.max(
    view.rect.w / Math.max(1, renderPx),
    view.rect.h / Math.max(1, renderPxH),
  );

  const selected = selectedFacilityId
    ? (points.find((p) => p.uuid === selectedFacilityId) ?? null)
    : null;

  /**
   * Frame one facility.
   *
   * `boundsOfPoints` opens a single point out to a non-degenerate box, and
   * `fitTo` then clamps it to this layer's `maxScale` — so a facility is always
   * framed at the deepest zoom the layer offers, which is where the imagery
   * resolves the compound it sits on.
   */
  const frameFacility = (f: { x: number; y: number }) => {
    const box = boundsOfPoints([f]);
    if (box) view.fitTo(box, 0.2);
  };

  /**
   * Selecting a facility is a **drill**, not a highlight.
   *
   * The other two levels already work this way: clicking a state flies the
   * camera into that state, clicking an LGA flies into that LGA. A facility is
   * the fourth level of the same hierarchy, so clicking one has to do the same
   * thing — otherwise the last step of the drill-down is the only one where the
   * map does not move, and the reader is left to find the highlighted dot among
   * the others by eye.
   *
   * Deselecting flies back out to the whole LGA, which is the level above, so
   * the gesture is reversible on the same terms.
   *
   * Keyed on the id rather than the object: `selected` is re-derived on every
   * render, and an effect watching it would re-fly the camera on every
   * unrelated state change — a hover, a pan, a layer toggle.
   */
  const selectedKey = selected?.uuid ?? null;
  const previousKey = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = previousKey.current;
    previousKey.current = selectedKey;
    if (previous === selectedKey) return;
    if (selectedKey && selected) {
      frameFacility(selected);
    } else if (previous !== undefined && previous !== null) {
      // Came back up from a facility to the LGA. `undefined` is the first
      // render, where the base extent is already the destination and the
      // viewport hook's own flight owns the camera.
      view.reset();
    }
    // `view` and `selected` are rebuilt every render; the id is what actually
    // changes, and re-running on anything else would re-fly the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  if (geo.isLoading && !geo.data) {
    return <Skeleton className={cn(MAP_ASPECT_CLASS, 'w-full', className)} />;
  }
  // A failed boundary fetch leaves `isLoading` false and `data` null, which
  // without this branch renders an outline-less map with no explanation.
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

  const vbWidth = Number(baseViewBox.split(' ')[2] ?? 100);
  const showLabels = layers.labels && view.scale >= FACILITY_LABEL_SCALE;

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
        // Full screen hands the element the whole display, which is a different
        // box from the one the layout gave it — it has to fill that instead.
        fullscreen.isFullscreen && 'h-full w-full bg-page',
        className,
      )}
    >
      <svg
        ref={view.svgRef}
        viewBox={view.viewBox}
        className={cn('w-full select-none', fit === 'fill' || fullscreen.isFullscreen ? 'h-full' : 'h-auto')}
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
        onPointerMove={(e) => {
          view.bind.onPointerMove(e);
          const p = view.toViewport(e.clientX, e.clientY);
          setCursor({ lat: latAtY(p.y), lon: lonAtX(p.x) });
        }}
        onPointerLeave={() => setCursor(null)}
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

        {outline && layers.boundaries && (
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

        {layers.facilities && (
          <FacilityLayer
            points={points}
            unitsPerPx={unitsPerPx}
            cluster={layers.cluster}
            selectedId={selectedFacilityId}
            onSelect={onSelect}
            onExpand={(box) => view.fitTo(box, 0.35)}
            showLabels={showLabels}
            onHover={setHover}
          />
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
        onFitSelection={selected ? () => frameFacility(selected) : undefined}
        fitLabel={selected ? `Zoom to ${selected.name}` : undefined}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={fullscreen.supported ? fullscreen.toggle : undefined}
        onExport={mapExport.exportPng}
        exporting={mapExport.busy}
        onSearch={onSearch}
        layers={['boundaries', 'labels', 'facilities', 'cluster']}
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
      <MapAttribution baseMap={baseMap} />

      {overlay}

      {/* The selected facility's own card — name, geography and the surveyed
          coordinate, with the two things anyone does with a coordinate. Stays
          up while the facility is selected rather than following the pointer,
          which is what makes the copy button reachable at all.

          Directly beneath the breadcrumb rather than opposite it: the card
          describes the feature the last crumb names, so the two read as one
          block. It was on the right, which collided with the breadcrumb the
          moment a facility was selected — that is exactly when the breadcrumb
          is at its longest, since selecting the facility is what adds the
          fourth crumb. */}
      {selected && (
        <div className="absolute left-2 top-11 z-10 w-[250px] rounded-lg border border-border bg-surface/95 p-2.5 shadow-pop backdrop-blur">
          <p className="text-[13px] font-semibold leading-snug text-foreground">{selected.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {[selected.lga, selected.state].filter(Boolean).join(', ') || lgaName}
          </p>
          {(selected.band || selected.status) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {[selected.band ? BAND_LABEL[selected.band] : null, selected.status]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="mt-2 border-t border-border pt-1.5">
            <FacilityCoordinates lat={selected.lat} lon={selected.lon} />
          </div>
        </div>
      )}

      <FacilityTooltip hover={hover} selectedId={selectedFacilityId} selectable={!!onSelect} />

      {points.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          No GPS-mapped facilities for this selection
        </p>
      )}
    </div>
  );
}
