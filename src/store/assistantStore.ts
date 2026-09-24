import { create } from 'zustand';

/**
 * Whether the "Ask the data" panel is open.
 *
 * Shared because the button that opens it lives in the page header (and the
 * phone's top bar) while the panel itself is mounted once in the app shell.
 * Not persisted: the conversation survives a reload, but the panel starts
 * closed, so a page never opens half-covered.
 */
interface AssistantStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useAssistantStore = create<AssistantStore>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

/** The assistant is shown under `npm run dev`, where the dev server serves its
 *  endpoint, and in a build only when the deployment has the endpoint. */
export const ASSISTANT_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ASSISTANT_ENABLED === 'true';
