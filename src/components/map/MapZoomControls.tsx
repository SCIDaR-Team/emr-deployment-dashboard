import { Plus, Minus, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Zoom affordance for a map layer.
 *
 * Wheel and pinch are the fast path, but they are invisible and unreachable
 * from a keyboard — these buttons are how someone discovers the map zooms at
 * all, and the only way to work it without a pointer.
 */
export function MapZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
  canReset,
  className,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  canReset: boolean;
  className?: string;
}) {
  const button =
    'grid h-7 w-7 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div
      className={cn(
        'absolute right-2 top-2 flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface/90 shadow-card backdrop-blur',
        className,
      )}
    >
      <button type="button" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in" className={button}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out" className={button}>
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={!canReset}
        title="Reset zoom"
        aria-label="Reset zoom"
        className={button}
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
