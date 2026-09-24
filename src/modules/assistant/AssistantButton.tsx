import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ASSISTANT_ENABLED, useAssistantStore } from '@/store/assistantStore';

/**
 * The button that opens "Ask the data", in the page header beside the theme
 * switch — reserved space on every module page, so it never sits on a table
 * or a chart the way a floating button would. The panel opens on the same
 * side. `compact` is the icon-only version for the phone's top bar; below
 * `lg` only that one shows.
 */
export function AssistantButton({ compact = false }: { compact?: boolean }) {
  const open = useAssistantStore((s) => s.open);
  const toggle = useAssistantStore((s) => s.toggle);
  if (!ASSISTANT_ENABLED) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-keyshortcuts="/"
      title="Ask the data (press /)"
      aria-label={compact ? 'Ask the data' : undefined}
      className={cn(
        'shrink-0 items-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        // Below `lg` the phone's top bar carries the icon version, so the
        // header's labelled one stands down rather than appear twice.
        compact
          ? 'flex h-8 w-8 justify-center text-foreground hover:bg-surface'
          : 'hidden h-8 bg-sidebar pl-3 pr-2 text-body text-sidebar-foreground hover:bg-sidebar/90 lg:flex',
      )}
    >
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
      {!compact && (
        <>
          <span className="whitespace-nowrap">Ask the data</span>
          <kbd className="mono flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-white/15 px-1 text-[11px] font-medium">
            /
          </kbd>
        </>
      )}
    </button>
  );
}
