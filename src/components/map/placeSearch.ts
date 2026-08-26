/**
 * Ranking name matches for the map's locator.
 *
 * Split from `MapSearch.tsx` for the reason `coordinates.ts` and `mapTypes.ts`
 * are split from theirs: a module that exports both components and plain
 * functions loses fast refresh, and both pages import this to build their
 * result lists.
 */

/**
 * A prefix match beats a match in the middle of the name, and at equal quality
 * a shorter name beats a longer one — so "Kano" typed in full puts the state
 * Kano above "Kano Municipal", which is what the reader almost always meant.
 * Without it an alphabetical list buries the exact match under its own
 * compounds.
 *
 * Shared so both pages rank identically; a locator that orders results
 * differently depending on which page it is on is two locators.
 */
export function rankByName<T>(items: T[], query: string, nameOf: (item: T) => string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored: { item: T; score: number; length: number }[] = [];
  for (const item of items) {
    const name = nameOf(item).toLowerCase();
    const at = name.indexOf(needle);
    if (at === -1) continue;
    // 0 = exact, 1 = starts with, 2 = contains.
    const score = name === needle ? 0 : at === 0 ? 1 : 2;
    scored.push({ item, score, length: name.length });
  }
  scored.sort((a, b) => a.score - b.score || a.length - b.length);
  return scored.map((s) => s.item);
}
