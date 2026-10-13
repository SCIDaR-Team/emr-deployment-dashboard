import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Compass,
  Landmark,
  Map,
  MapPin,
  Menu,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { NAV_ITEMS } from '@/app/navigation';
import { Backdrop } from './Backdrop';
import { InstitutionMark } from '@/components/layout/InstitutionMark';
import { useDataContext } from '@/state/dataContext';
import { BAND_CLASSES, BAND_LABEL, MATURITY_LABEL, MATURITY_NO_DATA } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { useCountUp } from '@/hooks/useCountUp';
import { useDismissable } from '@/hooks/useDismissable';
import { COVERAGE, INSTITUTION } from '@/lib/constants';
import { formatCount, percentOf } from '@/lib/format';
import {
  MATURITY_STATES,
  NATIONAL_DEPLOYMENT_SPLIT,
  NATIONAL_MATURITY_SPLIT,
  NATIONAL_TOTAL,
} from '@/lib/nationalSplit';
import type { Band } from '@/lib/types';

/**
 * Landing page — the front door, at `/`.
 *
 * Sits outside the AppShell: no navigation rail, no filter bar. Every figure on
 * it is available synchronously — the coverage numbers from `constants.ts`, the
 * band splits from the generated `nationalSplit.ts` — so the page paints in one
 * pass while DataProvider warms the datasets behind it. Nothing here waits on a
 * fetch, and nothing here fills in late.
 *
 * **Top to bottom:** a white top bar with the modules as text links; the hero
 * — the question, the finding that answers it, one way in, and the coverage
 * it rests on — beside the facility readiness card; State maturity beside
 * "Explore the assessment", which says in a sentence what each module is
 * *for*; a footer with the scope note.
 *
 * **One screen.** The page lands inside a laptop viewport without scrolling
 * — checked at 1280×720, 1366×680, 1440×790 and 1536×740 — and that
 * constraint is the design: a front door that needs scrolling has asked the
 * reader for something before telling them anything. Spacing, the headline
 * and the waffle are sized off the viewport's height so they give where a
 * screen is short, and the column is centred where it is tall. The structure
 * is `flex-col` with `min-h-screen` rather than a hard `h-screen`, so a
 * genuinely short viewport scrolls instead of clipping: never hide content to
 * protect a layout.
 *
 * Holding one screen is also why the two measures are defined in the
 * subtitles of the cards that report them rather than in a strip of their
 * own, and why the coverage figures sit under the headline.
 *
 * **The finding leads; the question introduces it.** The question is the
 * line above the headline, in the eyebrow's place, so a first-time reader
 * knows what is being answered; the headline is the answer — readers from
 * NPHCDA already know the question.
 *
 * **Counts lead, percentages support.** The three band blocks read 170 / 1,892 /
 * 744 before they read 6.1 / 67.4 / 26.5. Facilities are the unit the
 * programme acts in — a rollout is planned, costed and staffed per facility,
 * not per percentage point — so the absolute is the headline, carrying the band
 * name beside it, and the share is what gives it scale on the line beneath.
 *
 * **One reading, and it is deployment.** Every facility figure here is
 * `NATIONAL_DEPLOYMENT_SPLIT`, and every module behind the door reports the
 * same one.
 *
 * **On the palette.** Green, amber and red are *status* here, and green is
 * Ready — so the frame's green is a different one: the cool mint the whole
 * app's frame uses (hue ~150, well away from Ready's 96.7). Status colour is
 * spent only on the bands and the figures reporting them: the Explore list's
 * glyphs sit in the frame's mint, not in three status colours, because none of
 * the three modules is a status.
 */

const ICONS: Record<string, LucideIcon> = {
  Map,
  BarChart3,
  Coins,
  SlidersHorizontal,
};

/**
 * The page's horizontal measure.
 *
 * Wider than the 1152px the page used to hold itself to, which left a 13"
 * laptop with a gutter the size of the waffle on each side. Prose stays inside
 * its own `max-w-[Nch]` caps — only the grids stretch.
 */
const SHELL = 'mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 xl:px-14';

/**
 * A white card on the page's mint, as every panel on the page is.
 *
 * Outlined in the frame's green at a quarter strength rather than the app's
 * grey hairline: on a mint ground the grey line all but vanished, and a white
 * card on pale mint needs its edge drawn.
 */
const CARD =
  'rounded-[14px] border border-chrome-ink/25 bg-surface shadow-[0_1px_2px_hsl(160_20%_20%/0.05),0_8px_24px_-12px_hsl(160_30%_20%/0.12)]';

/**
 * A band's count, counted up from zero when the page first paints.
 *
 * Its own component because the three bands are rendered from a `.map`, and a
 * hook cannot be called from inside that callback.
 *
 * The three run together and land together — they are one reading in three
 * parts, and the whole point of the row is that 170, 1,892 and 744 are read
 * against each other. Staggering them would turn a comparison into a sequence.
 *
 * The share underneath does not animate. Two numbers moving in the same block
 * is a block that cannot be read while it settles, and the count is the one
 * carrying the finding.
 */
function BandCount({ value }: { value: number }) {
  const shown = useCountUp(value);
  return <span className="text-figure leading-none">{formatCount(Math.round(shown))}</span>;
}

/** Best case first — the waffle reads top-left to bottom-right. */
const BAND_ORDER: readonly Band[] = ['ready', 'moderately_ready', 'not_ready'] as const;

/** Each band's badge: a glyph that carries the band without its colour. */
const BAND_ICON: Record<Band, LucideIcon> = {
  ready: Check,
  moderately_ready: Clock3,
  not_ready: AlertTriangle,
};
const BAND_SOLID: Record<Band, string> = {
  ready: 'bg-ready-ink',
  moderately_ready: 'bg-moderate-ink',
  not_ready: 'bg-notready-ink',
};

/**
 * The band inks taken a step towards the text colour, for the band's words
 * and figures on this page.
 *
 * The app's inks are tuned for chroma, and amber pays for it: 3.1:1 on white
 * and 2.9:1 on its own wash, which on this page is a small label on a pale
 * tile — the reading people said they could not make out. Mixed with
 * `--foreground` rather than with black, so in the dark scheme, where the
 * foreground is near-white, the same mix lifts the ink instead of burying it.
 * Amber is mixed furthest because it starts lightest; Ready and Not ready
 * only enough to clear small-text contrast on their washes. Local to the
 * landing page: the panes inside the app carry their band almost entirely
 * as text and need the brighter ink to keep their colour.
 */
const BAND_DEEP: Record<Band, string> = {
  ready: 'text-[color-mix(in_srgb,hsl(var(--ready-ink))_78%,hsl(var(--foreground)))]',
  moderately_ready:
    'text-[color-mix(in_srgb,hsl(var(--moderate-ink))_62%,hsl(var(--foreground)))]',
  not_ready: 'text-[color-mix(in_srgb,hsl(var(--not-ready-ink))_80%,hsl(var(--foreground)))]',
};

/**
 * What each band needs, in a few words — the team's "How Facility Readiness
 * Is Measured" cut to what fits under a count: minor fixes such as wiring or
 * devices; moderate upgrades such as a router or a solar top-up; major
 * investment such as a full solar system or satellite connectivity.
 */
const BAND_NEEDS: Record<Band, string> = {
  ready: 'Minor fixes',
  moderately_ready: 'Moderate upgrades',
  not_ready: 'Major investment',
};

/**
 * "Explore the assessment": each module behind the door, named by what a
 * reader does there rather than by what the page is called. National Coverage
 * is not in the list — it is the hero's button and State maturity's "View all
 * states", one click from wherever the reader is looking.
 */
const EXPLORE: { path: string; title: string; text: string }[] = [
  {
    path: '/assessment',
    title: 'Compare assessed states',
    text: 'Facility readiness in the 12 states visited, down to the facility.',
  },
  {
    path: '/investment',
    title: 'Estimate deployment investment',
    text: 'What closing the gaps will cost, itemised.',
  },
  {
    path: '/scenarios',
    title: 'Test funding scenarios',
    text: 'What different levels of funding would make Ready.',
  },
];

const MODULES = NAV_ITEMS.filter((mod) => mod.showOnHome);

const ARCHETYPES = NATIONAL_DEPLOYMENT_SPLIT;
const SCORED_TOTAL = NATIONAL_TOTAL;

/** The states the desk review covered: every one the survey did not visit,
 *  which is 24 states and the FCT. */
const DESK_STATES = COVERAGE.statesTotal - COVERAGE.statesPrimary - 1;

/**
 * Hundred tiles apportioned by largest remainder.
 *
 * Rounding each share independently is not guaranteed to total 100 — three
 * roundings that go the same way leave a hole or an extra tile, and a waffle
 * that is not exactly a hundred squares silently stops meaning "one tile is one
 * per cent".
 */
function waffleTiles(): Band[] {
  const parts = BAND_ORDER.map((band) => {
    const exact = (ARCHETYPES[band] / SCORED_TOTAL) * 100;
    return { band, exact, tiles: Math.floor(exact) };
  });

  let remainder = 100 - parts.reduce((sum, p) => sum + p.tiles, 0);
  [...parts]
    .sort((a, b) => b.exact - b.tiles - (a.exact - a.tiles))
    .forEach((p) => {
      if (remainder > 0) {
        p.tiles += 1;
        remainder -= 1;
      }
    });

  return parts.flatMap((p) => Array.from({ length: p.tiles }, () => p.band));
}

/**
 * The top bar: the product's name, and the modules as plain text links.
 *
 * Text rather than cards because four cards did not fit beside the name
 * without cutting their words short, and a fifth module would not fit at all.
 * The links say what each module is called; what each is *for* is the Explore
 * list's job further down, where there is room to say it.
 *
 * The labels are the rail's own, so a reader who clicks "Investment Plan" here
 * lands on a page the rail also calls Investment Plan. The underline marks the
 * current module, the rail's active treatment turned on its side — on this page
 * nothing is current, so it shows only on hover and focus.
 *
 * Below `lg` the four links do not fit beside the name, so they fold into a
 * menu: a button that drops the same links, each with its one-line description,
 * under the bar.
 */
function TopBar() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div ref={ref} className="relative">
        {/* A notch shorter on a short screen, where every row counts
            towards the page holding one. */}
        <div className={cn(SHELL, 'flex h-14 items-center gap-6 tall:h-16')}>
          <Link
            to="/"
            className="flex min-w-0 shrink-0 items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <InstitutionMark />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-lead font-bold tracking-tight text-chrome-ink">
                EMR Readiness Assessment
              </span>
              <span className="mt-1 text-tick font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {INSTITUTION.abbr} · Nigeria
              </span>
            </span>
          </Link>

          {/* Pills rather than bare words: on a page this busy, grey text
              links read as a caption and got missed. Each is a mint lozenge
              with its module's glyph, deepening on hover — plainly something
              to press, and still quieter than the hero's one solid button. */}
          <nav aria-label="Dashboard modules" className="ml-auto hidden lg:block">
            <ul className="flex items-center gap-2">
              {MODULES.map((mod) => {
                const Icon = ICONS[mod.icon] ?? Map;
                return (
                  <li key={mod.path}>
                    <NavLink
                      to={mod.path}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-prose font-semibold ring-1 transition-colors',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          isActive
                            ? 'bg-sidebar text-sidebar-foreground ring-sidebar'
                            : 'bg-chrome-active/60 text-chrome-active-foreground ring-chrome-ink/20 hover:bg-chrome-active hover:ring-chrome-ink/40',
                        )
                      }
                    >
                      <Icon className="hidden h-4 w-4 shrink-0 xl:block" aria-hidden />
                      {mod.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>

        {open && (
          <nav
            id="landing-menu"
            aria-label="Dashboard modules"
            className="absolute inset-x-0 top-full border-b border-border bg-surface shadow-lg lg:hidden"
          >
            <ul className={cn(SHELL, 'py-2')}>
              {MODULES.map((mod) => {
                const Icon = ICONS[mod.icon] ?? Map;
                return (
                  <li key={mod.path}>
                    <Link
                      to={mod.path}
                      onClick={close}
                      className="flex items-center gap-3 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-muted"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-chrome-active/60 text-chrome-ink">
                        <Icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="text-prose font-semibold text-foreground">{mod.label}</span>
                        <span className="text-note text-muted-foreground">{mod.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}

/**
 * Facility readiness: the three bands as counts, then the hundred-tile waffle
 * that shows them as one whole.
 *
 * Counts first because they are the finding; the waffle second because it is
 * the picture of it — one tile per cent, best to worst, so the thin green
 * start and the long amber middle read before any label does.
 */
function ReadinessCard() {
  const tiles = useMemo(waffleTiles, []);
  return (
    <section aria-labelledby="facilities-assessed" className={cn(CARD, 'flex flex-col p-4')}>
      <div className="flex items-center gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chrome-active/60 text-chrome-ink">
          <BarChart3 className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="facilities-assessed" className="text-lead font-bold leading-tight text-foreground">
            {formatCount(SCORED_TOTAL)} facilities assessed
          </h2>
          {/* What facility readiness measures, said where its figures are. */}
          <p className="mt-0.5 text-body text-muted-foreground">
            Technical infrastructure and the upgrades it needs, in the {COVERAGE.statesPrimary}{' '}
            states surveyed
          </p>
        </div>
      </div>

      {/* Count first, then the band's name in its own ink, then the share and
          what the band needs: the word beside the figure carries the band —
          and the glyph beside the word, so the reading survives greyscale.
          The glyph sits on the label's line rather than as a badge beside the
          count, which on a laptop pushed "MODERATELY READY" onto a second line
          and the page past one screen. Divided by rules rather than boxed —
          one sentence in three parts. */}
      <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-3">
        {BAND_ORDER.map((band, i) => {
          const count = ARCHETYPES[band];
          const Icon = BAND_ICON[band];
          return (
            <div key={band} className={cn('min-w-0', i > 0 && 'sm:border-l sm:border-border sm:pl-5')}>
              <p className={cn('font-extrabold tracking-tight', BAND_DEEP[band])}>
                <BandCount value={count} />
                <span className="mt-2 flex items-start gap-1.5 text-note font-extrabold uppercase leading-tight tracking-[0.03em] xl:items-center xl:whitespace-nowrap xl:leading-none">
                  <span
                    className={cn('grid h-4 w-4 shrink-0 place-items-center rounded-full', BAND_SOLID[band])}
                  >
                    <Icon className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden />
                  </span>
                  {BAND_LABEL[band]}
                </span>
              </p>
              <p className="mt-1.5 text-body font-medium text-foreground/75">
                <strong className={cn('font-extrabold', BAND_DEEP[band])}>
                  {((count / SCORED_TOTAL) * 100).toFixed(1)}%
                </strong>{' '}
                of facilities
              </p>
              <p className="mt-0.5 text-body font-semibold text-foreground/85">
                {BAND_NEEDS[band]}
              </p>
            </div>
          );
        })}
      </div>

      {/* A hundred tiles, one per cent each, best to worst, twenty-five
          across, in rows sized off the viewport's height so the page holds
          one screen. Ruled off at the foot of the card: when the hero beside
          it is the taller, the space reads as deliberate between two sections
          rather than as a hole in one. */}
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-border pt-3">
          <p className="text-note text-muted-foreground">
            Each tile is one per cent of the facilities assessed.
          </p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-note text-muted-foreground">
            {BAND_ORDER.map((band) => (
              <li key={band} className="flex items-center gap-1.5">
                <span aria-hidden className={cn('block h-2.5 w-2.5 rounded-[3px]', BAND_CLASSES[band].bg)} />
                {BAND_LABEL[band]}
              </li>
            ))}
          </ul>
        </div>
        <div
          className="mt-2.5 grid grid-cols-[repeat(25,minmax(0,1fr))] grid-rows-[repeat(4,clamp(0.6rem,1.6vh,0.95rem))] gap-[3px]"
          role="img"
          aria-label={BAND_ORDER.map(
            (b) => `${BAND_LABEL[b]}: ${tiles.filter((t) => t === b).length} per cent`,
          ).join(', ')}
        >
          {tiles.map((band, i) => (
            <span key={i} className={cn('block h-full rounded-[2px]', BAND_CLASSES[band].bg)} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * State Maturity as four counts: Mature, Moderately mature, Not mature, and the
 * states the sheet has not scored. The last is a tile like the others rather
 * than left out — three tiles alone read as a national finding over 37 when
 * they are a finding over the states scored.
 */
function MaturityCard() {
  const scored = BAND_ORDER.reduce((sum, b) => sum + NATIONAL_MATURITY_SPLIT[b], 0);
  const tiles = [
    ...BAND_ORDER.map((b) => ({
      key: b,
      count: NATIONAL_MATURITY_SPLIT[b],
      label: MATURITY_LABEL[b],
      wash: BAND_CLASSES[b].wash,
      ink: BAND_DEEP[b],
      rule: BAND_CLASSES[b].bg,
    })),
    {
      key: 'unassessed',
      count: MATURITY_STATES - scored,
      label: MATURITY_NO_DATA,
      wash: 'bg-muted',
      ink: 'text-foreground',
      rule: 'bg-nodata',
    },
  ];
  return (
    <section aria-labelledby="state-maturity" className={cn(CARD, 'flex flex-col p-4')}>
      <div className="flex items-center gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chrome-active/60 text-chrome-ink">
          <Landmark className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="state-maturity" className="text-lead font-bold leading-tight text-foreground">
            State maturity
          </h2>
          {/* What state maturity measures, said where its figures are. 37
              counts the FCT, so it is 36 states and the FCT. */}
          <p className="mt-0.5 text-body text-muted-foreground">
            Leadership, governance and infrastructure to sustain an EMR, in all{' '}
            {formatCount(MATURITY_STATES - 1)} states and the FCT
          </p>
        </div>
        <Link
          to="/states"
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-body font-semibold text-chrome-ink hover:underline"
        >
          View all states
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ul className="mt-3 grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.key} className={cn('flex flex-col rounded-[10px] px-3.5 py-3', t.wash)}>
            <span className={cn('text-figure-sm font-extrabold leading-none tracking-tight', t.ink)}>
              {t.count}
            </span>
            <span className={cn('mt-1.5 text-body font-bold leading-tight', t.ink)}>
              {t.label}
            </span>
            <span className="mt-0.5 text-body font-medium text-foreground/75">
              {percentOf(t.count, MATURITY_STATES, 1)} of states
            </span>
            <span aria-hidden className="mt-auto block pt-2.5">
              <span className={cn('block h-[3px] w-9 rounded-full', t.rule)} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The three tools behind the door, each named by what a reader does there. */
function ExploreCard() {
  const byPath = Object.fromEntries(NAV_ITEMS.map((m) => [m.path, m]));
  return (
    <section aria-labelledby="explore" className={cn(CARD, 'flex flex-col p-4')}>
      <div className="flex items-center gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chrome-active/60 text-chrome-ink">
          <Compass className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="explore" className="text-lead font-bold leading-tight text-foreground">
            Explore the assessment
          </h2>
          <p className="mt-0.5 text-body text-muted-foreground">
            Tools to inform planning and investment
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-1 flex-col divide-y divide-border rounded-[10px] border border-border">
        {EXPLORE.map((item) => {
          const Icon = ICONS[byPath[item.path]?.icon ?? ''] ?? Map;
          return (
            <li key={item.path} className="flex flex-1">
              <Link
                to={item.path}
                className="group flex w-full items-center gap-3 px-3.5 py-1.5 transition-colors first:rounded-t-[10px] hover:bg-chrome-active/30 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-chrome-active/60 text-chrome-ink">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                {/* Title and description on one line where the card is wide
                    enough, which keeps the three rows to the height of the
                    maturity tiles beside them. */}
                <span className="flex min-w-0 flex-1 flex-col leading-tight wide:flex-row wide:items-baseline wide:gap-2">
                  <span className="shrink-0 text-prose font-semibold text-foreground">{item.title}</span>
                  <span className="mt-0.5 text-note text-muted-foreground wide:mt-0 wide:truncate">
                    {item.text}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function LandingPage() {
  const { national } = useDataContext();

  /**
   * LGAs the survey *reached*, not LGAs that exist.
   *
   * This read `lgas.data.length`, which is every LGA in the country — the
   * dataset carries all 774 so the national map has something to draw for the
   * desk-reviewed states, and 469 of those rows hold no facilities at all. The
   * tile therefore claimed the survey covered 774 LGAs the moment the fetch
   * landed, having briefly and correctly said 305 before it. `assessedLgaCount`
   * is the ingest's own count of the reached ones.
   */
  const lgaCount = national.data?.assessedLgaCount ?? COVERAGE.lgas;

  /** Widest scope first, narrowing left to right: the whole country, the part
   *  of it visited, and what that visit reached. The facility count is the
   *  readiness card's heading, so it is not repeated here. */
  const stats: [LucideIcon, string, string][] = [
    // 37 is the 36 states and the FCT together, not 37 states and the FCT.
    [Map, String(COVERAGE.statesTotal), 'States incl. FCT'],
    [MapPin, String(COVERAGE.statesPrimary), 'States surveyed'],
    [Building2, formatCount(lgaCount), 'LGAs reached'],
  ];

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <TopBar />

      {/* The page's ground is the app's own `--page`, the pale mint every
          module sits on, so stepping through the door does not change the
          room. It is set by that token alone, never by a colour of this page's
          own, so the two cannot drift apart again. */}
      <main className="relative isolate flex flex-1 flex-col bg-page">
        <Backdrop />
        {/* Spacing sized off the viewport's height, and the column centred in
            what is left: the page holds one laptop screen, and a taller screen
            gets air around it rather than a gap under it. */}
        <div
          className={cn(
            SHELL,
            'relative flex flex-1 flex-col justify-center gap-[clamp(0.75rem,1.7vh,1.25rem)] py-[clamp(0.75rem,2.2vh,1.75rem)]',
          )}
        >
          {/* ── The question, its answer, and the evidence ──────────────── */}
          {/* Two equal columns with the same gap as the row below, so the
              readiness card and Explore line up edge to edge: same width,
              same left edge. */}
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-6">
            <div className="flex flex-col">
              {/* The question, in the eyebrow's place and ink: what is being
                  answered, before the answer. It took over from a "National
                  assessment" eyebrow above it, which the page has no room for
                  on one screen and which the question says better. */}
              <p className="flex items-center gap-3 text-prose font-semibold text-chrome-ink">
                How ready is Nigeria for electronic medical records?
                <span aria-hidden className="hidden h-[2px] w-9 shrink-0 rounded-full bg-chrome-ink sm:block" />
              </p>
              {/* The answer, in two findings: the two in three who are
                  Moderately ready, and the one in four who are Not ready —
                  and in the second sentence, what blocks them. The first is
                  worded in the bands' own terms ("moderate upgrades" for
                  Moderately ready, as the readiness card says under it). It
                  used to read "need only major work", from when the urgency
                  scale had a level above Major and that meant "nothing
                  critical"; once the scale changed it said the opposite of
                  the band it describes.

                  A step under `text-display`, and sized off the viewport's
                  height as well as its width: at the display size the two
                  sentences ran to five lines and the page past one screen. */}
              <h1 className="mt-2 text-[clamp(1.5rem,min(2.15vw,4.2vh),2.4rem)] font-extrabold leading-[1.08] tracking-tight text-balance text-foreground">
                Two in three facilities need only moderate upgrades before an EMR.{' '}
                <span className="text-notready-ink">One in four</span> faces{' '}
                <span className="text-notready-ink">power</span> or{' '}
                <span className="text-notready-ink">connectivity</span> barriers to EMR deployment.
              </h1>
              {/* One way in. The other modules are a line away in the top bar
                  and in Explore below; a second button here would compete
                  with this one for the same click. */}
              <div className="mt-4">
                <Link
                  to="/states"
                  className="inline-flex items-center gap-2.5 rounded-[8px] bg-sidebar px-5 py-3 text-prose font-semibold text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Explore state readiness
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              {/* ── Coverage ─────────────────────────────────────────────────
                  Under the answer rather than in a strip of its own: what the
                  finding rests on, read straight after it, and one row fewer
                  between the reader and the rest of the page. */}
              <ul
                aria-label="Assessment coverage"
                className="mt-auto grid grid-cols-3 gap-4 border-t border-border pt-3.5 lg:mt-4"
              >
                {stats.map(([Icon, value, label], i) => (
                  <li
                    key={label}
                    className={cn('flex min-w-0 items-center gap-3', i > 0 && 'sm:border-l sm:border-border sm:pl-4')}
                  >
                    <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-chrome-active/60 text-chrome-ink sm:grid lg:hidden xl:grid">
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-figure-sm font-extrabold leading-none tracking-tight text-foreground">
                        {value}
                      </p>
                      <p className="mt-1 truncate text-tick font-semibold uppercase tracking-[0.08em] text-chrome-active-foreground">
                        {label}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <ReadinessCard />
          </div>

          {/* ── State maturity, and the ways onward ──────────────────────── */}
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
            <MaturityCard />
            <ExploreCard />
          </div>

        </div>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className={cn(SHELL, 'flex flex-wrap items-center gap-x-6 gap-y-1 py-1.5')}>
          <span className="flex items-center gap-3">
            <InstitutionMark size="sm" />
            <span className="text-note text-muted-foreground">
              {INSTITUTION.abbr}, with NTBLCP, The Global Fund and Solina
            </span>
          </span>
          {/* The scope note: what the facility figures do and do not cover. */}
          <p className="text-note text-muted-foreground sm:ml-auto">
            Facility findings cover the {COVERAGE.statesPrimary} states surveyed; the other{' '}
            {DESK_STATES} and the FCT have state maturity only, by desk review.
          </p>
        </div>
      </footer>
    </div>
  );
}
