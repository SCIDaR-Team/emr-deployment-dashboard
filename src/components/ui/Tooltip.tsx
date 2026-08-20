import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** Wider box, for definitions rather than one-liners. */
  wide?: boolean;
  /** Applied to the trigger wrapper. */
  className?: string;
}

/**
 * Hover / focus tooltip, rendered into a portal so it is never clipped by a
 * card's `overflow-hidden` or a scrolling panel.
 *
 * It flips below the trigger when there is not enough room above, which is what
 * happens to every tooltip in the first row of a table. Position is measured on
 * open rather than tracked, so a tooltip left open across a scroll will drift —
 * acceptable, since it closes on pointer-out and blur.
 *
 * Tooltips are hover-only, so anything essential must also be readable without
 * them: this is for elaboration, never for the only copy of a definition.
 */
export function Tooltip({ content, children, wide, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, below: false });
  const ref = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 80;
    setPos({ x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        className={cn('inline-flex cursor-help outline-none', className)}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            role="tooltip"
            className={cn(
              'pointer-events-none fixed z-[200] -translate-x-1/2 animate-fade-in',
              !pos.below && '-translate-y-full',
            )}
            style={{ left: pos.x, top: pos.y, maxWidth: wide ? 320 : 240 }}
          >
            <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-foreground shadow-pop">
              {content}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
