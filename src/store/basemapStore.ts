/**
 * Which raster base map sits under the choropleth.
 *
 * Shared by all three map layers: drilling National → State → LGA must not
 * silently drop the reader back to a different base map halfway down. Not part
 * of themeStore — this is a map setting, not a colour scheme, and it is
 * orthogonal to light/dark.
 *
 * ## Reachable, and therefore persisted again
 *
 * This used to be a setting nobody could set. The only caller of `setBaseMap`
 * was a `BaseMapControl` the sibling dashboard mounted on a report explorer
 * this one does not have, so `plain` was the only value a reader could arrive
 * at — and persisting it turned the store into a trap rather than a preference:
 * a `satellite` written by an earlier build came back on every visit, put
 * raster tiles under all three layers and dropped the band fills to 0.55
 * opacity, with no control anywhere to undo it.
 *
 * The picker is now part of the map's own layer panel, at the bottom of the
 * stack it belongs to — see `MapLayerPanel`. The three things that had to be
 * true before it could ship are:
 *
 *   - The **national** layer's labels needed a halo over imagery. Done, and
 *     conditioned on the base map so the plain view keeps the flat black that
 *     reads better over the band fills — see `NigeriaChoropleth`.
 *   - The band fills drop to 0.55 opacity over tiles (`fillOpacityFor`), and
 *     the three have to stay tellable apart against whatever is underneath.
 *     They used to carry a texture as well as a colour, which made that easy;
 *     the textures were dropped at the client's direction (see `bandFlatFill`),
 *     so this now rests on the three hues alone and is worth re-checking
 *     against imagery if the palette ever moves.
 *   - Tiles are fetched at runtime from `tile.openstreetmap.org` and
 *     `arcgisonline.com`. Whether a dashboard on a ministry network may reach
 *     either host is a **deployment** question, not a UI one — which is why
 *     `plain` remains the default: a reader who never opens the layer panel
 *     never makes a single third-party request.
 *
 * Persisted under a fresh key. An `emr-basemap` written before all this may
 * still be sitting in a reader's browser holding a value they never chose, and
 * inheriting it would resurrect exactly the trap described above.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BaseMapId = 'plain' | 'osm' | 'satellite';

export interface BaseMapSource {
  id: BaseMapId;
  label: string;
  hint: string;
  /** Absent for `plain`, which draws no tiles at all. */
  tile?: {
    /** `{z}`, `{x}`, `{y}` are substituted per tile. */
    url: string;
    maxZoom: number;
    attribution: string;
  };
}

export const BASE_MAPS: BaseMapSource[] = [
  {
    id: 'osm',
    label: 'Streets',
    hint: 'OpenStreetMap — roads, settlements and place names under the boundaries',
    tile: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    },
  },
  {
    id: 'satellite',
    label: 'Satellite',
    hint: 'Esri World Imagery — aerial/satellite photography under the boundaries',
    tile: {
      // Esri's tiling scheme is {z}/{y}/{x}; the placeholders below are ordered
      // to match, so the generic substitution in tiles.ts still applies.
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
  },
  {
    id: 'plain',
    label: 'Plain',
    hint: 'No base map — readiness colour only, nothing competing with it',
  },
];

export function baseMapSource(id: BaseMapId): BaseMapSource {
  return BASE_MAPS.find((b) => b.id === id) ?? BASE_MAPS[BASE_MAPS.length - 1]!;
}

interface BaseMapStore {
  baseMap: BaseMapId;
  setBaseMap: (baseMap: BaseMapId) => void;
}

export const useBaseMapStore = create<BaseMapStore>()(
  persist(
    (set) => ({
      // Plain by default: the readiness band is the message, and an unrequested
      // aerial photo behind it is noise until the reader asks. It is also the
      // only value that makes no third-party request — see the note above.
      baseMap: 'plain',
      setBaseMap: (baseMap) => set({ baseMap }),
    }),
    { name: 'emr-map-basemap', version: 1 },
  ),
);
