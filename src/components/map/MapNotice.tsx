import { Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * One line of transient explanation, in the map's corner.
 *
 * For the things a map has to say about *itself* rather than about the data:
 * a location request that was declined, a fix the device could not get. These
 * are not errors in the page and they are not findings — they are the map
 * reporting that a control it offered did not do what it offered to do, which
 * is worse left silent than said plainly, and worse still said in a modal.
 *
 * Renders nothing for a null `text`, so a caller can hand it a message that is
 * usually absent without branching.
 */
export function MapNotice({
  text,
  onDismiss,
  className,
}: {
  text: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  if (!text) return null;
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-1.5 rounded border border-border bg-surface/95 px-2 py-1.5 text-[11px] leading-tight text-muted-foreground shadow-card backdrop-blur',
        className,
      )}
    >
      <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="max-w-[220px]">{text}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="pointer-events-auto -mr-0.5 mt-px grid h-3.5 w-3.5 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}
