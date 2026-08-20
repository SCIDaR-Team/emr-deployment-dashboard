import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Download, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDismissable } from '@/hooks/useDismissable';
import { toast } from '@/store/toastStore';

export interface ExportAction {
  id: string;
  label: string;
  /** One line on what the file is good for — the formats are not interchangeable
   *  and the choice is otherwise guesswork. */
  hint?: string;
  icon?: LucideIcon;
  run: () => void | Promise<void>;
}

export interface ExportMenuGroup {
  label: string;
  actions: ExportAction[];
}

interface ExportMenuProps {
  groups: ExportMenuGroup[];
  /** Trigger text. */
  label?: string;
  align?: 'left' | 'right';
  className?: string;
}

/**
 * The one export control in the app.
 *
 * Every format behind it costs a network round-trip the moment it is chosen —
 * `xlsx`, `html2canvas` and `jspdf` are dynamically imported by `lib/export.ts`
 * and are not in the initial bundle — so the menu has to hold the button in a
 * visible working state rather than appearing to do nothing for several seconds
 * on a slow connection. That, and surfacing a failure, is most of what this
 * component is: rasterising a large page is the one interaction in the
 * dashboard that can genuinely fail at runtime.
 */
export function ExportMenu({
  groups,
  label = 'Export',
  align = 'right',
  className,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(open, close, ref);

  const actions = groups.flatMap((g) => g.actions);

  const run = async (action: ExportAction) => {
    setOpen(false);
    triggerRef.current?.focus();
    setBusy(action);
    try {
      await action.run();
    } catch (error) {
      // Never silent. A failed export looks exactly like a slow one otherwise,
      // and the reader's next move is to click it again.
      toast.error(
        `${action.label} export failed`,
        error instanceof Error
          ? error.message
          : 'The file could not be generated. Try a smaller selection, or another format.',
      );
    } finally {
      setBusy(null);
    }
  };

  /** Roving focus through the menu — a menu that can only be used with a mouse
   *  is not usable by anyone navigating with a keyboard or a screen reader. */
  const onItemKeyDown = (event: React.KeyboardEvent, index: number) => {
    const focusAt = (i: number) => {
      event.preventDefault();
      itemRefs.current[(i + actions.length) % actions.length]?.focus();
    };
    if (event.key === 'ArrowDown') focusAt(index + 1);
    else if (event.key === 'ArrowUp') focusAt(index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(actions.length - 1);
    else if (event.key === 'Tab') close();
  };

  let flatIndex = -1;

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        disabled={busy != null}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-muted-foreground transition-colors',
          'hover:border-brand-500/50 hover:text-foreground',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          busy != null && 'cursor-progress opacity-70',
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden />
        )}
        {/* Announced, not just shown: the wait is long enough that a screen
            reader user needs to hear that something is happening. */}
        <span aria-live="polite">
          {busy ? `Preparing ${busy.label}…` : label}
        </span>
        {!busy && (
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`${label} format`}
          className={cn(
            'absolute top-11 z-40 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-pop animate-pop-in',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {groups.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex > 0 ? 'mt-1' : undefined}>
              <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              {group.actions.map((action) => {
                flatIndex += 1;
                const index = flatIndex;
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    autoFocus={index === 0}
                    onClick={() => void run(action)}
                    onKeyDown={(e) => onItemKeyDown(e, index)}
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    {Icon && (
                      <Icon
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {action.label}
                      </span>
                      {action.hint && (
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                          {action.hint}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
