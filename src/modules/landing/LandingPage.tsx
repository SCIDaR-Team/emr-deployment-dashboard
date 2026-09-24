import { useMemo } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ClipboardList,
  Clock3,
  Coins,
  Landmark,
  Lightbulb,
  Map,
  MapPin,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { NAV_ITEMS } from '@/app/navigation';
import { InstitutionMark } from '@/components/layout/InstitutionMark';
import { useDataContext } from '@/state/dataContext';
import { BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { useCountUp } from '@/hooks/useCountUp';
import { COVERAGE, INSTITUTION } from '@/lib/constants';
import { formatCount } from '@/lib/format';
import {
  NATIONAL_DEPLOYMENT_SPLIT,
  NATIONAL_TOTAL,
  NATIONAL_UNPRICED_ACTIONS,
} from '@/lib/nationalSplit';
import type { Band } from '@/lib/types';
import { FacilityIllustration, GreenSweep } from './Illustration';

/**
 * Landing page — the front door, at `/`.
 *
 * Sits outside the AppShell: no navigation rail, no filter bar. Every figure on
 * it is available synchronously — the coverage numbers from `constants.ts`, the
 * band split from the generated `nationalSplit.ts` — so the page paints in one
 * pass while DataProvider warms the datasets behind it. Nothing here waits on a
 * fetch, and nothing here fills in late.
 *
 * **One screen.** The page is laid out to land inside a laptop viewport without
 * scrolling: a header of module cards, two columns, a coverage strip, the
 * measurement note, a footer rule. That constraint is the design — a front door
 * that needs scrolling has asked the reader for something before telling them
 * anything. The structure is `flex-col` with `min-h-screen` rather than a hard
 * `h-screen`, so a genuinely short viewport scrolls instead of clipping: never
 * hide content to protect a layout.
 *
 * **Counts lead, percentages support.** The three band blocks read 170 / 1,892 /
 * 744 before they read 6.1 / 67.4 / 26.5. Facilities are the unit the
 * programme acts in — a rollout is planned, costed and staffed per facility,
 * not per percentage point — so the absolute is the headline, carrying the band
 * name beside it, and the share is what gives it scale on the line beneath.
 *
 * **One reading, and it is deployment.** The source used to carry two overall
 * bands per facility — readiness to *use* an EMR beside readiness to *deploy*
 * one — and this page led with deployment because that is the question the
 * dashboard exists to answer. The revised costing model withdrew the second
 * column, so the choice has become the only reading there is. Every figure here
 * is `NATIONAL_DEPLOYMENT_SPLIT`, and every module behind the door reports the
 * same one.
 *
 * **On the palette.** Green, amber and red are *status* here, and green is
 * Ready — so the frame's green is a different one: the cool mint the whole
 * app's frame uses (hue ~150, well away from Ready's 96.7). The header is a
 * band of the rail's emerald, and the three module cards sit on it as lighter
 * emerald panels with white text; the only *status* colour on the page is
 * still the three bands and the figures reporting them.
 */

const ICONS: Record<string, LucideIcon> = {
  Map,
  BarChart3,
  Coins,
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

const ARCHETYPES = NATIONAL_DEPLOYMENT_SPLIT;
const SCORED_TOTAL = NATIONAL_TOTAL;

/**
 * What each band means, in the terms the band is actually computed from.
 *
 * Kept here rather than taken from `BAND_DESCRIPTION` in `bands.ts`, which
 * names the band rather than explaining it. The banding is mechanical and worth
 * stating exactly: a Major infrastructure gap outstanding → Not ready, else a
 * Moderate one → Moderately ready, else Ready. Note Ready requires *both* to be
 * clear — "no major gap" describes the top two bands rather than the top one.
 */
const BAND_RULE: Record<Band, string> = {
  ready: 'No major or moderate infrastructure gap outstanding',
  moderately_ready: 'Moderate infrastructure work to close, nothing major',
  not_ready: 'At least one major infrastructure gap blocks deployment',
};

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

export default function LandingPage() {
  const tiles = useMemo(waffleTiles, []);
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

  const stats: [LucideIcon, string, string, string][] = [
    // Widest scope first, narrowing left to right: the whole country, the part
    // of it visited, and then what that visit covered.
    [Map, String(COVERAGE.statesTotal), 'States & FCT', 'Nationwide scope'],
    [MapPin, String(COVERAGE.statesPrimary), 'States visited', 'Primary facility survey'],
    [Landmark, formatCount(lgaCount), 'LGAs reached', 'Local government areas'],
    [
      Building2,
      formatCount(COVERAGE.facilitiesScored),
      'Facilities assessed',
      'Primary healthcare facilities',
    ],
  ];

  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/*
        The three modules are the header, as cards rather than text links: a
        reader who arrives knowing which module they want goes straight there,
        and each card says what that module has that the others do not. The
        band is the rail's emerald, deepened towards the mark — the one strong
        green on the page, as the rail is inside the app — and `.rail` gives it
        light-on-green text. The cards are lighter panels on it, each with its
        glyph in a ring, so they read as the doors rather than as the header.
        Below `md` they stack under the wordmark.
      */}
      <header className="rail border-b border-border bg-sidebar bg-[linear-gradient(100deg,hsl(156_62%_14%),hsl(var(--sidebar))_55%)]">
        <div
          className={cn(
            SHELL,
            'flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between md:gap-8',
          )}
        >
          <Link
            to="/"
            className="flex shrink-0 items-center gap-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <InstitutionMark size="lg" />
            <span className="flex flex-col leading-none">
              <span className="whitespace-nowrap text-lead font-bold uppercase tracking-[0.04em] text-foreground">
                {INSTITUTION.abbr} EMR readiness
              </span>
              <span className="mt-1.5 text-note font-semibold uppercase tracking-[0.14em] text-emerald-300">
                Nigeria
              </span>
            </span>
          </Link>

          <nav
            aria-label="Dashboard modules"
            className="grid min-w-0 gap-2.5 sm:grid-cols-3 md:flex md:items-stretch"
          >
            {NAV_ITEMS.filter((mod) => mod.showOnHome).map((mod) => {
              const Icon = ICONS[mod.icon] ?? Map;
              return (
                <NavLink
                  key={mod.path}
                  to={mod.path}
                  className="group flex min-w-0 items-center gap-3 rounded-[8px] border border-white/25 bg-white/[0.07] px-3 py-2.5 transition-colors hover:border-white/50 hover:bg-white/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.14] text-foreground ring-1 ring-white/20">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-prose font-semibold text-foreground">
                      {mod.label}
                    </span>
                    <span className="mt-0.5 truncate text-note text-muted-foreground">
                      {mod.description}
                    </span>
                  </span>
                  <ArrowRight
                    className="ml-2 block h-4 w-4 shrink-0 text-foreground transition-transform group-hover:translate-x-0.5 md:hidden xl:block"
                    aria-hidden
                  />
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      <main
        className={cn(
          'flex flex-1 flex-col bg-[radial-gradient(ellipse_70%_60%_at_0%_0%,hsl(150_45%_95%),transparent)] dark:bg-none',
        )}
      >
        <div
          className={cn(
            SHELL,
            'flex flex-1 flex-col justify-center gap-[clamp(0.8rem,2.2vh,1.35rem)] py-[clamp(0.9rem,2.4vh,1.6rem)]',
          )}
        >
          {/* ── The finding, and the evidence for it ─────────────────────── */}
          <div className="grid items-start gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-10">
            <div className="flex flex-col lg:pt-4">
              <p className="flex items-center gap-3 text-note font-semibold uppercase tracking-[0.16em] text-chrome-ink">
                National assessment
                <span aria-hidden className="block h-[2px] w-9 rounded-full bg-chrome-ink" />
              </p>
              {/* Two figures, not three: the middle band is two thirds of the
                  country, but "most facilities need work" is true of every
                  health system. The pair that carries the finding is how few
                  are ready now and how many are blocked outright — and in the
                  second sentence, what blocks them. */}
              <h1 className="mt-4 text-display font-extrabold leading-[1.06] tracking-tight text-balance text-foreground">
                Two in three facilities need only major work before an EMR.{' '}
                <span className="text-notready-ink">One in four</span> is blocked on{' '}
                <span className="text-notready-ink">power</span> or{' '}
                <span className="text-notready-ink">connectivity.</span>
              </h1>
              <p className="mt-5 max-w-[54ch] text-prose leading-relaxed text-muted-foreground">
                Readiness measures whether a facility can realistically begin an EMR deployment —
                not whether it already owns the equipment. What separates the bands is the work
                still outstanding.
              </p>
            </div>

            <section
              aria-labelledby="facilities-assessed"
              className="rounded-[14px] border border-border bg-surface p-5 shadow-[0_1px_2px_hsl(160_20%_20%/0.05),0_8px_24px_-12px_hsl(160_30%_20%/0.12)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <h2
                  id="facilities-assessed"
                  className="flex items-center gap-2.5 text-prose font-bold uppercase tracking-[0.07em] text-foreground"
                >
                  <Building2 className="h-5 w-5 text-chrome-ink" aria-hidden />
                  {formatCount(SCORED_TOTAL)} facilities assessed
                </h2>
                <ul className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-note text-muted-foreground">
                  {BAND_ORDER.map((band) => (
                    <li key={band} className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn('block h-3 w-3 rounded-[3px]', BAND_CLASSES[band].bg)}
                      />
                      {BAND_LABEL[band]}
                    </li>
                  ))}
                </ul>
              </div>

              {/* A hundred squares, one per cent each, in the order best to
                  worst. Twenty-five across rather than twenty: a wider, lower
                  field that sits beside the headline without towering over it. */}
              <div className="mt-4 grid grid-cols-[repeat(25,minmax(0,1fr))] gap-[3px]">
                {tiles.map((band, i) => (
                  <span
                    key={i}
                    title={BAND_LABEL[band]}
                    className={cn('block aspect-square rounded-[2px]', BAND_CLASSES[band].bg)}
                  />
                ))}
              </div>
              <p className="mt-2 text-note text-muted-foreground">
                Each square is one per cent of the facilities assessed.
              </p>

              {/* ── The three bands ────────────────────────────────────────
                  Count first, then the band's name in its own ink, then the
                  share: the word beside the figure carries the band, so the
                  reading survives greyscale. Divided by rules rather than
                  boxed — one sentence in three parts. */}
              <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-3">
                {BAND_ORDER.map((band, i) => {
                  const count = ARCHETYPES[band];
                  const Icon = BAND_ICON[band];
                  return (
                    <div
                      key={band}
                      className={cn(
                        // Badge beside the count where the column is wide enough for
                        // "MODERATELY READY" beside it; above the count where not.
                        'flex flex-col gap-2.5 wide:flex-row wide:gap-3',
                        i > 0 && 'sm:border-l sm:border-border sm:pl-6',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-10 w-10 shrink-0 place-items-center rounded-full',
                          BAND_CLASSES[band].wash,
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-7 w-7 place-items-center rounded-full',
                            BAND_SOLID[band],
                          )}
                        >
                          <Icon className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden />
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className={cn('font-extrabold tracking-tight', BAND_CLASSES[band].text)}>
                          <BandCount value={count} />
                          <span className="mt-1.5 block whitespace-nowrap text-note font-bold uppercase leading-none tracking-[0.09em]">
                            {BAND_LABEL[band]}
                          </span>
                        </p>
                        <p
                          className={cn(
                            'mt-2 text-tick font-semibold uppercase tracking-[0.05em]',
                            BAND_CLASSES[band].text,
                          )}
                        >
                          <strong className="font-extrabold">
                            {((count / SCORED_TOTAL) * 100).toFixed(1)}%
                          </strong>{' '}
                          of those assessed
                        </p>
                        <p className="mt-1.5 text-note leading-snug text-muted-foreground">
                          {BAND_RULE[band]}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ── Coverage ─────────────────────────────────────────────────── */}
          <div className="rounded-[14px] border border-border bg-surface p-2.5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.05fr)_repeat(4,minmax(0,1fr))] lg:items-center lg:gap-0">
              <div className="flex items-center gap-3 rounded-[10px] bg-chrome-active/50 px-4 py-3 sm:col-span-2 lg:col-span-1">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-chrome-ink">
                  <ClipboardList className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-body font-bold uppercase tracking-[0.1em] text-foreground">
                    The assessment
                  </p>
                  <p className="mt-0.5 text-note text-muted-foreground">Key figures at a glance</p>
                </div>
              </div>
              {stats.map(([Icon, value, label, sub], i) => (
                <div
                  key={label}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2',
                    i > 0 && 'lg:border-l lg:border-border',
                  )}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chrome-active/60 text-chrome-ink">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-figure-sm font-extrabold leading-none tracking-tight text-foreground">
                      {value}
                    </p>
                    <p className="mt-1 whitespace-nowrap text-tick font-semibold uppercase tracking-[0.08em] text-chrome-active-foreground">
                      {label}
                    </p>
                    <p className="mt-0.5 text-note leading-snug text-muted-foreground">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── How the band is arrived at ─────────────────────────────────
              The rule, stated where the reader has just met the numbers,
              beside a picture of what the readiness is for. */}
          <div className="relative overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="relative grid items-center gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:gap-0 lg:pr-44">
              <div className="flex items-start gap-4 lg:pr-6">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sidebar text-sidebar-foreground">
                  <Lightbulb className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-body font-bold uppercase tracking-[0.1em] text-foreground">
                    How readiness is measured
                  </p>
                  <p className="mt-1.5 max-w-[80ch] text-body leading-relaxed text-muted-foreground">
                    A facility&rsquo;s band is a count of the work still outstanding, never a score.
                    Major technical infrastructure gaps — no usable power or connection — put it in{' '}
                    <strong className="text-foreground">Not ready</strong> on their own; moderate
                    ones alone pull it to{' '}
                    <strong className="text-foreground">Moderately ready</strong>. Gaps in
                    workforce, workflow and data use are reported beside readiness, not inside it.
                    The two lower bands are different problems, and each takes a different response.
                  </p>
                </div>
              </div>
              <div className="hidden border-l border-border px-6 lg:block">
                <FacilityIllustration className="h-24 w-auto" />
              </div>
              <div className="hidden border-l border-border pl-6 lg:block">
                <p className="text-body leading-relaxed text-foreground">
                  Better infrastructure.
                  <br />
                  Stronger systems.
                  <br />
                  Healthier communities.
                </p>
                <span aria-hidden className="mt-2 block h-[2px] w-10 rounded-full bg-chrome-ink" />
              </div>
            </div>
            <GreenSweep className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-40 lg:block" />
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className={cn(SHELL, 'flex items-start gap-2.5 py-3')}>
          <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-tick leading-relaxed text-muted-foreground">
            NPHCDA, with NTBLCP, The Global Fund and Solina · {COVERAGE.statesPrimary} states by
            facility survey; {COVERAGE.statesSecondary} states and the FCT by desk review, which
            yields state-level findings only ·{' '}
            {/* The count is generated, not written: an adjective cannot be
                kept in step with a dataset, a number read from the ingest can. */}
            <strong className="font-semibold text-foreground">
              Costs are indicative and exclude {formatCount(NATIONAL_UNPRICED_ACTIONS)}{' '}
              {NATIONAL_UNPRICED_ACTIONS === 1 ? 'action' : 'actions'} the assessment does not
              price.
            </strong>
          </p>
        </div>
      </footer>
    </div>
  );
}
