import { cn } from '@/lib/cn';
import { BASE_MAPS, useBaseMapStore } from '@/store/basemapStore';

/**
 * Base map picker — Streets / Satellite / Plain.
 *
 * A segmented control whose active choice is stated rather than implied: a
 * reader needs to know whether the green under a boundary is a readiness band
 * or a forest.
 *
 * **Nothing mounts this.** It arrived with the scaffold from the sibling
 * dashboard, which puts it on the report explorer — a module this one dropped,
 * so the control came across and its page did not. Keeping it costs nothing and
 * it is where the work would start, but the maps are reliably plain only for as
 * long as it stays unmounted; see the note on `basemapStore`.
 *
 * Three things are untrue today and have to be true before it goes on a page:
 *
 *   - The **national** layer's labels need a halo. They are flat black with
 *     none, deliberately — see MapLabel — which is the right call over the band
 *     fills and unreadable over imagery. The LGA layer already has one.
 *   - Over tiles the band fills drop to 0.55 opacity (`fillOpacityFor`). Amber
 *     and green at that opacity have been checked against each other on the
 *     plain wash, not over farmland or roofs. The three bands have to stay
 *     tellable apart against whatever is underneath.
 *   - Tiles are fetched at runtime from `tile.openstreetmap.org` and
 *     `arcgisonline.com`. Whether a dashboard that has to work on a ministry
 *     network may reach either host is a deployment question, not a UI one.
 *
 * Restoring persistence in `basemapStore` is the last step, under a new key.
 */
export function BaseMapControl({ className }: { className?: string }) {
  const baseMap = useBaseMapStore((s) => s.baseMap);
  const setBaseMap = useBaseMapStore((s) => s.setBaseMap);

  return (
    <div
      role="radiogroup"
      aria-label="Base map style"
      className={cn('inline-flex rounded-lg border border-border bg-surface p-0.5', className)}
    >
      {BASE_MAPS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={baseMap === option.id}
          title={option.hint}
          onClick={() => setBaseMap(option.id)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs transition-colors',
            baseMap === option.id
              ? 'bg-brand-600 font-medium text-surface'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
