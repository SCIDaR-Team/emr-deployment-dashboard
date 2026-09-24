import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChartId, ChartSnapshot, ExplainTable } from '@/lib/explain/charts';
import { ASSISTANT_ENABLED } from '@/store/assistantStore';

/**
 * The wiring behind "Explain this chart" — see `explain.tsx` for the whole
 * design. Kept apart from the components so both files hot-reload cleanly.
 */

const ScopeContext = createContext<readonly string[]>([]);

/** Where the reader is, for every explanation below: "Area: Kano State",
 *  "Readiness: Not ready". Memoise the list — it is part of the snapshot. */
export const ExplainScope = ScopeContext.Provider;

export interface Slot {
  set(key: string, tables: ExplainTable[] | null): void;
}
export const SlotContext = createContext<Slot | null>(null);

/** Whether the section this sits in can be explained — build the tables only then. */
export function useExplaining(): boolean {
  return useContext(SlotContext) !== null;
}

/** Hand the section the figures this component draws, as tables of strings. */
export function useExplainTables(key: string, tables: ExplainTable[] | null) {
  const slot = useContext(SlotContext);
  // Every render: the slot compares, so an unchanged table costs nothing.
  useLayoutEffect(() => {
    slot?.set(key, tables);
  });
  useLayoutEffect(() => () => slot?.set(key, null), [slot, key]);
}

export interface ExplainHost {
  slot: Slot | null;
  snapshot: ChartSnapshot | null;
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** A section that can be explained. `chart` undefined leaves it as it was. */
export function useExplainHost(chart: ChartId | undefined, title: string): ExplainHost {
  const parts = useRef(new Map<string, { tables: ExplainTable[]; json: string }>());
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const scope = useContext(ScopeContext);

  const slot = useMemo<Slot>(
    () => ({
      set(key, tables) {
        const json = tables?.length ? JSON.stringify(tables) : null;
        if ((parts.current.get(key)?.json ?? null) === json) return;
        if (tables && json) parts.current.set(key, { tables, json });
        else parts.current.delete(key);
        setVersion((v) => v + 1);
      },
    }),
    [],
  );

  const on = ASSISTANT_ENABLED && chart !== undefined;
  const snapshot = useMemo<ChartSnapshot | null>(() => {
    if (!on || !parts.current.size) return null;
    return {
      chart,
      title,
      scope: [...scope],
      tables: [...parts.current.values()].flatMap((p) => p.tables),
    };
    // `version` stands for the parts, which live in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, chart, title, scope, version]);

  return { slot: on ? slot : null, snapshot, open: open && snapshot !== null, setOpen };
}
