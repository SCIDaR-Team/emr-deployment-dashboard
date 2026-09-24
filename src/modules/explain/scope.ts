import { BAND_LABEL } from '@/lib/bands';
import { GAP_AREA_BY_ID } from '@/lib/gapCatalogue';
import { DOMAIN_LABEL } from '@/lib/themes';
import type { FilterState } from '@/lib/types';

/**
 * The filter row in words, one line per filter that is narrowing anything —
 * part of what an explanation is told about where the reader is.
 */
export function describeFilters(f: FilterState): string[] {
  const lines: [string, string[]][] = [
    ['States', f.states],
    ['LGAs', f.lgas],
    ['Zones', f.zones],
    ['Setting', f.geography.map((g) => (g === 'rural' ? 'Rural' : 'Urban'))],
    ['Funding', f.funding],
    ['Functionality', f.functionalityLevels],
    ['Readiness', f.archetypes.map((b) => BAND_LABEL[b])],
    ['Domains', f.domains.map((d) => DOMAIN_LABEL[d])],
    ['Gap areas', f.gapAreas.map((id) => `${GAP_AREA_BY_ID[id]?.label ?? id} gap`)],
  ];
  const search = f.search.trim();
  if (search) lines.push(['Name contains', [`"${search.slice(0, 60)}"`]]);
  return lines
    .filter(([, values]) => values.length)
    .map(([label, values]) => `Filter — ${label}: ${values.join(', ')}`.slice(0, 240));
}
