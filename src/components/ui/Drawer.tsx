import { useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDismissable, useScrollLock } from '@/hooks/useDismissable';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  side?: 'left' | 'right';
  /** Requested width in px; capped to the viewport on narrow screens. */
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Edge panel. The mobile home for the filter bar, and the container for
 * anything too long to sit in a dialog — the indicator detail list, exports.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  side = 'right',
  width = 380,
  children,
  footer,
}: DrawerProps) {
  const close = useCallback(() => onClose(), [onClose]);
  useDismissable(open, close);
  useScrollLock(open);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed bottom-0 top-0 z-[95] flex max-w-full flex-col border-border bg-surface shadow-pop',
          side === 'left' ? 'left-0 border-r animate-slide-in-left' : 'right-0 border-l animate-slide-in-right',
        )}
        // Never wider than the screen less a thumb-sized strip of backdrop, so
        // the panel's own close button stays reachable on a phone.
        style={{ width: `min(${width}px, calc(100vw - 2.5rem))` }}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer && <div className="border-t border-border px-4 py-3 sm:px-5">{footer}</div>}
      </aside>
    </>,
    document.body,
  );
}
