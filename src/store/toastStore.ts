import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastStore {
  toasts: Toast[];
  /** Returns the id, so a caller can dismiss a long-running toast itself. */
  push: (toast: Omit<Toast, 'id'> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/** Errors stay until dismissed; everything else clears itself. */
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 0,
};

let sequence = 0;

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],

  push: ({ durationMs, ...toast }) => {
    const id = `toast-${++sequence}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));

    const ms = durationMs ?? DEFAULT_DURATION[toast.tone];
    if (ms > 0) window.setTimeout(() => get().dismiss(id), ms);
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Convenience wrappers, so callers never assemble a toast object by hand. */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'error', title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'warning', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'info', title, description }),
};
