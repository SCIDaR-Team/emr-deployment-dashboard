import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RotateCw, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CHARTS, type ChartSnapshot, type ExplainTable } from '@/lib/explain/charts';
import { unverifiedFigures } from '@/lib/figures';
import { ASSISTANT_ENDPOINT } from '@/modules/assistant/api';
import { Markdown } from '@/modules/assistant/Markdown';
import { createSseReader } from '@/modules/assistant/sse';
import { SlotContext, useExplaining, useExplainTables, type ExplainHost } from './context';

/**
 * "Explain this chart" — a button under a section's chart that has an AI model
 * say what the section shows and what stands out in it, for the scope and
 * filters the reader has on screen. The explanation opens below the button, so
 * the chart is read first and the words follow it (`ExplainFooter`).
 *
 * Three parts, so the words are written from exactly what the reader sees:
 *
 * - **The page** says where the reader is (`ExplainScope`): the area, and the
 *   filters that narrow it.
 * - **The section** is the host (`useExplainHost`): it owns the button and
 *   the panel, under its chart, and says which chart it is. How that chart is read is ours, in
 *   `lib/explain/charts`.
 * - **The figures** come from the components that draw them
 *   (`useExplainTables`), as the formatted strings they print — so the model
 *   is handed the same numbers the reader is looking at, and nothing else. A
 *   component builds them only when its section is being offered for
 *   explanation (`useExplaining`), so without the assistant this costs
 *   nothing.
 *
 * The answer is checked against those figures, and any number the model wrote
 * that is not among them is named under it. Nothing is sent until the reader
 * asks, and a view already explained in this visit is not sent again.
 */

/**
 * `useExplainTables` as an element, for a section whose figures are computed
 * by the component that renders the section itself. `build` runs only while
 * the section can be explained.
 */
export function ExplainFigures({ id, build }: { id: string; build: () => ExplainTable[] | null }) {
  const explaining = useExplaining();
  useExplainTables(id, explaining ? build() : null);
  return null;
}

export function ExplainProvider({
  host,
  children,
}: {
  host: ExplainHost;
  children: React.ReactNode;
}) {
  return <SlotContext.Provider value={host.slot}>{children}</SlotContext.Provider>;
}

export function ExplainButton({ host, className }: { host: ExplainHost; className?: string }) {
  if (!host.snapshot) return null;
  return (
    <button
      type="button"
      aria-expanded={host.open}
      onClick={() => host.setOpen(!host.open)}
      title="Explain what this shows, and what stands out"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-sans text-tick font-semibold normal-case tracking-normal transition-colors',
        host.open
          ? 'border-chrome-ink/40 bg-chrome-active text-chrome-active-foreground'
          : 'border-border text-chrome-ink hover:border-chrome-ink/40 hover:bg-chrome-active/50',
        className,
      )}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      Explain
    </button>
  );
}

/**
 * The button and, once opened, the explanation — under the section's chart.
 * Renders nothing when the section can't be explained.
 */
export function ExplainFooter({
  host,
  className,
  panelClassName,
}: {
  host: ExplainHost;
  className?: string;
  panelClassName?: string;
}) {
  if (!host.snapshot) return null;
  return (
    <div className={className}>
      <ExplainButton host={host} className="py-1" />
      <ExplainPanel host={host} className={cn('mt-2.5', panelClassName)} />
    </div>
  );
}

/** Explanations already written in this visit, by the exact view they explain. */
const CACHE = new Map<string, string>();

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'error'; message: string; text: string };

export function ExplainPanel({ host, className }: { host: ExplainHost; className?: string }) {
  const { snapshot, open, setOpen } = host;
  const current = useMemo(() => (snapshot ? JSON.stringify(snapshot) : null), [snapshot]);
  const [explained, setExplained] = useState<{ key: string; snapshot: ChartSnapshot } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const region = useRef<HTMLDivElement>(null);

  const run = useCallback(async (snap: ChartSnapshot, key: string, again = false) => {
    abort.current?.abort();
    setExplained({ key, snapshot: snap });
    const cached = again ? undefined : CACHE.get(key);
    if (cached) {
      setStatus({ kind: 'done', text: cached });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: 'loading', text: '' });
    let text = '';
    let failure: string | null = null;
    try {
      const res = await fetch(`${ASSISTANT_ENDPOINT}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: key,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Explanations are not available right now.');
      }
      const read = createSseReader();
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const event of read(value)) {
          if (event.type === 'text') {
            text += event.delta;
            setStatus({ kind: 'loading', text });
          } else if (event.type === 'error') failure = event.message;
        }
      }
      if (failure || !text.trim()) {
        setStatus({ kind: 'error', message: failure ?? 'No explanation came back.', text });
      } else {
        CACHE.set(key, text);
        setStatus({ kind: 'done', text });
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Something went wrong. Try again.',
        text,
      });
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  }, []);

  // Opening explains the view on screen; closing stops an answer mid-way.
  useEffect(() => {
    if (open && snapshot && current && !explained) void run(snapshot, current);
    if (!open) {
      abort.current?.abort();
      setExplained(null);
      setStatus((s) => (s.kind === 'idle' ? s : { kind: 'idle' }));
    }
  }, [open, snapshot, current, explained, run]);
  useEffect(() => () => abort.current?.abort(), []);

  // Under a tall chart the panel can open below the fold; bring it into view.
  useEffect(() => {
    if (!open) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    region.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [open]);

  if (!open || !snapshot || !current) return null;

  const text = status.kind === 'idle' ? '' : status.text;
  const stale = explained !== null && explained.key !== current;
  const unknown =
    status.kind === 'done' && explained
      ? unverifiedFigures(text, [explained.snapshot, CHARTS[explained.snapshot.chart]])
      : [];

  return (
    <div
      ref={region}
      role="region"
      aria-label={`Explanation of ${snapshot.title}`}
      aria-live="polite"
      className={cn(
        'rounded-[8px] border border-chrome-ink/25 bg-chrome-active/35 px-3 py-2.5 text-body text-foreground',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <p className="flex items-center gap-1.5 text-tick font-semibold uppercase tracking-[0.08em] text-chrome-active-foreground">
          <Sparkles className="h-3 w-3" aria-hidden />
          Explained by AI
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close the explanation"
          className="ml-auto rounded-[4px] p-0.5 text-muted-foreground hover:bg-surface/70 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {stale && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[6px] bg-surface/80 px-2 py-1.5 text-note">
          <span className="text-muted-foreground">
            The chart has changed since this was written.
          </span>
          <button
            type="button"
            onClick={() => void run(snapshot, current)}
            className="font-semibold text-chrome-ink hover:underline"
          >
            Explain the new view
          </button>
        </div>
      )}

      <div className={cn('mt-1.5', stale && 'opacity-60')}>
        {text ? (
          <Markdown text={text} />
        ) : status.kind === 'loading' ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Reading the chart…
          </p>
        ) : null}
      </div>

      {status.kind === 'error' && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-note text-notready-ink">
          {status.message}
          <button
            type="button"
            onClick={() => explained && void run(explained.snapshot, explained.key, true)}
            className="inline-flex items-center gap-1 font-semibold text-chrome-ink hover:underline"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            Try again
          </button>
        </p>
      )}

      {unknown.length > 0 && (
        <p className="mt-2 flex gap-1.5 text-note text-moderate-ink">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>
            Check {unknown.length === 1 ? 'this figure' : 'these figures'} — not among the figures
            on screen: {unknown.join(', ')}.
          </span>
        </p>
      )}

      <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
        Written by AI from the figures on screen. Check it before quoting it.
      </p>
    </div>
  );
}
