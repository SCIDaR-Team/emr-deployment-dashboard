import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Sparkles, Undo2, X } from 'lucide-react';
import { useDismissable } from '@/hooks/useDismissable';
import { cn } from '@/lib/cn';
import { ASSISTANT_ENDPOINT } from '@/modules/assistant/api';
import type { ScenarioSpec, ScenarioView } from './scenarioState';
import type { ScenarioUrlState } from './useScenarioUrl';

/**
 * "Describe" — set the section up from a sentence.
 *
 * The reader types what they want in their own words; an AI model reads it as
 * the builder's settings (fixes, a target, the states, which view), the server
 * checks every value against the data, and the section's own engine computes
 * the result as if the reader had set it by hand. Nothing the model writes is
 * shown as a figure.
 *
 * What was understood is stated back, one line per scenario, with an Undo that
 * puts the section as it was — a misread is visible and one click from gone.
 */

const EXAMPLES = [
  '₦20m on routers in the North West',
  'With ₦50m, which state unlocks the most?',
  'Compare solar and connectivity at ₦500m',
  'Make 1,000 more facilities Ready as cheaply as possible',
];

interface Interpreted {
  view: ScenarioView;
  specs: ScenarioSpec[];
  summary: string[];
  ignored: string[];
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: Interpreted; previous: ScenarioUrlState }
  | { kind: 'error'; message: string };

export function DescribeScenario({
  current,
  onApply,
}: {
  current: ScenarioUrlState;
  onApply: (next: ScenarioUrlState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, box);
  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  useEffect(() => () => abort.current?.abort(), []);

  const submit = async (words: string) => {
    const q = words.trim();
    if (!q || status.kind === 'loading') return;
    setText(q);
    setStatus({ kind: 'loading' });
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch(`${ASSISTANT_ENDPOINT}/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as
        (Interpreted & { error?: string }) | null;
      if (!res.ok || !body || body.error || !body.specs?.length) {
        setStatus({
          kind: 'error',
          message: body?.error ?? 'Describing scenarios is not available right now.',
        });
        return;
      }
      const previous = current;
      const next: ScenarioUrlState =
        body.view === 'compare'
          ? { view: 'compare', single: current.single, compare: body.specs }
          : { view: body.view, single: body.specs[0]!, compare: current.compare };
      onApply(next);
      setStatus({ kind: 'done', result: body, previous });
    } catch {
      if (!controller.signal.aborted) {
        setStatus({ kind: 'error', message: 'Describing scenarios is not available right now.' });
      }
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-[4px] bg-sidebar px-2.5 py-1 text-tick font-semibold uppercase tracking-[0.08em] text-sidebar-foreground transition-colors hover:bg-sidebar/90"
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        Describe
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Describe a scenario"
          className="absolute right-0 top-9 z-40 w-[min(440px,calc(100vw-2rem))] rounded-[10px] border border-border bg-surface p-3 shadow-pop animate-pop-in"
        >
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-body font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-chrome-ink" aria-hidden />
              Describe a scenario
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-[4px] p-1 text-muted-foreground hover:bg-surface-sunk hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(text);
            }}
            className="mt-2 flex items-center gap-2 rounded-[8px] border border-border px-2.5 py-1.5 focus-within:border-chrome-ink"
          >
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="e.g. ₦20m on routers in the North West"
              aria-label="Describe a scenario"
              className="min-w-0 flex-1 bg-transparent py-0.5 text-body text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!text.trim() || status.kind === 'loading'}
              aria-label="Set it up"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar text-sidebar-foreground disabled:opacity-30"
            >
              {status.kind === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ArrowUp className="h-4 w-4" aria-hidden />
              )}
            </button>
          </form>

          {status.kind === 'idle' && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    onClick={() => void submit(ex)}
                    className="rounded-full border border-border px-2.5 py-1 text-left text-note text-foreground transition-colors hover:border-chrome-ink hover:bg-chrome-active/40"
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {status.kind === 'loading' && (
            <p className="mt-2.5 text-note text-muted-foreground">Setting it up…</p>
          )}

          {status.kind === 'error' && (
            <p className="mt-2.5 text-note text-notready-ink">{status.message}</p>
          )}

          {status.kind === 'done' && (
            <div className="mt-2.5 rounded-[8px] bg-chrome-active/40 px-3 py-2">
              <p className="text-tick font-semibold uppercase tracking-[0.08em] text-chrome-active-foreground">
                Set up as{' '}
                {status.result.view === 'compare'
                  ? 'a comparison'
                  : status.result.view === 'states'
                    ? 'By state'
                    : 'one scenario'}
              </p>
              <ul className={cn('mt-1 space-y-0.5 text-note text-foreground')}>
                {status.result.summary.map((line, i) => (
                  <li key={i}>
                    {status.result.view === 'compare' && (
                      <span className="mono mr-1.5 font-bold">{String.fromCharCode(65 + i)}</span>
                    )}
                    {line}
                  </li>
                ))}
              </ul>
              {status.result.ignored.length > 0 && (
                <p className="mt-1 text-note text-muted-foreground">
                  Not in the assessment, so left out: {status.result.ignored.join(', ')}.
                </p>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onApply(status.previous);
                    setStatus({ kind: 'idle' });
                  }}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-border bg-surface px-2 py-0.5 text-note text-foreground hover:border-foreground/40"
                >
                  <Undo2 className="h-3 w-3" aria-hidden />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-[4px] bg-sidebar px-2.5 py-0.5 text-note font-semibold text-sidebar-foreground"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          <p className="mt-2.5 text-[10.5px] leading-snug text-muted-foreground">
            An AI model (OpenAI) reads your words as the builder&rsquo;s settings; the figures are
            the builder&rsquo;s own.
          </p>
        </div>
      )}
    </div>
  );
}
