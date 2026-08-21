/**
 * The five assessment domains.
 *
 * Sub-domains and indicators are deliberately absent. They existed to explain
 * how a score was arrived at, and this dashboard reports no scores — a domain
 * carries a band, and the band is the whole statement. Anything finer would be
 * a level of detail the band cannot support.
 */

import type { CoverageThemeId, ThemeId } from './types';

export interface ThemeDef {
  id: ThemeId;
  /** Letter used in the assessment's archetype rules (A–E). */
  code: 'A' | 'B' | 'C' | 'D' | 'E';
  label: string;
  shortLabel: string;
  role: 'core' | 'supporting';
  /** False for Leadership & Governance, which has no facility instrument. */
  facilityLevel: boolean;
  questionCount: number;
  /** Icon name from lucide-react. */
  icon: string;
}

/**
 * Naming note: the deck says "Leadership & Governance", the rubric says
 * "Leadership and Coordination", the Figma says "Leadership and governance".
 * The FRS wording wins for display; the aliases are resolved during ETL.
 */
export const THEMES: readonly ThemeDef[] = [
  {
    id: 'technical_infrastructure',
    code: 'A',
    label: 'Technical Infrastructure',
    shortLabel: 'Tech. Infrastructure',
    role: 'core',
    facilityLevel: true,
    questionCount: 12,
    icon: 'Network',
  },
  {
    id: 'workforce_capacity',
    code: 'B',
    label: 'Workforce Capacity',
    shortLabel: 'Workforce',
    role: 'core',
    facilityLevel: true,
    questionCount: 9,
    icon: 'Users',
  },
  {
    id: 'workflow_transition',
    code: 'C',
    label: 'Workflow & Transition',
    shortLabel: 'Workflow',
    role: 'supporting',
    facilityLevel: true,
    questionCount: 10,
    icon: 'Workflow',
  },
  {
    id: 'data_use_reporting',
    code: 'D',
    label: 'Data Use & Reporting',
    shortLabel: 'Data Use',
    role: 'supporting',
    facilityLevel: true,
    questionCount: 15,
    icon: 'BarChart3',
  },
  {
    id: 'leadership_governance',
    code: 'E',
    label: 'Leadership & Governance',
    shortLabel: 'Leadership',
    role: 'core',
    facilityLevel: false,
    questionCount: 14,
    icon: 'ShieldCheck',
  },
] as const;

export const FACILITY_THEMES = THEMES.filter((t) => t.facilityLevel);

export const THEME_BY_ID: Record<ThemeId, ThemeDef> = Object.fromEntries(
  THEMES.map((t) => [t.id, t]),
) as Record<ThemeId, ThemeDef>;

// ---------------------------------------------------------------------------
// Sub-domains
// ---------------------------------------------------------------------------

/**
 * What sits beneath the two coverage domains.
 *
 * Declared rather than hard-coded into the pane so the National Coverage panel
 * renders whatever is defined here: filter by `themeId` when a domain lens is
 * active, render everything when it is not. Adding a sub-domain is a table
 * entry, not a component change.
 *
 * Note there is no `band` anywhere in this shape, by design — see
 * `CoverageMeasures` in types.ts. A sub-domain has figures and nothing else.
 */
export interface MeasureDef {
  /** Key on `AreaProfile.measures`. */
  key: keyof import('./types').CoverageMeasures;
  label: string;
  format: 'percent' | 'count';
}

export interface SubDomainDef {
  id: string;
  themeId: CoverageThemeId;
  label: string;
  /** One line saying what the figures beneath actually measure. */
  note: string;
  measures: MeasureDef[];
}

export const SUB_DOMAINS: readonly SubDomainDef[] = [
  {
    id: 'network_coverage',
    themeId: 'technical_infrastructure',
    label: 'Network Coverage',
    note: 'Share of the area with mobile network coverage, by operator.',
    measures: [
      { key: 'networkMtnPct', label: 'MTN', format: 'percent' },
      { key: 'networkAirtelPct', label: 'Airtel', format: 'percent' },
    ],
  },
  {
    id: 'power',
    themeId: 'technical_infrastructure',
    label: 'Power',
    note: 'Share of the area connected to the national grid.',
    measures: [{ key: 'gridConnectionPct', label: 'Grid connection', format: 'percent' }],
  },
  {
    id: 'staff',
    themeId: 'workforce_capacity',
    label: 'Staff',
    note: 'Health workforce headcount.',
    measures: [{ key: 'staffCount', label: 'Staff', format: 'count' }],
  },
];

/** The two domains National Coverage reports, in rail order. */
export const COVERAGE_THEMES = THEMES.filter(
  (t): t is ThemeDef & { id: CoverageThemeId } =>
    t.id === 'technical_infrastructure' || t.id === 'workforce_capacity',
);

export function subDomainsFor(themeId: CoverageThemeId): SubDomainDef[] {
  return SUB_DOMAINS.filter((s) => s.themeId === themeId);
}
