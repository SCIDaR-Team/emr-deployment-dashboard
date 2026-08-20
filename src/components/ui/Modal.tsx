import { useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDismissable, useScrollLock } from '@/hooks/useDismissable';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Tailwind max-width utility. */
  size?: string;
  footer?: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'max-w-3xl',
  footer,
}: ModalProps) {
  const close = useCallback(() => onClose(), [onClose]);
  useDismissable(open, close);
  useScrollLock(open);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 animate-fade-in sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          // dvh, not vh: on mobile browsers vh is the *largest* viewport, so a
          // vh-capped dialog runs under the URL bar and its footer — where the
          // confirm button lives — is unreachable.
          'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop animate-dialog-in sm:max-h-[88dvh]',
          size,
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>

        {footer && <div className="border-t border-border px-4 py-3 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
