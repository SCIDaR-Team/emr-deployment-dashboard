import { baseMapSource, type BaseMapId } from '@/store/basemapStore';
import { tilesForRect, parseViewBox, type ViewBoxRect } from './tiles';

/**
 * Raster base map drawn behind the boundaries.
 *
 * Renders nothing at all for `plain` — the polygons then sit on the flat wash
 * the maps have always used, which stays the default.
 *
 * `clipId` is the id of a `<clipPath>` holding the outline of whatever this
 * map is *about* — Nigeria at the national level, the state's LGAs at the
 * state level, the single LGA below that. Tiles are square and the subject
 * never is, so without it the card fills corner to corner with Niger, Chad,
 * Cameroon and open ocean at full strength, and the eye reads two unrelated
 * maps stacked on each other rather than one map with a base under it.
 */
export function TileLayer({
  baseMap,
  viewBox,
  renderPx,
  clipId,
  scrim = 0.3,
}: {
  baseMap: BaseMapId;
  /** The SVG's own viewBox string, so this layer and the polygons can never
   *  disagree about what is on screen. */
  viewBox: string;
  renderPx: number;
  clipId?: string;
  /**
   * How far the base map is knocked back towards the page colour, 0–1.
   *
   * The default suits a layer that carries a choropleth on top, where the base
   * map is context and the bands are the message. The facility layer passes a
   * much smaller value: there the imagery *is* the message — where a clinic
   * physically sits — and nothing is competing with it for the same pixels.
   */
  scrim?: number;
}) {
  const source = baseMapSource(baseMap);
  if (!source.tile) return null;

  const rect: ViewBoxRect = parseViewBox(viewBox);
  const tiles = tilesForRect(rect, source, renderPx);

  return (
    <g aria-hidden clipPath={clipId ? `url(#${clipId})` : undefined}>
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
    </g>
  );
}

/**
 * The `<clipPath>` that confines the base map to the subject of the map.
 *
 * `d` is every rendered shape's path data concatenated — SVG's default
 * non-zero fill rule unions them, so 37 states or 44 LGAs clip as one outline
 * without needing a real polygon union.
 */
export function MapClip({ id, d }: { id: string; d: string }) {
  return (
    <defs>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
    </defs>
  );
}

/** Attribution for the active base map. Required by both providers' terms, so
 *  it renders whenever tiles do — not behind a hover or an info popover. */
export function MapAttribution({ baseMap }: { baseMap: BaseMapId }) {
  const source = baseMapSource(baseMap);
  if (!source.tile) return null;
  return (
    <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-surface/85 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground">
      {source.tile.attribution}
    </span>
  );
}
