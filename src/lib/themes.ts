/**
 * The five assessment domains.
 *
 * Sub-domains and indicators are deliberately absent. They existed to explain
 * how a score was arrived at, and this dashboard reports no scores — a domain
 * carries a band, and the band is the whole statement. Anything finer would be
 * a level of detail the band cannot support.
 */

import type {
  CoverageThemeId,
  InternetProviderGroup,
  InternetProviderId,
  ThemeId,
} from './types';

export interface ThemeDef {
  id: ThemeId;
  /** Letter used in the assessment's archetype rules (A–E). */
  code: 'A' | 'B' | 'C' | 'D';
  label: string;
  shortLabel: string;
  role: 'core' | 'supporting';
  questionCount: number;
  /** Icon name from lucide-react. */
  icon: string;
}

/**
 * The four domains, in the order the assessment reports them.
 *
 * There is no Leadership & Governance entry. It is assessed at state level, not
 * facility level, and the source dataset has no column for it — so every domain
 * here is a facility-level reading and `FACILITY_THEMES` is simply `THEMES`.
 */
export const THEMES: readonly ThemeDef[] = [
  {
    id: 'technical_infrastructure',
    code: 'A',
    label: 'Technical Infrastructure',
    shortLabel: 'Tech. Infrastructure',
    role: 'core',
    questionCount: 12,
    icon: 'Network',
  },
  {
    id: 'workforce_capacity',
    code: 'B',
    label: 'Workforce Capacity',
    shortLabel: 'Workforce',
    role: 'core',
    questionCount: 9,
    icon: 'Users',
  },
  {
    id: 'workflow_transition',
    code: 'C',
    label: 'Workflow & Transition',
    shortLabel: 'Workflow',
    role: 'supporting',
    questionCount: 10,
    icon: 'Workflow',
  },
  {
    id: 'data_use_reporting',
    code: 'D',
    label: 'Data Use & Reporting',
    shortLabel: 'Data Use',
    role: 'supporting',
    questionCount: 15,
    icon: 'BarChart3',
  },
] as const;

/** Every domain carries a facility-level band, so this is `THEMES`. Kept as a
 *  named export because the distinction it used to draw is worth being able to
 *  see was deliberately removed rather than forgotten. */
export const FACILITY_THEMES = THEMES;

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
  /** Icon name from lucide-react, resolved in `CoveragePane`. */
  icon: string;
  /**
   * What the figure is a share *of*, said under the bar.
   *
   * A percentage on its own has no denominator, and these two do not share one:
   * electricity is people with a supply, internet is subscriptions counted per
   * SIM. Printing "50.5%" and "53.3%" side by side without saying so invites
   * the reading that both are shares of the same population — which is the one
   * misreading `internetSubscriptionPct` must never be given.
   */
  caption: string;
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
    /**
     * The only figures under this domain, and the pair the band is made from.
     *
     * Network Coverage and Power sat here too, from the facility survey. They
     * were removed rather than left empty: Airtel and grid connection were
     * never collected, so both printed a dash on every area, and MTN
     * serviceability answers a question this page is not asking — the coverage
     * workbook, not the clinic survey, is what National Coverage reports.
     */
    id: 'population_access',
    themeId: 'technical_infrastructure',
    label: 'Access rates',
    note: 'Population with electricity, and active internet subscriptions per head.',
    measures: [
      {
        key: 'electricityAccessPct',
        label: 'Electricity',
        format: 'percent',
        icon: 'Zap',
        caption: 'of population with access',
      },
      {
        key: 'internetSubscriptionPct',
        label: 'Internet',
        format: 'percent',
        icon: 'Globe',
        /* Not "of population with access". Subscriptions are counted per SIM,
           so this is a rate per head that legitimately passes 100 — see the
           note on the field in types.ts. */
        caption: 'subscriptions per head',
      },
    ],
  },
  {
    id: 'staff',
    themeId: 'workforce_capacity',
    label: 'Staff',
    note: 'Health workforce headcount.',
    measures: [
      {
        key: 'staffCount',
        label: 'Staff',
        format: 'count',
        icon: 'Users',
        caption: 'health workers recorded',
      },
    ],
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

/**
 * The three access technologies the coverage workbook counts under, and the
 * operators it counts within each.
 *
 * Order and grouping are the sheet's own. The labels are not: the sheet writes
 * operators in caps ("21ST CENT") because it is a spreadsheet, and this is a
 * page.
 *
 * `mobile` is 99.8% of every subscription in the data. The other two groups are
 * kept regardless — that fixed broadband barely exists outside a handful of
 * states is a fact worth putting on the page when the question is whether a
 * clinic can hold a connection, not a small number to round away.
 */
export interface ProviderDef {
  id: InternetProviderId;
  label: string;
  /**
   * The chip drawn beside the name — one or two characters, not the label
   * truncated. "21" reads as 21st Century at 18px; "21s" reads as a mistake.
   */
  monogram: string;
  /**
   * The operator's own colours, where its identity is well enough established
   * to state without guessing.
   *
   * Literal hex, and deliberately not a theme token: these are facts about
   * companies, not decisions about this product, so they do not belong in the
   * palette and must not shift with the light/dark scheme — a brand read as
   * "the yellow one" is still the yellow one at night. Left undefined for the
   * operators whose marks we do not actually have, which draws a neutral tile
   * rather than inventing an identity for them.
   *
   * Contrast is checked at the pair, not the swatch: MTN's yellow carries black
   * and the rest carry white, all clearing 4.5:1 for the monogram.
   */
  brand?: { bg: string; fg: string };
  /**
   * Path to the operator's own artwork under `public/logos/`, where the file
   * has actually been supplied — see the README in that directory.
   *
   * Undefined for every operator until then, which is why nothing here
   * requests a missing file: the mark falls back to the monogram by not asking
   * for an image at all, rather than by handling a 404. Set this and the chip
   * draws the real logo instead.
   */
  logo?: string;
}

export const INTERNET_GROUPS: readonly {
  id: InternetProviderGroup;
  label: string;
  providers: readonly ProviderDef[];
}[] = [
  {
    id: 'mobile',
    label: 'Mobile',
    providers: [
      { id: 'mtn', label: 'MTN', monogram: 'M', brand: { bg: '#FFCC00', fg: '#0F1511' } },
      { id: 'airtel', label: 'Airtel', monogram: 'A', brand: { bg: '#E40000', fg: '#FFFFFF' } },
      // Ink monogram, not white, here and on Smile: both greens are bright
      // enough that white on them lands near 3:1, under the 4.5 an 8px bold
      // glyph needs. Ink clears it without touching the colour.
      { id: 'glo', label: 'Glo', monogram: 'G', brand: { bg: '#5AB447', fg: '#0F1511' } },
      // EMTS is the corporate name; the network trades as 9mobile, whose mark
      // is the one a reader would recognise — hence the monogram and the green.
      { id: 'emts', label: 'EMTS', monogram: '9', brand: { bg: '#006F51', fg: '#FFFFFF' } },
    ],
  },
  {
    id: 'fixed',
    label: 'Fixed broadband',
    providers: [
      { id: 'mtnFixed', label: 'MTN Fixed', monogram: 'M', brand: { bg: '#FFCC00', fg: '#0F1511' } },
      { id: 'ipnx', label: 'ipNX', monogram: 'ip' },
      { id: 'inq', label: 'INQ', monogram: 'IQ' },
    ],
  },
  {
    id: 'wifi',
    label: 'Enterprise wi-fi',
    providers: [
      { id: 'smile', label: 'Smile', monogram: 'S', brand: { bg: '#78BE43', fg: '#0F1511' } },
      /*
       * The pink of the four-diamond mark, deepened from the artwork's own
       * #E5217F. At the true value a white monogram measures 4.33:1 and an ink
       * one 4.37 — the colour sits in the gap where neither passes, so the
       * only way to keep the glyph legible is to take the hue a step darker.
       * The other three diamonds (green, amber, violet) are dropped: a chip
       * this size holds one colour, and the pink is the one the mark leads on.
       */
      { id: 'century21', label: '21st Century', monogram: '21', brand: { bg: '#D4176F', fg: '#FFFFFF' } },
      { id: 'ntel', label: 'NTEL', monogram: 'N' },
      // Not an operator at all — the sheet's catch-all column for everyone it
      // did not name. A neutral tile is the honest mark for it.
      { id: 'isp', label: 'ISP', monogram: '·' },
    ],
  },
];
