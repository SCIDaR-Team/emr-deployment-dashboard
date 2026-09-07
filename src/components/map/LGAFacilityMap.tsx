import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import {
  latAtY,
  lonAtX,
  gx,
  gy,
  geomToPath,
  geomBounds,
  geomLabelPoint,
  boundsOfPoints,
  boxAround,
  fitViewBox,
  unitsForMetres,
  MAP_ASPECT_CLASS,
  SVG_W,
  SVG_H,
  type Box,
  type GeoCollection,
} from '@/lib/mapProjection';
import { adminStrokeFor } from './mapTypes';
import { MapPinOff } from 'lucide-react';
import { TileLayer, MapAttribution, MapCorner, BaseMapNotice } from './TileLayer';
import { MapNotice } from './MapNotice';
import { useImageryDepth } from './imageryCoverage';
import { MapLabel } from './MapLabel';
import { MapToolbar } from './MapToolbar';
import type { MapSearchResult } from './MapSearch';
import { MapBreadcrumb, type Crumb } from './MapBreadcrumb';
import { MapStatusBar, FacilityCoordinates } from './MapCoordinates';
import { FacilityLayer, FacilityTooltip, type FacilityHover } from './FacilityLayer';
import { projectFacilities, type FacilityPoint } from './facilityPoints';
import { useRenderSize } from '@/hooks/useRenderSize';
import { useMapViewport } from '@/hooks/useMapViewport';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useGeolocate, geolocateMessage } from '@/hooks/useGeolocate';
import { useMapExport } from '@/hooks/useMapExport';
import { useBaseMapStore } from '@/store/basemapStore';
import { useIsDark } from '@/store/themeStore';
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

/**
 * How narrow a frame this layer will show, in metres of ground.
 *
 * This is the number the whole drill-down is built to reach. 70 m across the
 * frame is one compound and its immediate neighbours — a roof, a perimeter
 * wall, the track leading to the gate — which is what it takes to say *that*
 * building is the clinic rather than merely *there* is the clinic.
 *
 * ## Why it stops there and not deeper
 *
 * Past a provider's own deepest level, zoom stops buying detail and starts
 * buying magnification: OpenStreetMap is cut to z19 and Esri to z19 at best
 * (z18 over most of rural Nigeria — see `imageryCoverage.ts`), so a frame
 * narrower than this is the same pixels, larger. 70 m lands around z21 on a
 * wide screen, roughly two levels of enlargement, which is where a building
 * outline is comfortably clickable and still recognisably itself. Going
 * further would let the reader zoom until the imagery was unreadable and read
 * that as the map failing.
 *
 * Stated as a distance rather than as the 12x multiple it replaces, because 12x
 * meant twelve different things. Dala is 8 km across and Toro is 90: the same
 * ratio landed one reader on a compound and the other on a district, and the
 * layer's stated purpose — see the note on the component — was only ever true
 * for the small ones. The multiple is now derived per LGA from its own extent,
 * so every LGA reaches the same ground.
 */
const FACILITY_MIN_VIEW_M = 70;

/**
 * And how wide a frame selecting a facility opens onto.
 *
 * Not the limit above: arriving pinned to the tightest zoom the layer has shows
 * the reader a roof with no way to tell which roof, and every check they might
 * want to make — is it on the road, is it the building the coordinate claims —
 * needs the surroundings in frame. 400 m puts the compound in the middle of its
 * own neighbourhood and leaves three more zoom steps in hand.
 */
const FACILITY_SELECT_VIEW_M = 400;

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
  const isDark = useIsDark();
  const layers = useMapLayers();
  const [frameRef, renderPx, renderPxH] = useRenderSize<HTMLDivElement>();
  const fullscreen = useFullscreen<HTMLDivElement>();
  const mapExport = useMapExport(fullscreen.ref, {
    name: ['facilities', stateId, lgaId],
    scope: crumbs?.map((c) => c.label).join(' / ') ?? lgaName,
    encoding: exportScope ?? 'Facility readiness',
    baseMap,
  });
  const [myLocation, setMyLocation] = useState<{ x: number; y: number } | null>(null);

  const outline = useMemo(() => {
    if (!geo.data) return null;
    const feature = geo.data.features.find((f) => f.properties.lgaId === lgaId);
    return feature ? { path: geomToPath(feature.geometry), bounds: geomBounds(feature.geometry) } : null;
  }, [geo.data, lgaId]);

  /**
   * The LGAs around this one.
   *
   * The state's boundary file is already in hand — this layer fetches it to
   * find one outline in it — so the other forty-three cost nothing but the
   * paths. Drawing them is not decoration: an LGA rendered alone is a shape
   * floating on a card, and a reader zoomed onto a facility three hundred
   * metres from the boundary could not see that the town it serves continues
   * into Fagge. "See surrounding LGAs for geographic context" is the
   * requirement, and this is it.
   *
   * Inert and unlabelled at base zoom, named once the reader has zoomed in far
   * enough for the names to have somewhere to sit.
   */
  const neighbours = useMemo(() => {
    if (!geo.data) return [];
    return geo.data.features
      .filter((f) => f.properties.lgaId !== lgaId)
      .map((f) => ({
        lgaId: f.properties.lgaId,
        name: f.properties.name,
        path: geomToPath(f.geometry, 0.004),
        label: geomLabelPoint(f.geometry),
      }));
  }, [geo.data, lgaId]);

  const points = useMemo(() => projectFacilities(facilities), [facilities]);

  const baseViewBox = useMemo(() => {
    const fallback: Box = { x0: 0, y0: 0, x1: SVG_W, y1: SVG_H };
    return fitViewBox(outline?.bounds ?? boundsOfPoints(points, 0.4) ?? fallback);
  }, [outline, points]);

  /**
   * The camera's limit for *this* LGA, derived from its own extent so that
   * every LGA bottoms out at the same ground distance. See
   * `FACILITY_MIN_VIEW_M`.
   */
  const { maxScale, selectViewUnits } = useMemo(() => {
    const [, y = 0, w = SVG_W, h = SVG_H] = baseViewBox.split(' ').map(Number);
    const centreLat = latAtY(y + h / 2);
    const minW = unitsForMetres(FACILITY_MIN_VIEW_M, centreLat);
    return {
      // The floor of 4 is for the pathological case of a `baseViewBox` narrower
      // than the limit itself — an LGA smaller than 500 m across, which does
      // not exist, but a zoom range that inverts would be worse than a shallow
      // one.
      maxScale: minW > 0 ? Math.max(4, w / minW) : 12,
      selectViewUnits: unitsForMetres(FACILITY_SELECT_VIEW_M, centreLat),
    };
  }, [baseViewBox]);

  const view = useMapViewport({
    base: baseViewBox,
    maxScale,
    // No drill below this: the facility *is* the bottom of the hierarchy, and
    // it is reached by selecting one rather than by zooming through it. Zooming
    // out past the LGA still hands back to the state, as before.
    layerKey: 'lga',
    // A generous roam, because this is the layer where leaving the subject is
    // the point: a facility near a boundary has half its catchment in the next
    // LGA, and at 70 m across the frame the reader is panning street by
    // street.
    panMargin: 0.6,
    // The extent is this LGA's outline, which is not known until the state's
    // boundary file lands — see the note on `ready`.
    ready: !!geo.data,
    onDrillOut: onZoomOut,
  });

  /**
   * How close the imagery actually goes here — see `useImageryDepth`. Caps what
   * the base map is asked for, so a view deeper than the provider's coverage
   * shows enlarged photography of the right place rather than Esri's grey
   * "Map data not yet available" grid.
   */
  const imagery = useImageryDepth(baseMap, view.rect, renderPx);

  // Uncomposed on purpose — see the same note in `NigeriaChoropleth`.
  const geolocate = useGeolocate((lat, lon) => {
    const point = { x: gx(lon), y: gy(lat) };
    setMyLocation(point);
    view.centreOn(point);
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
   * The selected facility as the survey recorded it, coordinate or not.
   *
   * `points` has already dropped everything without a fix, so a facility with
   * no coordinate selected from the pane simply vanished from the map — no
   * marker, no card, no explanation, indistinguishable from a bug. Two of the
   * 2,806 are in that position, and they are exactly the ones a reader most
   * needs told about: the requirement is to *say* a location is unavailable
   * rather than to invent one, and saying nothing is not saying it.
   */
  const selectedRecord = selectedFacilityId
    ? (facilities.find((f) => f.uuid === selectedFacilityId) ?? null)
    : null;
  const selectedUnplaced = !!selectedRecord && !selected;

  /** How many in scope the map cannot plot. Reported once, quietly, rather
   *  than per facility — see the notice below. */
  const unplacedCount = facilities.length - points.length;

  /**
   * Frame one facility.
   *
   * Opens onto its neighbourhood rather than onto the tightest zoom the layer
   * has — see `FACILITY_SELECT_VIEW_M` — and leaves the rest of the range in
   * the reader's hands.
   */
  const frameFacility = (f: { x: number; y: number }) => {
    // A box of a stated width, not `boundsOfPoints` — that opens a single point
    // out to half a viewBox unit, which is about 650 m and an accident rather
    // than a decision. See `FACILITY_SELECT_VIEW_M`.
    view.fitTo(boxAround(f, selectViewUnits || 1), 0.05);
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
  /**
   * Nothing is framed until the LGA's own extent is known.
   *
   * `useMapViewport` re-frames on the extent arriving — that is what `ready` is
   * for — and it would land *after* a fly issued from here and overwrite it. A
   * cold link straight to a facility hit exactly that: the card and the
   * highlighted marker appeared, the camera flew to the compound, and the
   * boundary file landing a moment later pulled it back out to the whole LGA.
   * Both effects run in the same commit and the hook's is registered first, so
   * gating on the same condition is enough to put this one last.
   */
  const extentReady = !!geo.data;
  useEffect(() => {
    if (!extentReady) return;
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
    // `view` and `selected` are rebuilt every render; the id and the readiness
    // flag are what actually change, and re-running on anything else would
    // re-fly the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, extentReady]);

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

  const showLabels = layers.labels && view.scale >= FACILITY_LABEL_SCALE;
  /** Neighbouring LGAs are named as soon as the reader has left base zoom —
   *  which is the moment they can be panned into and the moment a name on one
   *  stops being a name on a sliver at the frame's edge. */
  const showNeighbourLabels = layers.labels && view.scale >= 1.6;
  const locatePx = unitsPerPx * 6;
  /**
   * Boundary weights in **screen pixels**, via `unitsPerPx`.
   *
   * The old `min(0.6, max(0.15, vbWidth / 900))` was a viewBox-unit expression
   * with a floor, and for every LGA in the country the floor won — an LGA's
   * extent is one to two orders of magnitude smaller than the 900 that divisor
   * was scaled for. So the width was a constant 0.15 units, which is a
   * different number of pixels in every LGA: about 5px in Dala and under 1px in
   * Toro. Asking for the pixels directly says what was meant, and holds across
   * the zoom range the layer now covers.
   */
  const neighbourStroke = unitsPerPx * 1;

  /** Boundary ink for this layer — nothing here is filled, so both the subject
   *  outline and its neighbours read against the base map. See
   *  `adminStrokeFor`. */
  const adminStroke = adminStrokeFor(baseMap, isDark);
  /** The same ink, taken well back: neighbours are context, not the subject. */
  const neighbourInk = adminStroke.replace(/\/ 0\.\d+\)$/, '/ 0.32)');

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


        {baseMap !== 'plain' && (
          <TileLayer
            baseMap={baseMap}
            viewBox={view.viewBox}
            renderPx={renderPx}
            renderPxH={renderPxH}
            zoomCap={imagery.zoomCap}
            focusPath={outline?.path}
          />
        )}

        {/* The LGAs either side, drawn behind the subject and inert. See
            `neighbours`. */}
        {layers.boundaries && neighbours.length > 0 && (
          <g aria-hidden pointerEvents="none">
            {neighbours.map((n) => (
              <path
                key={n.lgaId}
                d={n.path}
                fill="none"
                stroke={neighbourInk}
                strokeWidth={neighbourStroke}
                strokeLinejoin="round"
              />
            ))}
          </g>
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
            // Dark ink, not surface colour. Nothing is filled at this level —
            // the wash is 0.06 over tiles — so the outline is drawn against
            // whatever the base map put there, and a near-white line vanishes
            // on Positron. See `ADMIN_STROKE`.
            stroke={adminStroke}
            // Twice the neighbours' width, and at 0.9 alpha against their 0.4.
            // With the base map now drawn across the whole frame and the
            // neighbouring LGAs outlined beside it, one boundary among many at
            // the same weight stops reading as the one the page is about.
            strokeWidth={neighbourStroke * 2}
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

        {/* Neighbour names go on top of the fills but under the markers — they
            are orientation, and a facility marker must never be hidden by
            one. */}
        {showNeighbourLabels &&
          neighbours.map((n) => (
            <MapLabel
              key={`nb-${n.lgaId}`}
              x={n.label.x}
              y={n.label.y}
              text={n.name}
              mode="shrink"
              halo
              fontWeight={500}
              fontSize={unitsPerPx * 11}
              maxWidth={n.label.r * 1.9}
              minFontSize={unitsPerPx * 8}
              className="fill-black/55"
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
        onFitSelection={selected ? () => frameFacility(selected) : undefined}
        fitLabel={selected ? `Zoom to ${selected.name}` : undefined}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={fullscreen.supported ? fullscreen.toggle : undefined}
        onExport={mapExport.exportPng}
        exporting={mapExport.busy}
        onSearch={onSearch}
        onLocate={geolocate.supported ? geolocate.locate : undefined}
        locating={geolocate.status === 'locating'}
        layers={['boundaries', 'labels', 'facilities', 'cluster']}
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

      {/* The same card for a facility the survey placed nowhere.
          
          It is the same shape and the same position as the card above on
          purpose: the reader has selected a facility and is owed an answer
          about it, and "we do not know where this one is" is an answer. What
          they must not get is the previous behaviour — the marker, the card and
          the camera move all silently not happening, which reads as the
          selection having failed rather than as the data being incomplete. The
          one thing the map will not do is put it somewhere plausible. */}
      {selectedUnplaced && selectedRecord && (
        <div className="absolute left-2 top-11 z-10 w-[250px] rounded-lg border border-border bg-surface/95 p-2.5 shadow-pop backdrop-blur">
          <p className="text-[13px] font-semibold leading-snug text-foreground">
            {selectedRecord.name}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {[selectedRecord.lga, selectedRecord.state].filter(Boolean).join(', ') || lgaName}
          </p>
          {(selectedRecord.band || selectedRecord.status) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {[selectedRecord.band ? BAND_LABEL[selectedRecord.band] : null, selectedRecord.status]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="mt-2 flex items-start gap-1.5 border-t border-border pt-1.5 text-[11px] leading-tight text-muted-foreground">
            <MapPinOff className="mt-px h-3.5 w-3.5 shrink-0 text-moderate-ink" aria-hidden />
            <span>
              Exact location unavailable — the survey recorded no GPS coordinate for this
              facility, so it is not plotted.
            </span>
          </div>
        </div>
      )}

      <FacilityTooltip hover={hover} selectedId={selectedFacilityId} selectable={!!onSelect} />

      {/* The empty state, and **`pointer-events-none` is load-bearing**.
          `inset-0` covers the entire map frame, and this renders after the
          breadcrumb and the toolbar, so without it this paragraph sits on top
          of both and silently eats every click on them — the map still pans and
          zooms, so nothing looks broken except that the controls stop
          responding.

          It went unnoticed for as long as it did because it never used to
          render: every facility in the synthetic dataset carried an invented
          coordinate, so `points` was never empty. The real survey recorded no
          coordinates, which turned a dormant branch into a permanent
          full-bleed overlay. Any future full-frame message here needs the same
          class. */}
      {points.length === 0 && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          No GPS-mapped facilities for this selection
        </p>
      )}

      {/* And when *some* are missing, which is the more common case: a count,
          once, low in the frame. A map that plots 9 of 10 facilities and says
          nothing about the tenth is quietly under-reporting the LGA — the
          reader counts dots and gets a different number from the pane beside
          them, with no way to tell which figure is wrong. */}
      {points.length > 0 && unplacedCount > 0 && !selectedUnplaced && (
        <p className="pointer-events-none absolute bottom-2 left-1/2 z-[1] -translate-x-1/2 rounded border border-border bg-surface/92 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {unplacedCount === 1
            ? '1 facility has no recorded coordinate and is not plotted'
            : `${unplacedCount} facilities have no recorded coordinate and are not plotted`}
        </p>
      )}
    </div>
  );
}
