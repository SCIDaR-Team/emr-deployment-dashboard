/**
 * Which raster base map sits under the choropleth.
 *
 * Persisted, and shared by all three map layers: drilling National → State →
 * LGA must not silently drop the reader back to a different base map halfway
 * down. Not part of themeStore — this is a map setting, not a colour scheme,
 * and it is orthogonal to light/dark.
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
      // Plain by default: the readiness band is the message, and an
      // unrequested aerial photo behind it is noise until the reader asks.
      baseMap: 'plain',
      setBaseMap: (baseMap) => set({ baseMap }),
    }),
    { name: 'emr-basemap' },
  ),
);
