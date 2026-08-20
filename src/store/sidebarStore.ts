/**
 * Collapsed state of the desktop navigation rail.
 *
 * Persisted, because collapsing is a workspace preference rather than a
 * per-visit one: these stakeholders present from this dashboard on projectors
 * where the map wants every pixel it can get, and re-collapsing the rail on
 * every load would be its own small tax.
 *
 * Only the `lg` rail reads this. The mobile panel is always fully labelled —
 * see the note on `Sidebar`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarStore {
  collapsed: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    { name: 'emr-sidebar' },
  ),
);
