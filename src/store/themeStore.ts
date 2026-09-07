/**
 * Colour-scheme store. Not to be confused with assessment *thematic areas*
 * (src/lib/themes.ts) — this one is light/dark only.
 */

import { useEffect, useState } from 'react';
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

/**
 * The resolved scheme as a boolean, for the handful of places that need the
 * *value* rather than a CSS class.
 *
 * Almost everything in this app themes itself through Tailwind's `dark:`
 * variant off the class `applyColorScheme` sets, and should keep doing so. This
 * exists for the one thing a class cannot reach: a raster tile URL. CARTO
 * publishes light and dark builds of Positron at two different paths, so the
 * base map has to be *requested* differently rather than merely restyled — see
 * `BaseMapSource.tile.dark`.
 *
 * Tracks the media query as well as the store, so a reader on `system` who
 * changes their OS appearance gets new tiles without a reload.
 */
export function useIsDark(): boolean {
  const scheme = useThemeStore((s) => s.scheme);
  const [prefersDark, setPrefersDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return scheme === 'dark' || (scheme === 'system' && prefersDark);
}
