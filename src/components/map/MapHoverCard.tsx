import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Space between the pointer and the card's nearest edge, in px. */
const GAP = 16;
/** The closest the card comes to the frame's own edges, in px. */
const INSET = 8;

/**
 * The hover card every map layer opens beside the pointer.
 *
 * Beside it rather than centred over it: a card standing on the pointer covers
 * the very shape being asked about, and the tall ones (the National Coverage
 * card runs to two groups of readings) cover most of a state. It goes to the
 * right of the pointer, or the left where the right has no room, and slides
 * vertically to stay inside the frame — so a state on the top edge of the map
 * gets its whole card rather than the bottom half of one. Only on a frame too
 * narrow for either side does it fall back to above or below the pointer.
 *
 * Placed in a layout effect, straight onto the element, because the card's own
 * size is not known until it has rendered and a second React pass per pointer
 * move would be one too many. React never sets `left`/`top` here, so it never
 * undoes the placement. The frame is the card's offset parent — every map's
 * root is `relative` — so `x`/`y` are in the same coordinates the maps already
 * record their hover in.
 */
export function MapHoverCard({
  x,
  y,
  children,
  className,
}: {
  /** Pointer position relative to the map frame. */
  x: number;
  y: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const card = ref.current;
    const frame = card?.offsetParent as HTMLElement | null;
    if (!card || !frame) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const clamp = (v: number, max: number) => Math.max(INSET, Math.min(v, max));

    let left: number;
    let top: number;
    if (x + GAP + w <= fw - INSET) {
      left = x + GAP;
      top = clamp(y - h / 2, fh - h - INSET);
    } else if (x - GAP - w >= INSET) {
      left = x - GAP - w;
      top = clamp(y - h / 2, fh - h - INSET);
    } else {
      left = clamp(x - w / 2, fw - w - INSET);
      top = y - GAP - h >= INSET ? y - GAP - h : clamp(y + GAP, fh - h - INSET);
    }
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  });

  return (
    <div
      ref={ref}
      className={cn(
        // `w-max` so the card is measured at its natural width, not whatever is
        // left between its last position and the frame's edge.
        'pointer-events-none absolute left-0 top-0 z-10 w-max max-w-[calc(100%-1rem)] rounded-lg border border-border bg-surface px-3 py-2 text-body shadow-pop',
        className,
      )}
    >
      {children}
    </div>
  );
}
