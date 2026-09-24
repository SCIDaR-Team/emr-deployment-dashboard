import { useCallback, useEffect, useRef, useState } from 'react';
import { createSseReader, type AssistantLink } from './sse';

/**
 * The conversation with the assistant.
 *
 * Held in the page and in `sessionStorage`, so it survives moving between
 * pages and a reload but not closing the tab — nothing about a conversation is
 * kept anywhere else. Each question sends the conversation so far (text only);
 * the answer streams in as it is written.
 */

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** Pages the answer drew on. */
  links?: AssistantLink[];
  /** What the assistant is doing right now, while it answers. */
  activity?: string;
  error?: string;
  pending?: boolean;
}

const STORAGE_KEY = 'era-assistant-conversation';
const ENDPOINT = import.meta.env.VITE_ASSISTANT_URL || '/api/assistant';
/** The last turns sent with a question — enough to follow up on, and what the
 *  endpoint accepts. */
const HISTORY = 16;

function load(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const turns = raw ? (JSON.parse(raw) as Turn[]) : [];
    return turns.filter((t) => !t.pending);
  } catch {
    return [];
  }
}

export function useAssistant() {
  const [turns, setTurns] = useState<Turn[]>(load);
  const abort = useRef<AbortController | null>(null);
  const busy = turns.some((t) => t.pending);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.filter((t) => !t.pending)));
    } catch {
      // Storage may be unavailable; the conversation still works in memory.
    }
  }, [turns]);

  useEffect(() => () => abort.current?.abort(), []);

  // Updates the answer being written. A conversation reset mid-answer leaves
  // nothing to update, and the late events are dropped.
  const updateLast = (fn: (t: Turn) => Turn) =>
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      return last?.role === 'assistant' ? [...prev.slice(0, -1), fn(last)] : prev;
    });

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const history = [
        ...turns.filter((t) => !t.error && t.content),
        { role: 'user' as const, content: q },
      ]
        .slice(-HISTORY)
        .map(({ role, content }) => ({ role, content }));
      setTurns((prev) => [
        ...prev,
        { role: 'user', content: q },
        { role: 'assistant', content: '', pending: true },
      ]);

      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'The assistant is not available right now.');
        }
        const read = createSseReader();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const event of read(value)) {
            if (event.type === 'text') {
              updateLast((t) => ({ ...t, content: t.content + event.delta, activity: undefined }));
            } else if (event.type === 'activity') {
              updateLast((t) => ({ ...t, activity: event.label }));
            } else if (event.type === 'links') {
              updateLast((t) => ({ ...t, links: event.links }));
            } else if (event.type === 'error') {
              updateLast((t) => ({ ...t, error: event.message }));
            }
          }
        }
        updateLast((t) => ({
          ...t,
          pending: false,
          activity: undefined,
          error: t.error ?? (t.content ? undefined : 'No answer came back. Try again.'),
        }));
      } catch (e) {
        if (controller.signal.aborted) {
          updateLast((t) => ({
            ...t,
            pending: false,
            activity: undefined,
            error: t.content ? undefined : 'Stopped.',
          }));
          return;
        }
        updateLast((t) => ({
          ...t,
          pending: false,
          activity: undefined,
          error: e instanceof Error ? e.message : 'Something went wrong. Try again.',
        }));
      } finally {
        if (abort.current === controller) abort.current = null;
      }
    },
    [busy, turns],
  );

  const stop = useCallback(() => abort.current?.abort(), []);
  const reset = useCallback(() => {
    abort.current?.abort();
    setTurns([]);
  }, []);

  return { turns, busy, ask, stop, reset };
}
