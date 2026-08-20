/**
 * Two-way sync between the global filter state and the URL querystring, so a
 * scoped view (`?state=Kano,Kaduna&archetype=ready`) is a shareable deep link.
 *
 *   - on first mount, any filter keys in the URL hydrate the store
 *   - thereafter every store change is written back with `replace`, so the back
 *     button steps between pages rather than between filter keystrokes
 *
 * Mounted once, from the app shell.
 *
 * Adapted from `../NPHCDA_dashboard_int/src/hooks/useFilterUrlSync.ts`, whose
 * filters are single-valued strings; ours are arrays, so each key serialises as
 * a comma-joined list.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFilterStore } from '@/store/filterStore';
import { THEMES } from '@/lib/themes';
import type { Band, FilterState, FunctionalityLevel, ThemeId } from '@/lib/types';

/**
 * Short URL keys. Singular and lower-case — the querystring is read aloud in
 * meetings and pasted into documents, so `?state=Kano` beats `?states=Kano`.
 */
const KEYS = {
  states: 'state',
  lgas: 'lga',
  zones: 'zone',
  geography: 'geo',
  funding: 'funding',
  functionalityLevels: 'level',
  archetypes: 'archetype',
  search: 'q',
} as const;

type ArrayKey = Exclude<keyof typeof KEYS, 'search'>;

const ARRAY_KEYS = Object.keys(KEYS).filter((k) => k !== 'search') as ArrayKey[];

/** Per-theme band filters ride as `band.<themeId>`. */
const BAND_PREFIX = 'band.';
const THEME_IDS = THEMES.map((t) => t.id);

function serialise(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  for (const key of ARRAY_KEYS) {
    const values = f[key] as string[];
    if (values.length) p.set(KEYS[key], values.join(','));
  }
  if (f.search.trim()) p.set(KEYS.search, f.search.trim());
  for (const [themeId, bands] of Object.entries(f.bandByTheme)) {
    if (bands?.length) p.set(`${BAND_PREFIX}${themeId}`, bands.join(','));
  }
  return p;
}

function parse(params: URLSearchParams): Partial<FilterState> {
  const patch: Partial<FilterState> = {};
  const list = (key: string) =>
    (params.get(key) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  if (params.has(KEYS.states)) patch.states = list(KEYS.states);
  if (params.has(KEYS.lgas)) patch.lgas = list(KEYS.lgas);
  if (params.has(KEYS.zones)) patch.zones = list(KEYS.zones);
  if (params.has(KEYS.geography)) {
    patch.geography = list(KEYS.geography).filter(
      (v): v is 'rural' | 'urban' => v === 'rural' || v === 'urban',
    );
  }
  if (params.has(KEYS.funding)) {
    patch.funding = list(KEYS.funding).filter(
      (v): v is 'BHCPF' | 'non-BHCPF' => v === 'BHCPF' || v === 'non-BHCPF',
    );
  }
  if (params.has(KEYS.functionalityLevels)) {
    patch.functionalityLevels = list(KEYS.functionalityLevels) as FunctionalityLevel[];
  }
  if (params.has(KEYS.archetypes)) patch.archetypes = list(KEYS.archetypes) as Band[];
  if (params.has(KEYS.search)) patch.search = params.get(KEYS.search) ?? '';

  const bandByTheme: Partial<Record<ThemeId, Band[]>> = {};
  for (const themeId of THEME_IDS) {
    const key = `${BAND_PREFIX}${themeId}`;
    if (params.has(key)) bandByTheme[themeId] = list(key) as Band[];
  }
  if (Object.keys(bandByTheme).length) patch.bandByTheme = bandByTheme;

  return patch;
}

export function useFilterUrlSync(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const hydrate = useFilterStore((s) => s.hydrate);
  const hydrated = useRef(false);

  // Hydrate from the URL once. A shared link must win over whatever the store
  // persisted from the recipient's own last session.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const patch = parse(searchParams);
    if (Object.keys(patch).length) hydrate(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror store → URL on every change.
  //
  // This MUST read the filter through a render rather than through a one-shot
  // store subscription with empty deps. React Router's `setSearchParams` issues
  // a *relative* navigation, resolved against the pathname baked into the
  // closure when it was created. A setter captured once on mount stays pinned to
  // whatever page the app first loaded, and every later filter change silently
  // teleports the user back to it. This is a filter writing the querystring; it
  // must never change the path.
  //
  // Each slice is selected on its own rather than as one object: a selector
  // returning a fresh object every render fails zustand's Object.is equality
  // check and re-renders forever. Arrays in the store keep their identity until
  // they actually change.
  const states = useFilterStore((s) => s.states);
  const lgas = useFilterStore((s) => s.lgas);
  const zones = useFilterStore((s) => s.zones);
  const geography = useFilterStore((s) => s.geography);
  const funding = useFilterStore((s) => s.funding);
  const functionalityLevels = useFilterStore((s) => s.functionalityLevels);
  const archetypes = useFilterStore((s) => s.archetypes);
  const bandByTheme = useFilterStore((s) => s.bandByTheme);
  const search = useFilterStore((s) => s.search);

  const serialised = serialise({
    states,
    lgas,
    zones,
    geography,
    funding,
    functionalityLevels,
    archetypes,
    bandByTheme,
    search,
  }).toString();

  useEffect(() => {
    if (!hydrated.current) return;
    // Preserve params this hook does not own — the explorer keeps its geographic
    // and thematic selection in the same querystring.
    const next = new URLSearchParams(window.location.search);
    for (const key of [...next.keys()]) {
      if (Object.values(KEYS).includes(key as never) || key.startsWith(BAND_PREFIX)) {
        next.delete(key);
      }
    }
    for (const [k, v] of new URLSearchParams(serialised)) next.set(k, v);

    if (next.toString() !== new URLSearchParams(window.location.search).toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [serialised, setSearchParams]);
}
