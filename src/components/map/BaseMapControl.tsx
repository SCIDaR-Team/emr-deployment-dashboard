import { cn } from '@/lib/cn';
import { BASE_MAPS, useBaseMapStore } from '@/store/basemapStore';

/**
 * Base map picker — Streets / Satellite / Plain.
 *
 * Same segmented-control idiom as `AggregationToggle`, and like it the active
 * choice is stated rather than implied: a reader needs to know whether the
 * green under a boundary is a readiness band or a forest.
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
