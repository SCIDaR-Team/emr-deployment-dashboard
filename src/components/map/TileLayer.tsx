import { useCallback, useId, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  baseMapSource,
  useBaseMapStore,
  useBaseMapUnreachable,
  useTileHealthStore,
  type BaseMapId,
} from '@/store/basemapStore';
import { tilesForRect, fallbackTilesForRect, parseViewBox, type ViewBoxRect } from './tiles';

/**
 * Raster base map drawn behind the boundaries.
 *
 * Renders nothing at all for `plain` — the polygons then sit on the flat wash
 * the maps have always used.
 *
 * ## The base map is no longer cut to the subject
 *
 * `focusPath` is the outline of whatever this map is
 * *about* — Nigeria at the national level, the state's LGAs at the state level,
 * the single LGA below that. Tiles used to be **clipped** to that outline, and
 * the reasoning was sound as far as it went: a square photograph behind a
 * non-square subject fills the card corner to corner with Niger, Chad and open
 * ocean at full strength, and the eye reads two unrelated maps stacked on each
 * other.
 *
 * But the fix was to delete the surroundings, and the surroundings are half of
 * what a map is for. Zoomed onto a clinic three hundred metres from the edge of
 * its LGA, a clipped base map showed the road up to the boundary and then blank
 * card — the road it is actually on, the settlement it actually serves and the
 * next LGA it actually borders all erased by an administrative line that has
 * nothing to do with any of them. "Continue zooming without losing geographic
 * context" is not satisfiable by a layer that removes the context.
 *
 * So the imagery now covers the whole frame, and the mask is used the other way
 * round: everything *outside* the subject is knocked back towards the page
 * colour rather than removed. The subject still reads as the subject — that was
 * the real requirement — and the ground around it is still ground.
 */
export function TileLayer({
  baseMap,
  viewBox,
  renderPx,
  renderPxH,
  zoomCap,
  focusPath,
  scrim = 0.15,
  surroundScrim = 0.55,
}: {
  baseMap: BaseMapId;
  /** The SVG's own viewBox string, so this layer and the polygons can never
   *  disagree about what is on screen. */
  viewBox: string;
  renderPx: number;
  /**
   * How tall the map is drawn, in CSS pixels.
   *
   * Needed because `preserveAspectRatio` **letterboxes**: an SVG whose box has
   * a different aspect from its viewBox fits the viewBox inside the box and
   * leaves user space visible on the two long sides. Tiles cut to the viewBox
   * alone therefore stopped short of the frame — which, while they were clipped
   * to the subject, nobody could see. Uncipped, it showed as a rectangle of
   * imagery floating in blank card, which reads as a rendering fault.
   *
   * Optional so a caller that has not measured its height still gets the old,
   * viewBox-sized coverage rather than nothing.
   */
  renderPxH?: number;
  /**
   * The deepest tile level to request, when the provider does not have imagery
   * as close as the view is — see `useImageryDepth`. Omit for no cap.
   *
   * A cap makes the base map *enlarged* rather than absent: the sharpest tiles
   * that exist are drawn at the size the view calls for. That is the honest
   * rendering of "the photography goes no closer here", and it is a great deal
   * better than the grey placeholder grid Esri hands back for a level it does
   * not hold.
   */
  zoomCap?: number;
  /**
   * The subject's outline, as path data — every rendered shape's `d`
   * concatenated. SVG's non-zero fill rule unions them, so 37 states or 44 LGAs
   * resolve to one silhouette without needing a real polygon union.
   *
   * Used to set the surroundings *back*, not to cut them away. Omit and the
   * base map is drawn evenly across the frame with nothing emphasised.
   */
  focusPath?: string;
  /**
   * How far the base map is knocked back towards the page colour, 0–1, *inside*
   * the subject.
   *
   * The default suits a layer that carries a choropleth on top, where the base
   * map is context and the bands are the message. The facility layer passes a
   * much smaller value: there the imagery *is* the message — where a clinic
   * physically sits — and nothing is competing with it for the same pixels.
   *
   * Halved from 0.3 when the band fills went to 0.8 (`fillOpacityFor`). The
   * two were doing the same job from opposite sides — the scrim lightening the
   * ground, the fill's own transparency letting that lightened ground back
   * through — and stacking both put the map a visible step away from the
   * colour the pane was showing for the same band. The fill now does the
   * knocking back; this only has to keep the tiles from competing outside it.
   */
  scrim?: number;
  /**
   * And how far it is knocked back *outside* it.
   *
   * Always the heavier of the two: this is what replaced clipping, and it has
   * to do the same job — make the subject legible as the subject — without
   * doing the thing clipping did, which was to make everything else disappear.
   */
  surroundScrim?: number;
}) {
  const source = baseMapSource(baseMap);
  const maskId = `tile-focus-${useId().replace(/:/g, '')}`;
  const reportTileError = useTileHealthStore((s) => s.reportTileError);
  const reportTileLoad = useTileHealthStore((s) => s.reportTileLoad);
  const onError = useCallback(() => reportTileError(baseMap), [reportTileError, baseMap]);
  const onLoad = useCallback(() => reportTileLoad(baseMap), [reportTileLoad, baseMap]);

  if (!source.tile) return null;

  // The user-space rectangle actually on screen, letterboxing included — see
  // `renderPxH`. Everything below is drawn against this rather than against the
  // viewBox, so the base map reaches the edge of the frame in both axes.
  const rect = visibleRect(parseViewBox(viewBox), renderPx, renderPxH);
  const tiles = tilesForRect(rect, source, renderPx, { zoomCap });
  // Coarser imagery underneath, for the depths where the provider has none —
  // see `FALLBACK_MAX_ZOOM`. Skipped when it would be the same request twice.
  const fallback = fallbackTilesForRect(rect, source, renderPx);
  const sameLevel = fallback.length > 0 && tiles.length > 0 && fallback[0]!.size === tiles[0]!.size;

  return (
    <g aria-hidden>
      {/* The mask, defined here rather than by the caller so that it can be
          given the rectangle it is actually painted over.

          **Its region is set explicitly, and that is the whole point.** A
          `<mask>` with no `x`/`y`/`width`/`height` does not default to "all of
          it": the SVG default is `-10% -10% 120% 120%`, and under
          `maskUnits="userSpaceOnUse"` those percentages resolve against the
          *viewport size* measured from user-space origin — not against the
          viewBox's offset, and not against the masked element. On a map whose
          viewBox sits at x≈158 that put the mask region's right edge partway
          across the frame: the scrim was applied to the left of it and silently
          dropped to the right, which rendered as a hard-edged rectangle of
          darkness in one corner and no explanation anywhere on screen.

          Matching the region to the painted rect makes the mask mean what it
          reads as. */}
      {focusPath && surroundScrim > 0 && (
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
          >
            <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="#fff" />
            <path d={focusPath} fill="#000" />
          </mask>
        </defs>
      )}
      <g
        // Both sources are drawn at full saturation for their own sake; under a
        // three-colour readiness scale they compete with it. Pulling saturation
        // and contrast down keeps the base map doing its job — orientation —
        // without arguing with the band colours. OSM additionally needs
        // darkening in the dark scheme, where its white page glares.
        className={
          baseMap === 'osm'
            ? 'dark:[filter:brightness(0.62)_saturate(0.7)]'
            : 'dark:[filter:brightness(0.9)]'
        }
      >
        <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} className="fill-muted" />
        {!sameLevel &&
          fallback.map((t) => (
            <image
              key={`fb-${t.key}`}
              href={t.href}
              x={t.x}
              y={t.y}
              width={t.size * 1.004}
              height={t.size * 1.004}
              preserveAspectRatio="none"
              // Only this layer reports health. The sharp one 404s routinely
              // wherever the provider's coverage stops, and counting those as
              // network failures would put "tiles are not loading" on the
              // screen every time a reader zoomed onto a rural clinic — see
              // `useTileHealthStore`. A tile at this level exists everywhere,
              // so a failure here really is the network.
              onError={onError}
              onLoad={onLoad}
            />
          ))}
        {tiles.map((t) => (
          <image
            key={t.key}
            href={t.href}
            x={t.x}
            y={t.y}
            // Overdraw a hair: adjacent <image> edges land on fractional device
            // pixels and would otherwise show as a grid of hairline seams. The
            // bleed is a fraction of a tile, so the resulting displacement is
            // sub-pixel at any zoom.
            width={t.size * 1.004}
            height={t.size * 1.004}
            preserveAspectRatio="none"
            {...(sameLevel ? { onError, onLoad } : {})}
          />
        ))}
      </g>
      {/* One flat knock-back over the tiles rather than a per-source colour
          filter: it works the same on a photo and on a drawn street map, and
          it moves the base map towards the page's own colour in both schemes
          instead of just making it grey. */}
      {scrim > 0 && (
        <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} className="fill-surface" opacity={scrim} />
      )}

      {/* And a heavier one everywhere outside the subject, masked to its
          silhouette. This is the whole of what clipping used to do, minus the
          part where the surroundings stopped existing. */}
      {focusPath && surroundScrim > 0 && (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          className="fill-surface"
          opacity={surroundScrim}
          mask={`url(#${maskId})`}
        />
      )}
    </g>
  );
}

/**
 * Grow a viewBox rectangle to the region the SVG actually shows.
 *
 * `preserveAspectRatio="xMidYMid meet"` — the default, and what every layer
 * here relies on for its geometry — scales the viewBox to fit inside the
 * element's box and centres it, so whichever axis has slack shows user space
 * beyond the viewBox on both sides. This returns that larger rectangle.
 */
function visibleRect(rect: ViewBoxRect, renderPx: number, renderPxH?: number): ViewBoxRect {
  if (!renderPxH || renderPxH <= 0 || renderPx <= 0 || rect.w <= 0 || rect.h <= 0) return rect;
  const boxAspect = renderPx / renderPxH;
  const viewAspect = rect.w / rect.h;
  if (Math.abs(boxAspect - viewAspect) < 1e-6) return rect;
  if (boxAspect > viewAspect) {
    const w = rect.h * boxAspect;
    return { x: rect.x - (w - rect.w) / 2, y: rect.y, w, h: rect.h };
  }
  const h = rect.w / boxAspect;
  return { x: rect.x, y: rect.y - (h - rect.h) / 2, w: rect.w, h };
}

/**
 * "This base map is not loading."
 *
 * The counterpart to defaulting to tiles rather than away from them: if the
 * network genuinely cannot reach the provider, the reader is told in one line
 * and handed the base map that needs no network, instead of being left to
 * interpret a blank frame. Renders nothing at all in the normal case, which is
 * every case where the tiles arrive.
 *
 * Deliberately not automatic. Silently switching the base map under a reader
 * who chose Satellite would look like the control was ignoring them, and a
 * patchy connection would flip it back and forth; the offer is one click and
 * the choice stays theirs.
 */
export function BaseMapNotice({ baseMap }: { baseMap: BaseMapId }) {
  const unreachable = useBaseMapUnreachable(baseMap);
  const setBaseMap = useBaseMapStore((s) => s.setBaseMap);
  const source = baseMapSource(baseMap);
  if (!unreachable || !source.tile) return null;

  return (
    <div className="flex items-start gap-1.5 rounded border border-border bg-surface/95 px-2 py-1.5 text-[11px] leading-tight text-muted-foreground shadow-card backdrop-blur">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-moderate-ink" aria-hidden />
      <span>
        {source.label} tiles are not loading on this network.{' '}
        <button
          type="button"
          onClick={() => setBaseMap('plain')}
          className="pointer-events-auto font-medium text-brand-600 underline underline-offset-2"
        >
          Use the plain base map
        </button>
      </span>
    </div>
  );
}

/**
 * Attribution for the active base map. Required by both providers' terms, so
 * it renders whenever tiles do — not behind a hover or an info popover.
 *
 * It does not place itself. It used to pin its own bottom-right corner, which
 * is the same corner every map layer's legend claims, and the two landed on
 * top of each other the moment tiles were switched on — the requirement is
 * that this be *legible*, and half of it under a legend card is not. The map
 * owns that corner as a single column now; see `MapCorner`.
 */
export function MapAttribution({ baseMap }: { baseMap: BaseMapId }) {
  const source = baseMapSource(baseMap);
  if (!source.tile) return null;
  return (
    <span className="rounded bg-surface/85 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground">
      {source.tile.attribution}
    </span>
  );
}

/**
 * The map's bottom-right corner, as one stack.
 *
 * Everything that wants this corner goes through here, so nothing can overlap
 * anything else in it: whatever legend the page hands down, then the tile
 * attribution beneath it. Attribution last because it is the smaller claim and
 * the one that has to survive being read at 10px — put it above the legend and
 * it reads as part of the key.
 *
 * With no tiles the attribution renders nothing and the legend sits exactly
 * where it always did.
 */
export function MapCorner({ children }: { children: ReactNode }) {
  return (
    // Ten rem short of the full width, not `calc(100% - 1.5rem)`: the opposite
    // corner is now a permanent status strip — scale bar, zoom level, pointer
    // coordinates — and a legend allowed the whole width lay straight over it
    // on any frame narrower than about 700px. Legends here wrap, so the cost of
    // reserving that column is a second row rather than a truncation.
    <div className="pointer-events-none absolute bottom-3 right-3 z-[1] flex max-w-[calc(100%-10rem)] flex-col items-end gap-1.5">
      {children}
    </div>
  );
}
