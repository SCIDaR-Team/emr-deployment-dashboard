/**
 * Sidebar navigation.
 *
 * Four modules, and the shortness is the design rather than a stage of it.
 * The sibling assessment dashboard carries seven; this one answers four
 * questions and stops — where the country stands, what the visited states
 * showed, what deploying will take, and what a given amount of funding would
 * buy. Anything that does not serve one of those four does not get a rail
 * entry.
 *
 * Scenarios was a section of the Investment Plan and is a module because it
 * is a tool rather than a reading: the plan is fixed by what the assessment
 * found, and the builder is driven by the reader.
 *
 * The landing page at `/` is not in this list: it sits outside the shell, and
 * the way back to it is the wordmark above the rail, not a nav item. The rail's
 * first stop is National Coverage, which is also where the landing page's
 * primary CTA lands — there is no separate overview page to pass through.
 */

export interface NavItem {
  path: string;
  label: string;
  /** lucide-react icon name, resolved in Sidebar.tsx. */
  icon: string;
  /** The line under the label on the landing page's card. Says what this
   *  page has that the others do not — never a restatement of the label — and
   *  in about 25 characters, which is what one line of a card holds with four
   *  of them beside the wordmark. */
  description: string;
  /** Shown as a launcher card on the landing page. */
  showOnHome: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/states',
    label: 'National Coverage',
    icon: 'Map',
    description: 'Every state, by maturity',
    showOnHome: true,
  },
  {
    path: '/assessment',
    label: 'Assessed States',
    icon: 'BarChart3',
    description: '12 states, down to LGA',
    showOnHome: true,
  },
  {
    path: '/investment',
    label: 'Investments overview',
    icon: 'Coins',
    description: 'What deployment will cost',
    showOnHome: true,
  },
  {
    path: '/scenarios',
    label: 'Investment Scenario Planner',
    icon: 'SlidersHorizontal',
    description: 'What funding makes Ready',
    showOnHome: true,
  },
];

/** The module a pathname belongs to, for the rail's active state and the
 *  mobile bar's title. Longest match wins so `/assessment/kano/dala` stays on
 *  Assessed States. */
export function moduleFor(path: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => path === item.path || path.startsWith(`${item.path}/`));
}
