import { useEffect, type RefObject } from 'react';

/**
 * Close-on-outside-click and close-on-Escape, shared by every overlay.
 *
 * `mousedown`, not `click`: a click fires after the pointer is released, by which
 * time a control the user pressed inside the popover may already have unmounted,
 * so the event's target is detached and `contains()` reports it as outside.
 *
 * Pass `ref: null` for overlays that own the whole screen (dialogs, drawers) and
 * only need the Escape key.
 */
export function useDismissable(
  open: boolean,
  onClose: () => void,
  ref?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    let onDown: ((e: MouseEvent) => void) | undefined;
    if (ref) {
      onDown = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      };
      document.addEventListener('mousedown', onDown);
    }

    return () => {
      document.removeEventListener('keydown', onKey);
      if (onDown) document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose, ref]);
}

/**
 * Lock body scroll while an overlay is open.
 *
 * A drawer or dialog covers the page on a phone; letting the content behind it
 * scroll under the touch is the classic scroll-chaining bug.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
