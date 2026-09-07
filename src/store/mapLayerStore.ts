/**
 * Which spatial layers are drawn.
 *
 * A GIS map is a stack of layers the analyst composes, not a single picture the
 * author composed for them — so the boundaries, the names, the thematic fill
 * and the facility points are four independently switchable things rather than
 * one "the map" that is either on or off.
 *
 * The point is subtraction. Every layer here is on by default, because the
 * composed map is the right answer to the question the page asks; what a toggle
 * buys is the ability to take something *away* when it is in the way. Turning
 * the indicator fill off to read the satellite imagery underneath, or the
 * labels off to see the boundary they were sitting on, are the two that get
 * used — and neither is expressible without a control.
 *
 * Shared across all three levels, deliberately. A reader who turned labels off
 * on the national map did not ask to see them again the moment they drilled
 * into a state; the panel would then be undoing itself under them.
 *
 * ## What is *not* here
 *
 * Which layers are **available** at a given zoom is not a preference and is not
 * stored — it is a property of the level. LGA boundaries do not exist on the
 * national map, facility points do not exist above a state, and where the
 * points *are* drawn the polygons under them carry no thematic fill for the
 * indicator toggle to switch — so those toggles are absent from the panel
 * there rather than present and inert. See `MapLayerPanel`, which takes the
 * available set from its caller.
 */

import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { persist } from 'zustand/middleware';

export type MapLayerId = 'boundaries' | 'labels' | 'indicator' | 'facilities' | 'cluster';

export interface MapLayerVisibility {
  /** Administrative boundary strokes — state outlines, LGA outlines. */
  boundaries: boolean;
  /** Place names on the polygons. */
  labels: boolean;
  /** The thematic fill: readiness band, or the sequential need ramp. */
  indicator: boolean;
  /** PHC/facility point features. Drawn at state and LGA level, not above. */
  facilities: boolean;
  /**
   * Collapse facilities that fall within a marker's width of each other into a
   * counted bubble. Only meaningful with `facilities` on.
   */
  cluster: boolean;
}

interface MapLayerStore extends MapLayerVisibility {
  toggle: (id: MapLayerId) => void;
  set: (id: MapLayerId, on: boolean) => void;
  reset: () => void;
}

export const MAP_LAYER_DEFAULTS: MapLayerVisibility = {
  boundaries: true,
  labels: true,
  indicator: true,
  facilities: true,
  cluster: true,
};

/** Panel copy, kept beside the state so a new layer cannot be added without a
 *  name and a reason for it. */
export const MAP_LAYERS: {
  id: MapLayerId;
  label: string;
  hint: string;
  group: 'Administrative' | 'Facilities' | 'Indicators';
}[] = [
  {
    id: 'boundaries',
    label: 'Boundaries',
    hint: 'State and LGA administrative outlines',
    group: 'Administrative',
  },
  { id: 'labels', label: 'Place names', hint: 'State and LGA names', group: 'Administrative' },
  {
    id: 'indicator',
    label: 'Thematic fill',
    hint: 'The readiness band or investment-need colour on each area',
    group: 'Indicators',
  },
  {
    id: 'facilities',
    label: 'PHC facilities',
    hint: 'Individual facilities at their surveyed coordinates',
    group: 'Facilities',
  },
  {
    id: 'cluster',
    label: 'Cluster dense points',
    hint: 'Group facilities that overlap at this zoom into a counted marker',
    group: 'Facilities',
  },
];

export const useMapLayerStore = create<MapLayerStore>()(
  persist(
    (set) => ({
      ...MAP_LAYER_DEFAULTS,
      toggle: (id) => set((s) => ({ [id]: !s[id] }) as Partial<MapLayerVisibility>),
      set: (id, on) => set({ [id]: on } as Partial<MapLayerVisibility>),
      reset: () => set(MAP_LAYER_DEFAULTS),
    }),
    { name: 'emr-map-layers', version: 1 },
  ),
);

/**
 * Is anything switched off?
 *
 * These toggles **persist across sessions**, which is right for a preference
 * and dangerous for a subtraction. A reader who turns the thematic fill off to
 * look at the imagery underneath, then closes the tab, comes back a week later
 * to a map painted in nothing — and no reason on screen for why, because the
 * cause is a checkbox two clicks deep in a panel they last opened last week.
 * That is exactly the trap `basemapStore` documents about its own past, and the
 * fix is the same shape: make the modified state *visible*, and make getting
 * back to the default one click.
 *
 * So the Layers button carries a dot whenever this is true, and the panel
 * offers a Reset. Neither is decoration — together they are what makes
 * persisting these safe.
 */
export function useMapLayersModified(): boolean {
  return useMapLayerStore((s) =>
    (Object.keys(MAP_LAYER_DEFAULTS) as MapLayerId[]).some(
      (id) => s[id] !== MAP_LAYER_DEFAULTS[id],
    ),
  );
}

/**
 * The visibility flags on their own, for a component that only renders.
 *
 * `shallow` is load-bearing, not a micro-optimisation: the selector builds a
 * fresh object every call, and under React 18's `useSyncExternalStore` a
 * snapshot that is never referentially equal to the last one is a re-render
 * loop rather than a wasted render. Comparing the five booleans instead is what
 * makes the snapshot stable.
 */
export function useMapLayers(): MapLayerVisibility {
  return useMapLayerStore(
    (s) => ({
      boundaries: s.boundaries,
      labels: s.labels,
      indicator: s.indicator,
      facilities: s.facilities,
      cluster: s.cluster,
    }),
    shallow,
  );
}
