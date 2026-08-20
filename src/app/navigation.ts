/**
 * Sidebar navigation.
 *
 * Three modules, and the shortness is the design rather than a stage of it.
 * The sibling assessment dashboard carries seven; this one answers three
 * questions and stops — where the country stands, what the visited states
 * showed, and what deploying will take. Anything that does not serve one of
 * those three does not get a rail entry.
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
  /** One line under the page title. Says what this page has that the others
   *  do not — never a restatement of the label. */
  description: string;
  /** Shown as a launcher card on the landing page. */
  showOnHome: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/states',
    label: 'National Coverage',
    icon: 'Map',
    description: 'All 37 states and how each was evidenced',
    showOnHome: true,
  },
  {
    path: '/assessment',
    label: 'Assessed States',
    icon: 'BarChart3',
    description: 'The 12 states visited, down to LGA',
    showOnHome: true,
  },
  {
    path: '/investment',
    label: 'Investment Plan',
    icon: 'Coins',
    description: 'What deployment will take, itemised',
    showOnHome: true,
  },
];

/** Order for the circular next-arrow walkthrough in the page header. Follows
 *  the rail, so "next" means the item below the one you are on. */
export const MODULE_ORDER = NAV_ITEMS.map((item) => item.path);

export function nextModule(path: string): string | null {
  // Deep routes (`/assessment/kano`) should still resolve to their module's
  // successor rather than falling off the end.
  const i = MODULE_ORDER.findIndex((p) => path === p || path.startsWith(`${p}/`));
  if (i === -1 || i === MODULE_ORDER.length - 1) return null;
  return MODULE_ORDER[i + 1] ?? null;
}

/** The module a pathname belongs to, for the rail's active state and the
 *  mobile bar's title. Longest match wins so `/assessment/kano/dala` stays on
 *  Assessed States. */
export function moduleFor(path: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => path === item.path || path.startsWith(`${item.path}/`));
}
