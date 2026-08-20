/**
 * Colour-scheme store. Not to be confused with assessment *thematic areas*
 * (src/lib/themes.ts) — this one is light/dark only.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ColorScheme = 'light' | 'dark' | 'system';

interface ThemeStore {
  scheme: ColorScheme;
  setScheme: (scheme: ColorScheme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      scheme: 'light',
      setScheme: (scheme) => set({ scheme }),
    }),
    { name: 'emr-theme' },
  ),
);

/** Apply the resolved scheme to <html>. Call once from App, and on change. */
export function applyColorScheme(scheme: ColorScheme): void {
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = scheme === 'dark' || (scheme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}
