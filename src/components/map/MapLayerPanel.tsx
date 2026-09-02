import { useEffect, useRef } from 'react';
import { Layers, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  MAP_LAYERS,
  useMapLayerStore,
  useMapLayersModified,
  type MapLayerId,
} from '@/store/mapLayerStore';
import { BASE_MAPS, useBaseMapStore } from '@/store/basemapStore';

/**
 * The layer list — what is drawn, and on what.
 *
 * The control that most separates a spatial tool from a chart. A chart's author
 * decides what is on it; a map's reader does, because the question they arrived
 * with is not always the one the map was composed to answer. Someone checking
 * whether a facility's recorded coordinate actually falls on a building needs
 * the thematic fill *off* and the satellite imagery *up*; someone comparing two
 * LGAs' boundaries needs the place names out of the way. Neither is expressible
 * without this.
 *
 * ## Only what this level has
 *
 * `available` comes from the caller, and a layer the current level does not
 * have is absent rather than present and disabled. A greyed "PHC facilities"
 * row on the national map would be the panel advertising a thing the map cannot
 * do; the honest reading is that at national extent facilities are not a layer
 * yet — they become one two levels down, and the reader finds the row there.
 *
 * ## The base map is here
 *
 * Streets / Satellite / Plain is the bottom layer of the same stack, so it
 * belongs at the bottom of the same panel, and this is the only place it is
 * offered. It briefly also sat on the map surface as a segmented control, on
 * the argument that flicking between street and imagery is a gesture rather
 * than a preference; that was removed at the client's direction. If it ever
 * comes back, it reads this same store — the taxonomy is right here, and a
 * second control is a shortcut to it, never a second source of truth.
 */

export function MapLayerPanel({
  open,
  onClose,
  available,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Which layer toggles this level actually has. */
  available: MapLayerId[];
  className?: string;
}) {
  const layers = useMapLayerStore();
  const modified = useMapLayersModified();
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const setBaseMap = useBaseMapStore((s) => s.setBaseMap);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes it, from anywhere — the panel floats over a map the reader is
  // otherwise dragging, and reaching for the × with the mouse means giving up
  // whatever the pointer was on.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const shown = MAP_LAYERS.filter((l) => available.includes(l.id));
  const groups = [...new Set(shown.map((l) => l.group))];

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label="Map layers"
      className={cn(
        'w-[228px] overflow-hidden rounded-lg border border-border bg-surface/95 shadow-pop backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Layers
        </span>
        <span className="flex items-center gap-0.5">
          {/* Only when there is something to undo. A Reset that is always
              present is furniture; one that appears when the map has been
              changed is a way back. */}
          {modified && (
            <button
              type="button"
              onClick={layers.reset}
              title="Show all layers again"
              aria-label="Reset map layers"
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close layer panel"
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      </div>

      <div className="max-h-[320px] overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group} className="mb-2 last:mb-0">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {group}
            </p>
            {shown
              .filter((l) => l.group === group)
              .map((layer) => {
                // Clustering is a property of the facility layer, so it cannot
                // be on when the thing it clusters is off. Disabled rather than
                // hidden: the row disappearing when a *different* switch is
                // flipped reads as a glitch.
                const dependsOnFacilities = layer.id === 'cluster';
                const disabled = dependsOnFacilities && !layers.facilities;
                return (
                  <label
                    key={layer.id}
                    title={layer.hint}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] text-foreground transition-colors hover:bg-muted',
                      disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
                      dependsOnFacilities && 'pl-4',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={layers[layer.id] && !disabled}
                      disabled={disabled}
                      onChange={() => layers.toggle(layer.id)}
                      className="h-3.5 w-3.5 shrink-0 accent-brand-600"
                    />
                    <span className="leading-tight">{layer.label}</span>
                  </label>
                );
              })}
          </div>
        ))}

        <div className="mt-2 border-t border-border pt-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Base map
          </p>
          <div role="radiogroup" aria-label="Base map style" className="flex gap-1">
            {BASE_MAPS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={baseMap === option.id}
                title={option.hint}
                onClick={() => setBaseMap(option.id)}
                className={cn(
                  'flex-1 rounded border px-1.5 py-1 text-[11px] transition-colors',
                  baseMap === option.id
                    ? 'border-brand-600 bg-brand-600 font-medium text-surface'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
