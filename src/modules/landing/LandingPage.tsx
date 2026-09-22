import { useMemo } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Coins,
  Info,
  Landmark,
  Map,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import { NAV_ITEMS } from '@/app/navigation';
import { InstitutionMark } from '@/components/layout/InstitutionMark';
import { useDataContext } from '@/state/dataContext';
import { BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { COVERAGE, INSTITUTION } from '@/lib/constants';
import { formatCount } from '@/lib/format';
import {
  NATIONAL_DEPLOYMENT_SPLIT,
  NATIONAL_TOTAL,
  NATIONAL_UNPRICED_ACTIONS,
} from '@/lib/nationalSplit';
import type { Band } from '@/lib/types';

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
 * **On the palette.** This page follows a mockup drawn with a dark-green
 * wordmark, green eyebrows and a green primary button. It is not built that
 * way, and the reason is the rule at the top of `globals.css`: green, amber and
 * red are *status*, and green is Ready. Spending it on furniture is exactly how
 * the previous design lost the ability to mean anything by it. So the mark is
 * ink, the three module cards are `brand-500` blue on a `brand-50` ground like
 * every other control in the product, and the only *status* colour here is the
 * three bands and the figures reporting them.
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

/** Best case first — the waffle reads top-left to bottom-right. */
const BAND_ORDER: readonly Band[] = ['ready', 'moderately_ready', 'not_ready'] as const;

const ARCHETYPES = NATIONAL_DEPLOYMENT_SPLIT;
const SCORED_TOTAL = NATIONAL_TOTAL;

/**
 * What each band means, in the terms the band is actually computed from.
 *
 * Kept here rather than taken from `BAND_DESCRIPTION` in `bands.ts`, which
 * names the band rather than explaining it. The banding is mechanical and worth
 * stating exactly: critical gaps outstanding → Not ready, else major gaps
 * outstanding → Moderately ready, else Ready. Note Ready requires *both* to be
 * clear — "no critical gap", which is how the mockup put it, describes the top
 * two bands rather than the top one.
 */
const BAND_RULE: Record<Band, string> = {
  ready: 'Nothing critical or major outstanding',
  moderately_ready: 'Major work to close, but nothing critical',
  not_ready: 'At least one critical gap blocks deployment',
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
        The three modules are the header, as cards rather than text links. A
        reader who arrives knowing which module they want should not have to
        enter through National Coverage and re-navigate from the rail — and on a
        page with no scroll, the header is the only place the modules can live,
        so each card carries the label *and* the line saying what that module
        has that the others do not. Below `md` they stack under the wordmark.

        **They are filled, not outlined.** Drawn as bordered cards on the
        surface they were the same weight as every rule and box further down the
        page, and the one thing a reader arrives to do read as chrome — three
        pale rectangles in a top bar are furniture until they are hovered. A
        `brand-50` ground with a `brand-500` hairline and a blue glyph makes
        them the only saturated cool block above the fold, which is what
        separates "these are the doors" from "this is a header". Blue is the
        colour that can be spent this way: green, amber and red are readiness
        bands, and `brand-500` is already what every control in the product is.
      */}
      <header className="border-b border-border bg-surface">
        <div
          className={cn(
            SHELL,
            'flex flex-col gap-3 py-2 md:flex-row md:items-center md:justify-between md:gap-8',
          )}
        >
          <Link
            to="/"
            className="flex shrink-0 items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <InstitutionMark />
            <span className="flex flex-col leading-none">
              {/*
                The agency leads the name. Ink, not brand blue and not green:
                the mark is identity, and identity is the one thing on this page
                that should not look like either a control or a readiness band.

                A step down from 13px, and `whitespace-nowrap`: "NPHCDA EMR
                READINESS" is 20 mono characters at this tracking, and the
                header is a single `shrink-0` mark against three module cards
                that have to keep their descriptions legible at `md`. The name
                buys its extra width back out of its own size rather than out of
                theirs.
              */}
              <span className="mono whitespace-nowrap text-body font-semibold uppercase tracking-[0.08em] text-foreground">
                {INSTITUTION.abbr} EMR readiness
              </span>
              <span className="mono mt-1 text-tick uppercase tracking-[0.13em] text-muted-foreground">
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
                  className="group flex min-w-0 items-center gap-3 rounded-[5px] border border-brand-500 bg-brand-50 px-3.5 py-2 transition-colors hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon
                    className="h-[18px] w-[18px] shrink-0 text-brand-500"
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-prose font-semibold text-foreground">
                      {mod.label}
                    </span>
                    <span className="mt-0.5 truncate text-note text-muted-foreground">
                      {mod.description}
                    </span>
                  </span>
                  <ArrowRight
                    className="ml-3 block h-4 w-4 shrink-0 text-brand-500 transition-transform group-hover:translate-x-0.5 md:hidden xl:block"
                    aria-hidden
                  />
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      <main className={cn(SHELL, 'flex flex-1 flex-col justify-center gap-[clamp(0.7rem,2vh,1.25rem)] py-[clamp(0.7rem,2vh,1.25rem)]')}>
        {/* ── The finding, and the evidence for it ─────────────────────── */}
        <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12">
          <div className="flex flex-col">
            <p className="eyebrow">National assessment</p>
            {/* Two figures, not three: the middle band is two thirds of the
                country and is the reason the plan is affordable, but a headline
                that led with it would say "most facilities need work", which is
                true of every health system and tells a reader nothing. The
                pair that carries the finding is how few are ready now and how
                many are blocked outright. */}
            <h1 className="mt-3 text-display font-semibold leading-[1.08] tracking-tight text-balance text-foreground">
              Two in three facilities need only major work before an EMR.{' '}
              <em className="not-italic text-notready-ink">
                One in four is blocked on power or connectivity.
              </em>
            </h1>
            <p className="mt-5 max-w-[54ch] text-prose leading-relaxed text-muted-foreground">
              Readiness measures whether a facility can realistically begin an EMR
              deployment — not whether it already owns the equipment. What separates the
              bands is the work still outstanding.
            </p>

            {/*
              No buttons under the paragraph. There were two — "Explore the
              assessment" to National Coverage and "View assessed states" to
              Assessed States — and they said the same thing twice over: both
              are "go and look at the assessment", neither names its
              destination the way the rail does, and the second is the name of a
              module sitting in the header three inches above it. A reader who
              met all four controls had to work out which pairs went to the same
              page. The header cards are the routes, now coloured to be seen as
              such, so the hero states the finding and gets out of the way.
            */}
          </div>

          <div className="flex flex-col">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="mono text-prose font-semibold uppercase tracking-[0.09em] text-foreground">
                {formatCount(SCORED_TOTAL)} facilities assessed
              </h2>
              {/* Hand-rolled rather than <BandLegend/> so it can sit on the
                  heading's baseline at the far right, which the shared
                  component's own flex row cannot do. Same swatches, same
                  textures, same labels. */}
              <ul className="mono ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-note text-muted-foreground">
                {BAND_ORDER.map((band) => (
                  <li key={band} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        'band-swatch block h-2.5 w-2.5 rounded-[2px]',
                        BAND_CLASSES[band].bg,
                        BAND_CLASSES[band].texture,
                      )}
                    />
                    {BAND_LABEL[band]}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[3px]">
              {tiles.map((band, i) => (
                <span
                  key={i}
                  title={BAND_LABEL[band]}
                  className={cn(
                    'block aspect-square rounded-[2px]',
                    BAND_CLASSES[band].bg,
                    BAND_CLASSES[band].texture,
                  )}
                />
              ))}
            </div>
            {/*
              "Each square represents 1 facility" — which the mockup said — is
              off by a factor of 28. A hundred squares cannot each be one of
              2,806 facilities, and the point of the waffle is that the count of
              green squares *is* the percentage.
            */}
            <p className="mt-2 text-note text-muted-foreground">
              Each square is one per cent of the facilities assessed.
            </p>

            {/* ── The three bands ──────────────────────────────────────
                Percentage first, count under it. Divided by rules rather
                than boxed, so the three read as one sentence in three
                parts rather than three separate claims. */}
            <div className="mt-4 grid gap-x-7 gap-y-5 sm:grid-cols-3">
              {BAND_ORDER.map((band, i) => {
                const count = ARCHETYPES[band];
                return (
                  <div
                    key={band}
                    className={cn(
                      'flex flex-col',
                      i > 0 && 'sm:border-l sm:border-border sm:pl-7',
                    )}
                  >
                    {/*
                      Count and band name on one line, and no swatch before it.
                      The swatch was the non-colour carrier for the band, but
                      that job is done here by the word itself — `BAND_LABEL` is
                      set in the band's own colour immediately beside the
                      figure, so the reading survives greyscale and colour-vision
                      deficiency on the text alone. Dropping it also returns the
                      row of vertical space that lets the share keep its
                      "of those assessed" qualifier.

                      The label always stacks under the figure. It used to go
                      inline at `xl`, which the revised data made impossible:
                      "1,892 MODERATELY READY" needs about 218px and the middle
                      block has 155px at 1280 and 177px at the widest layout the
                      1400px shell allows. The column stops growing before the
                      label does, so there is no breakpoint at which inline
                      fits — this is a removal, not a retuned threshold.

                      Stacking all three rather than only the one that overflows
                      is what keeps the blocks in register: a label that wrapped
                      on the longest band alone would drop that block's
                      remaining lines below its neighbours'. "170 READY" and
                      "744 NOT READY" would both still fit inline, and that is
                      exactly why they must not.
                    */}
                    <p
                      className={cn(
                        'mono font-semibold tracking-tight',
                        BAND_CLASSES[band].text,
                      )}
                    >
                      <span className="text-figure leading-none">{formatCount(count)}</span>
                      <span className="mt-1.5 block whitespace-nowrap text-note uppercase leading-none tracking-[0.09em]">
                        {BAND_LABEL[band]}
                      </span>
                    </p>
                    <p className="mono mt-2 text-tick font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {((count / SCORED_TOTAL) * 100).toFixed(1)}% of those assessed
                    </p>
                    <p className="mt-1.5 text-body leading-snug text-muted-foreground">
                      {BAND_RULE[band]}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Coverage ─────────────────────────────────────────────────── */}
        <div className="rounded-[6px] border border-border bg-surface px-5 py-3.5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-7">
            <p className="eyebrow shrink-0 lg:w-[104px]">The assessment</p>
            <div className="grid flex-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map(([Icon, value, label, sub], i) => (
                <div
                  key={label}
                  className={cn(
                    'flex items-center gap-3',
                    i > 0 && 'lg:border-l lg:border-border lg:pl-6',
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[5px] bg-surface-sunk text-muted-foreground">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="mono text-figure-sm font-semibold leading-none tracking-tight text-foreground">
                      {value}
                    </p>
                    <p className="mono mt-1 whitespace-nowrap text-tick uppercase tracking-[0.08em] text-foreground">
                      {label}
                    </p>
                    <p className="mt-0.5 text-note leading-snug text-muted-foreground">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── How the band is arrived at ───────────────────────────────────
            The rule, stated where the reader has just met the numbers rather
            than in a footnote under them. */}
        <div className="flex items-start gap-3.5 rounded-[6px] border border-border bg-surface px-5 py-3">
          <Info className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-500" aria-hidden />
          <div>
            <p className="mono text-tick font-semibold uppercase tracking-[0.11em] text-foreground">
              How readiness is measured
            </p>
            <p className="mt-1.5 text-body leading-relaxed text-muted-foreground">
              A facility&rsquo;s band is a count of the work still outstanding, never a
              score. Critical gaps — electricity and connectivity, and nothing else — put
              it in Not ready on their own; major gaps alone pull it to Moderately ready.
              The two lower bands are different problems, and each takes a different
              response.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className={cn(SHELL, 'py-3')}>
          <p className="mono text-tick leading-relaxed text-muted-foreground">
            NPHCDA, with NTBLCP, The Global Fund and Solina · {COVERAGE.statesPrimary}{' '}
            states by facility survey; {COVERAGE.statesSecondary} states and the FCT by
            desk review, which yields state-level findings only ·{' '}
            {/* What replaced the blanket "everything here is synthetic" notice.
                The figures are sourced now, so a global disclaimer would be
                false — but the one thing the dataset does not carry is worth
                stating once rather than leaving a reader to infer it.

                The count is generated, not written. This read "a few critical
                actions" against a figure of 332; the revised costing model made
                it 2,274, and minor rather than critical, so the sentence was
                wrong twice over. An adjective cannot be kept in step with a
                dataset — a number read from the ingest can. */}
            <strong className="font-semibold text-foreground">
              Costs are indicative and exclude {formatCount(NATIONAL_UNPRICED_ACTIONS)}{' '}
              {NATIONAL_UNPRICED_ACTIONS === 1 ? 'action' : 'actions'} the assessment does
              not price.
            </strong>
          </p>
        </div>
      </footer>
    </div>
  );
}
