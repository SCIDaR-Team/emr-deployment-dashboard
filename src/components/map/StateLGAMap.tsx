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
  adminStrokeFor,
  CHOROPLETH_STROKE,
  UNIT_FOCUS_CLASS,
  fillOpacityFor,
  bandFlatFill,
  scoreStepFill,
  type GeoDatum,
} from './mapTypes';
import { MapLabel } from './MapLabel';
import { FacilityLayer, FacilityTooltip, type FacilityHover } from './FacilityLayer';
import { projectFacilities, type FacilityPoint } from './facilityPoints';
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
import { useIsDark } from '@/store/themeStore';
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
  /**
   * The facilities inside this state, plotted over the LGAs.
   *
   * **Supplying this changes what the layer is.** Omitted, the LGAs are a
   * choropleth and `data` paints them — which is what National Coverage wants,
   * because an LGA there *is* the unit of analysis. Supplied, the polygons stop
   * carrying a value and go transparent, and the facilities become the marks:
   * the state view then shows the same points, in the same silhouettes, that
   * drilling into a single LGA shows, only across all of them at once.
   *
   * The two are exclusive on purpose. Points over a filled choropleth is two
   * readiness encodings in one frame — a pastel underneath a marker of a
   * different band — and the reader has no way to know which one the colour
   * under a triangle belongs to.
   */
  facilities?: FacilityPoint[];
  selectedFacilityId?: string | null;
  onSelectFacility?: (uuid: string) => void;
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

/**
 * How narrow the frame has to get before facility markers are named, in metres
 * of ground.
 *
 * A distance rather than a zoom ratio, because a ratio here would mean twelve
 * different thresholds: a state's extent varies fivefold, so 20x into Lagos and
 * 20x into Niger are not the same view. Ten kilometres is roughly the window
 * `LGAFacilityMap`'s own 4.5x threshold works out to, so a name appears at the
 * same ground scale on both layers.
 *
 * Most readers never see this. The drill hands them down to the LGA layer at
 * 4x, long before the frame is this tight — the way here is expanding a
 * cluster, which flies straight past the drill without triggering it.
 */
const FACILITY_LABEL_VIEW_M = 10_000;

/**
 * Marker radius here, in CSS pixels, against the LGA layer's 5.5.
 *
 * This layer draws a whole state at once — 438 facilities in Kano, 275 in
 * Anambra — where the LGA layer draws the few dozen inside one boundary. At the
 * LGA's size that many marks over a state-sized frame stop being points and
 * become a smear: the dots touch, the clusters swallow their neighbours, and
 * the thing the reader came for — where in this state the facilities actually
 * are — is the one thing the picture cannot show. Smaller marks separate, and
 * the cluster cell shrinks with them (see `cellForMarker`), so more of them
 * resolve individually rather than merging.
 *
 * Four is a floor, not a preference. It is the size the LGA layer was raised
 * *from*, because the band is carried by the marker's silhouette and a triangle
 * needs pixels to read as a triangle. That trade is acceptable at this level
 * and not at the one below: here the marks answer "where are they, and roughly
 * how do they band across the state", and a reader who needs to tell one
 * facility's shape from its neighbour's is one click from the layer that draws
 * it at full size. Do not take this below 4.
 */
const STATE_MARKER_R_PX = 4;

/** What a hovered polygon's fill rises to — see the twin of this constant in
 *  `NigeriaChoropleth`, which carries the reasoning. */
const HOVER_FILL_OPACITY = 0.7;

interface HoverInfo {
  lgaId: string;
  x: number;
  y: number;
}

/**
 * The middle layer: one state, its LGAs, and — where the caller asks for them —
 * the facilities inside them.
 *
 * Reuses the same projection as `NigeriaChoropleth`, but fits its viewBox to
 * the state's own bounds, so drilling in is a viewBox change and never a
 * reprojection — the two layers agree on where a coordinate lands.
 *
 * ## Two modes, and only ever one at a time
 *
 * **Choropleth.** No `facilities` prop: the LGAs fill from `data` and the layer
 * is what it has always been. National Coverage stays here, because there an
 * LGA is genuinely the unit being classified.
 *
 * **Facility.** Pass `facilities` and the polygons go transparent — they keep
 * their outlines, their names and their click target, but stop carrying a
 * value — and the points take over, drawn by the same `FacilityLayer`, in the
 * same band silhouettes and the same clusters, that `LGAFacilityMap` uses one
 * level down. So a reader looking at Kano sees every surveyed facility in Kano
 * at once, and drilling into Dala changes the extent rather than the encoding.
 *
 * They are exclusive because two readiness encodings in one frame cannot be
 * read: a pastel polygon under a marker of a different band gives the reader no
 * way to tell which of the two a colour belongs to. See the `facilities` prop.
 *
 * All 37 states have LGA polygons: the boundary set is COD-AB ADM2, all 774 of
 * them, split one file per state. The empty state below is a real failure
 * (a missing or malformed file), not the routine case it used to be.
 */
export function StateLGAMap({
  stateId,
  stateName,
  data,
  facilities,
  selectedFacilityId,
  onSelectFacility,
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
  /**
   * Facility mode: the caller handed us points, so the polygons give up the
   * fill and the points carry the reading. See the note on the prop.
   *
   * Keyed off the prop being *present* rather than non-empty — a state whose
   * filter row has excluded every facility must still show empty LGAs, not
   * silently fall back to a choropleth the legend beside it is not explaining.
   */
  const facilityMode = facilities !== undefined;
  const points = useMemo(() => projectFacilities(facilities ?? []), [facilities]);

  // One file per state — see scripts/build-boundaries.mjs. Switching states
  // switches the request, so drilling into Kano fetches ~50 kB rather than the
  // 927 kB every state's polygons would come to.
  const geo = useFetchJSON<GeoCollection<LgaFeatureProps> | null>({
    path: DATA_PATHS.lgaGeo(stateId),
    fallback: null,
  });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [facilityHover, setFacilityHover] = useState<FacilityHover | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  /** Live position under the pointer, for the coordinate readout. */
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const isDark = useIsDark();
  const layers = useMapLayers();
  const fullscreen = useFullscreen<HTMLDivElement>();
  const [frameRef, renderPx, renderPxH] = useRenderSize<HTMLDivElement>();
  const mapExport = useMapExport(fullscreen.ref, {
    name: [facilityMode ? 'facilities' : 'lgas', stateId, exportScope],
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
  // Two scales reach this layer too — the LGA need ramp on Assessed States and
  // the coverage bands on National Coverage. See `fillOpacityFor`.
  /** Boundary ink for the unfilled case — see `adminStrokeFor`. */
  const adminStroke = adminStrokeFor(baseMap, isDark);
  const bandOpacity = fillOpacityFor(baseMap, { isDark });
  const rampOpacity = fillOpacityFor(baseMap, { isDark, sequential: true });
  /**
   * viewBox units per CSS pixel at the live zoom — the facility layer sizes its
   * markers and its cluster cell from this, so both hold a constant size on
   * screen as the reader zooms.
   *
   * `unitPerPx` above is the *base* viewBox per pixel; the live frame is that
   * divided by the zoom, which is the same correction the label sizes make one
   * line up.
   */
  const facilityUnitsPerPx = unitPerPx / view.scale;
  /** Names on the marks, once there is ground for them — see the constant. */
  const showFacilityLabels =
    layers.labels &&
    view.rect.w <= unitsForMetres(FACILITY_LABEL_VIEW_M, latAtY(view.rect.y + view.rect.h / 2));
  /**
   * Whether the polygons paint a value.
   *
   * Off in facility mode, and that is the whole of the "uncolour the LGAs"
   * half of this layer: the shapes stay — they are the geography, and they are
   * still what a reader clicks to drill in — but they stop being a choropleth,
   * so the only colour left in the frame is the band on a facility marker.
   */
  const paintFill = layers.indicator && !facilityMode;
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
        aria-label={
          facilityMode
            ? `${stateName} facility readiness map`
            : `${stateName} LGA readiness map`
        }
        {...view.bind}
        onPointerMove={(e) => {
          view.bind.onPointerMove(e);
          const pt = view.toViewport(e.clientX, e.clientY);
          setCursor({ lat: latAtY(pt.y), lon: lonAtX(pt.x) });
        }}
        onPointerLeave={() => {
          setCursor(null);
          setFacilityHover(null);
        }}
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
            // With the thematic layer switched off — or in facility mode,
            // where the points carry the reading — the polygons stay, because
            // they are the geography and not the finding, but they stop
            // carrying a value and go transparent, so whatever base map is
            // underneath reads at full strength.
            const bandFill = paintFill
              ? (scoreStepFill(datum?.step) ?? bandFlatFill(datum?.band))
              : undefined;
            const isHovered = hover?.lgaId === shape.lgaId;
            const restOpacity = datum?.step != null ? rampOpacity : bandOpacity;

            return (
              <path
                key={shape.lgaId}
                d={shape.path}
                data-unit-id={shape.lgaId}
                fill={bandFill}
                // Zero rather than `fill="none"`: a transparent fill still
                // hit-tests, so an uncoloured LGA is as hoverable and as
                // clickable as a painted one.
                fillOpacity={
                  !paintFill
                    ? 0
                    : isHovered
                      ? Math.max(HOVER_FILL_OPACITY, restOpacity)
                      : restOpacity
                }
                className={cn(
                  paintFill && !bandFill ? 'fill-nodata' : undefined,
                  UNIT_FOCUS_CLASS,
                  'transition-opacity duration-150',
                )}
                stroke={
                  outlined || isHovered
                    ? 'hsl(var(--brand-500))'
                    : !layers.boundaries
                      ? 'transparent'
                      : // White cuts a gap between two fills; dark ink is what
                        // reads against a bare base map. See `ADMIN_STROKE`.
                        bandFill
                        ? CHOROPLETH_STROKE
                        : adminStroke
                }
                // Unfilled boundaries are drawn heavier, because then the line
                // is the only thing saying where the LGA is — and it has to be
                // the most legible administrative line on screen, or the
                // reader takes the base map's (different) one for ours.
                strokeWidth={
                  outlined || isHovered ? outlineWidth : bandFill ? hairline : hairline * 2.2
                }
                strokeLinejoin="round"
                tabIndex={interactive ? 0 : -1}
                role={interactive ? 'button' : undefined}
                aria-label={
                  facilityMode
                    ? `${shape.name}, ${formatCount(datum?.n ?? 0)} facilities`
                    : `${shape.name}${datum?.band ? `, ${BAND_LABEL[datum.band]}` : ', no data'}`
                }
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

        {/* Above the LGA names, not under them: a facility marker is the
            finding at this level and a place name is orientation, so the name
            is what gives way where the two collide. */}
        {facilityMode && layers.facilities && (
          <FacilityLayer
            points={points}
            unitsPerPx={facilityUnitsPerPx}
            cluster={layers.cluster}
            selectedId={selectedFacilityId}
            onSelect={onSelectFacility}
            onExpand={(box) => view.fitTo(box, 0.35)}
            markerPx={STATE_MARKER_R_PX}
            showLabels={showFacilityLabels}
            onHover={setFacilityHover}
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
        onFitSelection={selectedShape ? () => view.fitTo(selectedShape.bounds, 0.25) : undefined}
        fitLabel={selectedShape ? `Zoom to ${selectedShape.name}` : undefined}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={fullscreen.supported ? fullscreen.toggle : undefined}
        onExport={mapExport.exportPng}
        exporting={mapExport.busy}
        onSearch={onSearch}
        onLocate={geolocate.supported ? geolocate.locate : undefined}
        locating={geolocate.status === 'locating'}
        // Facility mode has no thematic fill for the indicator toggle to
        // switch, and gains the two point layers instead — the panel offers
        // what this level actually draws, never a toggle that does nothing.
        layers={
          facilityMode
            ? ['boundaries', 'labels', 'facilities', 'cluster']
            : ['boundaries', 'labels', 'indicator']
        }
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

      {/* One tooltip at a time. A marker sits inside an LGA, so hovering it
          leaves the polygon hovered too, and both cards would stack on the same
          few pixels — the mark is the more specific answer, so it wins. */}
      {hover && hoverShape && !facilityHover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-body shadow-pop"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          <div className="font-semibold text-foreground">{hoverShape.name}</div>
          {facilityMode ? (
            // No band to report: in facility mode the polygon carries no
            // reading, so the honest line is how many marks are inside it.
            <p className="mt-0.5 text-muted-foreground">
              {formatCount(hoverDatum?.n ?? 0)}{' '}
              {hoverDatum?.n === 1 ? 'facility' : 'facilities'}
            </p>
          ) : hoverDatum?.band ? (
            <p className="mt-0.5 text-muted-foreground">
              {BAND_LABEL[hoverDatum.band]} · {formatCount(hoverDatum.n)} facilities
            </p>
          ) : (
            <p className="mt-0.5 italic text-muted-foreground">No data for this selection</p>
          )}
          {onSelect && <p className="mt-1 text-note font-medium text-brand-600">Click to drill in</p>}
        </div>
      )}

      <FacilityTooltip
        hover={facilityHover}
        selectedId={selectedFacilityId}
        selectable={!!onSelectFacility}
      />
    </div>
  );
}
