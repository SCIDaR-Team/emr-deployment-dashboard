/**
 * Which raster base map sits under the choropleth.
 *
 * Shared by all three map layers: drilling National → State → LGA must not
 * silently drop the reader back to a different base map halfway down. Not part
 * of themeStore — this is a map setting, not a colour scheme, and it is
 * orthogonal to light/dark.
 *
 * ## Streets by default
 *
 * This used to default to `plain` — no tiles, no third-party request — on the
 * reasoning that the readiness band is the message and an unrequested aerial
 * photo behind it is noise. That reasoning holds for a *choropleth*, and it
 * stopped being the whole story the moment the map became a drill-down that
 * ends on one clinic's compound. At the bottom of that descent the message is
 * "here is where this PHC physically is", and a plain wash cannot carry it:
 * there is no road to recognise, no settlement to place it against, nothing to
 * check the surveyed coordinate against at all. Making the reader find a picker
 * two clicks deep in a panel before the map can answer its main question is not
 * a safe default, it is a hidden one.
 *
 * So `osm` is the default, and the picker is reachable at the bottom of the
 * layer panel. The deployment concern the old default was standing in
 * for — a ministry network that cannot reach `tile.openstreetmap.org` or
 * `arcgisonline.com` — is answered directly instead of by pre-emptive
 * abstention: failed tiles are counted, and a base map that cannot load says so
 * and offers Plain, which needs no network at all. See `useTileHealth`.
 *
 * ## Reachable, and therefore persisted again
 *
 * This used to be a setting nobody could set. The only caller of `setBaseMap`
 * was a control the sibling dashboard mounted on a report explorer this one
 * does not have, so `plain` was the only value a reader could arrive at — and persisting it turned the store into a trap rather than a preference:
 * a `satellite` written by an earlier build came back on every visit, put
 * raster tiles under all three layers and dropped the band fills to 0.55
 * opacity, with no control anywhere to undo it.
 *
 * The picker now lives at the bottom of the layer panel (`MapLayerPanel`).
 * The three things that had to be true before it could ship are:
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
    /** The deepest level this source will ever be *asked* for. A ceiling on the
     *  request, not a promise that the imagery is there — see `coverage`. */
    maxZoom: number;
    attribution: string;
    /**
     * An endpoint that says whether imagery exists at a given tile, same
     * `{z}`/`{x}`/`{y}` substitution, answering `{"data":[1]}` or
     * `{"data":[0]}`.
     *
     * Only Esri needs this, and it needs it because of how it answers a tile it
     * does not have: `200 image/jpeg`, 2,521 bytes, a grey square reading "Map
     * data not yet available". That is indistinguishable from real imagery to
     * anything that only watches for load errors, so a facility view over rural
     * Kano filled the frame with grey placeholders while perfectly good z18
     * imagery sat one level up, unrequested.
     *
     * OpenStreetMap needs nothing here: it 404s, and the fallback layer beneath
     * shows through on its own.
     */
    coverage?: string;
  };
}

export const BASE_MAPS: BaseMapSource[] = [
  {
    id: 'osm',
    label: 'Streets',
    hint: 'OpenStreetMap — roads, settlements and place names under the boundaries',
    tile: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      // 19 is the deepest level the OSM tile service renders, and it is what
      // puts individual buildings on screen. 18 stopped a step short of the
      // level the facility view exists to reach.
      maxZoom: 19,
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
      // A ceiling on the *request*. World Imagery reaches 19 over Kano city,
      // where a compound wall and a roof are separate things — and stops at 18
      // over Rano and Yola North. Which of those applies is asked, per view,
      // through `coverage` below rather than guessed at here.
      maxZoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      coverage:
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap/{z}/{y}/{x}/1/1',
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
      // Streets by default — see the note above for why this is no longer
      // `plain`, and what replaced the caution that default was carrying.
      baseMap: 'osm',
      setBaseMap: (baseMap) => set({ baseMap }),
    }),
    // Version 2: v1 persisted a `plain` that most readers never chose, and
    // inheriting it would hide the change behind whatever is already in their
    // browser. A reader who deliberately picked Plain re-picks it once.
    { name: 'emr-map-basemap', version: 2 },
  ),
);

// ---------------------------------------------------------------------------
// Can this network actually reach the tiles?
// ---------------------------------------------------------------------------

/**
 * Whether the chosen base map is loading at all.
 *
 * The honest answer to "can a dashboard on a ministry network reach
 * openstreetmap.org?" is *sometimes*, and the previous answer to it was to
 * default to no tiles and let the reader discover otherwise. That trades a
 * certain loss for everyone against a possible one for some.
 *
 * This trades the other way: try, count the failures, and when a base map is
 * plainly not arriving say so in one line with a way out. An `<image>` that
 * cannot load fires `error`, so the signal is free — no probe request, no
 * timeout, no assumption about the network baked into a default.
 *
 * Counted per source rather than globally: an estate that blocks Esri may well
 * allow OSM, and failing one must not condemn the other. Reset on success, so a
 * connection that comes back clears the notice on its own.
 */
interface TileHealthStore {
  /** Consecutive failed tile requests, by base map. */
  failures: Partial<Record<BaseMapId, number>>;
  reportTileError: (id: BaseMapId) => void;
  reportTileLoad: (id: BaseMapId) => void;
}

/** Below this a failure is a single bad tile — a gap in imagery, a transient
 *  502 — and saying anything about it would be noise. Above it, the source is
 *  not reachable. */
const UNREACHABLE_AFTER = 6;

export const useTileHealthStore = create<TileHealthStore>((set) => ({
  failures: {},
  reportTileError: (id) =>
    set((s) => ({ failures: { ...s.failures, [id]: (s.failures[id] ?? 0) + 1 } })),
  reportTileLoad: (id) => set((s) => (s.failures[id] ? { failures: { ...s.failures, [id]: 0 } } : s)),
}));

/** True when the active base map has failed enough times to be called broken
 *  rather than patchy. */
export function useBaseMapUnreachable(id: BaseMapId): boolean {
  return useTileHealthStore((s) => (s.failures[id] ?? 0) >= UNREACHABLE_AFTER);
}
