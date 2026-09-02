import { useMemo } from 'react';
import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { slugify } from '@/lib/format';
import { geomToPath, geomLabelPoint, type GeoCollection } from '@/lib/mapProjection';
import { MapLabel } from './MapLabel';

/**
 * The ground around the subject.
 *
 * A map of one state used to be a map of one state and nothing else: Kano's
 * forty-four LGAs floating on the card's own background, with Jigawa, Katsina
 * and Bauchi simply not drawn. That is a diagram of an administrative unit, and
 * it fails the first thing anyone does with a map, which is to place the thing
 * they are looking at against the things beside it. It also made panning
 * pointless — there was nothing out there to pan to.
 *
 * So every layer below national now draws its neighbours: a thin muted outline,
 * behind everything, non-interactive, with a name where there is room. Context
 * is not the subject and must never compete with it — hence the weight, the
 * colour and the fact that nothing here responds to a pointer.
 *
 * ## Where the geometry comes from
 *
 * A separate, heavily simplified copy of the ADM1 layer — 65 kB against the
 * national map's 2.0 MB. See `scripts/build-state-context.mjs` for why the full
 * file would be the wrong thing to ship for a line drawn at one device pixel.
 */

interface ContextShape {
  id: string;
  name: string;
  path: string;
  label: { x: number; y: number; r: number };
}

/**
 * Neighbouring states, drawn behind whatever the layer is about.
 *
 * `exceptId` is the state the map is *of*, which is drawn by the layer itself
 * at full weight and must not be double-stroked here.
 */
export function StateContextLayer({
  exceptId,
  strokeWidth,
  showLabels,
  labelSize,
}: {
  exceptId?: string;
  /** In viewBox units, already divided by the live zoom by the caller — the
   *  same treatment every other stroke on these maps gets. */
  strokeWidth: number;
  showLabels?: boolean;
  labelSize?: number;
}) {
  const geo = useFetchJSON<GeoCollection | null>({
    path: DATA_PATHS.stateContextGeo,
    fallback: null,
  });

  const shapes = useMemo<ContextShape[]>(() => {
    if (!geo.data) return [];
    return geo.data.features.map((f) => {
      const name = String((f.properties as Record<string, unknown>).statename ?? '');
      return {
        id: slugify(name),
        name,
        // A coarse eps to match a coarse source: this geometry is already
        // simplified to about a kilometre, so asking for finer path output
        // would only emit commands the file cannot support.
        path: geomToPath(f.geometry, 0.05),
        label: geomLabelPoint(f.geometry),
      };
    });
  }, [geo.data]);

  if (shapes.length === 0) return null;

  return (
    <g aria-hidden pointerEvents="none">
      {shapes
        .filter((s) => s.id !== exceptId)
        .map((s) => (
          <path
            key={s.id}
            d={s.path}
            // Outline only. A fill here — even a 25% wash — sat on top of the
            // surround scrim and took the imagery the second knock-back had
            // already thinned down to nothing, which defeats the point of
            // drawing the neighbours at all. The line says where the border is;
            // the base map says what is on either side of it.
            fill="none"
            stroke="hsl(var(--map-boundary) / 0.4)"
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        ))}
      {showLabels &&
        labelSize != null &&
        shapes
          .filter((s) => s.id !== exceptId)
          .map((s) => (
            <MapLabel
              key={`ctx-${s.id}`}
              x={s.label.x}
              y={s.label.y}
              text={s.name}
              mode="shrink"
              halo
              fontWeight={500}
              fontSize={labelSize}
              maxWidth={s.label.r * 1.9}
              minFontSize={labelSize * 0.7}
              className="fill-black/55"
            />
          ))}
    </g>
  );
}
