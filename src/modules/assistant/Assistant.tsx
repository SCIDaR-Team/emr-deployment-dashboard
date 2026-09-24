import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowUpRight, Loader2, RotateCcw, Sparkles, Square, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAssistantStore } from '@/store/assistantStore';
import { Markdown } from './Markdown';
import { useAssistant, type Turn } from './useAssistant';

/**
 * "Ask the data" — the dashboard's assistant.
 *
 * Opened from the button in the page header (`AssistantButton`) or with `/`
 * from anywhere that is not a text field; closed with Escape. The panel runs
 * down the right-hand side, over the header's right end where its button
 * sits. It does not cover the page with a backdrop: a reader follows an
 * answer's links into the dashboard and keeps the conversation open beside
 * what it pointed to. Full screen on a phone, where there is no beside.
 *
 * Answers are written by an OpenAI model from the dashboard's own data — every
 * figure comes from a lookup over the published assessment, never from the
 * model's memory — and the panel says so under the input.
 */

const SUGGESTIONS = [
  'How ready is Kano for EMR deployment?',
  'With ₦20m in one state, which state unlocks the most facilities?',
  'What would it cost to make every facility in Jigawa Ready?',
  'Which states are most mature for digital health?',
];

/** Go to a dashboard page, then to the section named in its hash once the
 *  page has drawn it. */
function useGoTo() {
  const navigate = useNavigate();
  return (href: string) => {
    const [path, hash] = href.split('#');
    navigate(path!);
    if (!hash) return;
    const started = performance.now();
    const seek = () => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (performance.now() - started < 3000) requestAnimationFrame(seek);
    };
    requestAnimationFrame(seek);
  };
}

/** True when a key press is meant for a field, not a shortcut. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}

export function Assistant() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const { turns, busy, ask, stop, reset } = useAssistant();
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const goTo = useGoTo();

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  // `/` opens the panel (and puts the cursor in the question box) from
  // anywhere a key press is not already meant for a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => input.current?.focus());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    void ask(text);
    setDraft('');
  };
  const last = turns[turns.length - 1];

  if (!open) return null;

  return (
    <aside
      aria-label="Ask the data"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      className="fixed inset-0 z-[80] flex flex-col border-l border-border bg-surface shadow-pop sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[400px]"
    >
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-chrome px-4">
        <Sparkles className="h-4 w-4 text-chrome-ink" aria-hidden />
        <h2 className="text-prose font-semibold text-foreground">Ask the data</h2>
        <span className="mono rounded-full bg-chrome-active px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.07em] text-chrome-active-foreground">
          Beta
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={reset}
            disabled={!turns.length}
            title="New conversation"
            aria-label="New conversation"
            className="rounded-[5px] p-1.5 text-muted-foreground hover:bg-surface-sunk hover:text-foreground disabled:opacity-30"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Close"
            aria-label="Close"
            className="rounded-[5px] p-1.5 text-muted-foreground hover:bg-surface-sunk hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {!turns.length ? (
          <div>
            <p className="text-body leading-relaxed text-muted-foreground">
              Ask about readiness, gaps, costs or scenarios in the 12 assessed states, or about
              State Maturity across all 37. Answers come from the dashboard&rsquo;s data and link to
              the page that shows them.
            </p>
            <ul className="mt-4 space-y-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="w-full rounded-[7px] border border-border px-3 py-2 text-left text-body text-foreground transition-colors hover:border-chrome-ink hover:bg-chrome-active/40"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-4">
            {turns.map((t, i) => (
              <TurnView
                key={i}
                turn={t}
                onLink={(href) => {
                  goTo(href);
                  if (window.innerWidth < 640) setOpen(false);
                }}
                onRetry={
                  t === last && t.error && !busy
                    ? () => {
                        const question = [...turns].reverse().find((x) => x.role === 'user');
                        if (question) send(question.content);
                      }
                    : undefined
                }
              />
            ))}
          </ol>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="shrink-0 border-t border-border px-3 pb-3 pt-2.5"
      >
        <div className="flex items-end gap-2 rounded-[8px] border border-border bg-surface px-2.5 py-1.5 focus-within:border-chrome-ink">
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={Math.min(4, Math.max(1, draft.split('\n').length))}
            maxLength={2000}
            placeholder="Ask about readiness, costs or scenarios"
            aria-label="Your question"
            className="max-h-28 min-w-0 flex-1 resize-none bg-transparent py-1 text-body text-foreground outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              title="Stop"
              aria-label="Stop answering"
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-surface"
            >
              <Square className="h-3 w-3" fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              title="Send"
              aria-label="Send"
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar text-sidebar-foreground disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
          Written by an AI model (OpenAI) from the assessment data. Check key figures on the page it
          links to.
        </p>
      </form>
    </aside>
  );
}

function TurnView({
  turn,
  onLink,
  onRetry,
}: {
  turn: Turn;
  onLink: (href: string) => void;
  onRetry?: () => void;
}) {
  if (turn.role === 'user') {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-[10px] rounded-br-[3px] bg-chrome-active/60 px-3 py-2 text-body text-foreground">
          {turn.content}
        </p>
      </li>
    );
  }
  return (
    <li className="text-body text-foreground">
      {turn.content && <Markdown text={turn.content} />}
      {turn.pending && (
        <p className="mt-1 flex items-center gap-1.5 text-note text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {turn.activity ?? (turn.content ? 'Writing' : 'Thinking')}
        </p>
      )}
      {turn.error && (
        <p className={cn('mt-1 text-note text-notready-ink', !turn.content && 'mt-0')}>
          {turn.error}{' '}
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-semibold underline">
              Try again
            </button>
          )}
        </p>
      )}
      {!!turn.links?.length && !turn.pending && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {turn.links.map((l) => (
            <button
              key={l.href}
              type="button"
              onClick={() => onLink(l.href)}
              className="inline-flex items-center gap-1 rounded-full border border-chrome-ink/60 px-2.5 py-0.5 text-note font-medium text-chrome-active-foreground transition-colors hover:border-chrome-ink hover:bg-chrome-active/50"
            >
              {l.label}
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
