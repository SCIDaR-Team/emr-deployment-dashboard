import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Coins, Map, type LucideIcon } from 'lucide-react';
import { NAV_ITEMS } from '@/app/navigation';
import { BandLegend } from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { BAND_ACTION, BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { COVERAGE } from '@/lib/constants';
import { formatCount } from '@/lib/format';
import { NATIONAL_SPLIT, NATIONAL_TOTAL } from '@/lib/nationalSplit';
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
 * The page leads with the finding rather than the programme name. "EMR
 * READINESS ASSESSMENT" set at 6xl told a reader what the thing was called and
 * nothing about what it found — and in the new palette the dark hero it sat on
 * no longer exists, because green stopped being furniture.
 *
 * The signature mark is the hundred-tile waffle: the same three-band
 * vocabulary the rest of the app uses, with the same textures from `bands.ts`,
 * at the one scale where a reader sees the *shape* of the national result
 * before reading a number. Four green tiles out of a hundred is the argument.
 */

const ICONS: Record<string, LucideIcon> = {
  Map,
  BarChart3,
  Coins,
};

/** Best case first — the waffle reads top-left to bottom-right. */
const BAND_ORDER: readonly Band[] = ['ready', 'moderately_ready', 'not_ready'] as const;

const ARCHETYPES = NATIONAL_SPLIT;
const SCORED_TOTAL = NATIONAL_TOTAL;

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
  const { lgas } = useDataContext();

  const readyTiles = tiles.filter((b) => b === 'ready').length;
  const lgaCount = lgas.data.length || COVERAGE.lgas;

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="mono grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[3px] border-[1.5px] border-foreground text-[11px] font-bold tracking-tighter">
              ER
            </span>
            <span className="mono text-[11px] uppercase tracking-[0.1em] text-foreground">
              EMR readiness
            </span>
          </div>
          <Link
            to="/states"
            className="inline-flex items-center gap-2 bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-surface transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Enter the dashboard
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <div>
            <p className="eyebrow">National assessment</p>
            <h1 className="mt-3 max-w-[21ch] text-[clamp(1.9rem,4.2vw,2.9rem)] font-semibold leading-[1.12] tracking-tight text-balance text-foreground">
              Nigeria&rsquo;s health facilities are ready in people and{' '}
              <em className="not-italic text-notready">unready in power</em>.
            </h1>
            <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
              Of {formatCount(COVERAGE.facilitiesScored)} primary healthcare facilities
              assessed across {COVERAGE.statesPrimary} states,{' '}
              {formatCount(ARCHETYPES.ready)} can run an electronic medical record today.
              The constraint is not staff willingness or data habits — both score near the
              top of the instrument. It is electricity, connectivity and backup.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/states"
                className="inline-flex items-center gap-2 bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-surface transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Enter the dashboard
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/assessment"
                className="inline-flex items-center gap-2 border border-input px-4 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:border-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <BarChart3 className="h-4 w-4" aria-hidden />
                See the assessed states
              </Link>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2.5">Every hundred facilities</p>
            <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[2px]">
              {tiles.map((band, i) => (
                <span
                  key={i}
                  title={BAND_LABEL[band]}
                  className={cn(
                    'block aspect-square rounded-[1px]',
                    BAND_CLASSES[band].bg,
                    BAND_CLASSES[band].texture,
                  )}
                />
              ))}
            </div>
            <p className="mono mt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
              One tile is one per cent of the {formatCount(SCORED_TOTAL)} facilities with a
              computed readiness band. {readyTiles} are ready.
            </p>
            <BandLegend className="mt-3" />
          </div>
        </div>

        {/* ── Coverage ───────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {[
            // Widest scope first, narrowing left to right: the whole country,
            // the part of it visited, and then what that visit covered.
            [String(COVERAGE.statesTotal), 'States & FCT'],
            [String(COVERAGE.statesPrimary), 'States visited'],
            [formatCount(lgaCount), 'LGAs covered'],
            [formatCount(COVERAGE.facilitiesScored), 'Facilities assessed'],
          ].map(([value, label]) => (
            <div key={label} className="bg-surface px-4 py-3.5">
              <p className="mono text-[25px] font-semibold leading-none tracking-tight text-foreground">
                {value}
              </p>
              <p className="mono mt-1.5 text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What the three bands mean ──────────────────────────────────── */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="eyebrow">The scale</p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
            Every facility lands in exactly one of three bands
          </h2>
          <p className="mt-2 max-w-[68ch] text-[13px] text-muted-foreground">
            The two lower bands are not the same problem, and the difference is what a
            rollout plan is built on.
          </p>

          <div className="mt-5 grid gap-px border border-border bg-border md:grid-cols-3">
            {BAND_ORDER.map((band) => {
              const count = ARCHETYPES[band];
              return (
                <div key={band} className="bg-surface p-4">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        'block h-2.5 w-6 rounded-[1px]',
                        BAND_CLASSES[band].bg,
                        BAND_CLASSES[band].texture,
                      )}
                    />
                    <p className="mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
                      {BAND_LABEL[band]}
                    </p>
                  </div>
                  <p className="mono mt-2.5 text-[28px] font-semibold leading-none tracking-tight text-foreground">
                    {formatCount(count)}
                    <span className="ml-2 text-[13px] font-medium tracking-normal text-muted-foreground">
                      {((count / SCORED_TOTAL) * 100).toFixed(1)}%
                    </span>
                  </p>
                  <p className="mt-2 text-[13px] text-muted-foreground">{BAND_ACTION[band]}</p>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ── Modules ────────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="eyebrow">The dashboard</p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
Three modules, from the national picture to a costed plan
          </h2>

          <div className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-3">
            {NAV_ITEMS.map((mod) => {
              const Icon = ICONS[mod.icon] ?? Map;
              return (
                <Link
                  key={mod.path}
                  to={mod.path}
                  className="group flex flex-col bg-surface p-4 transition-colors hover:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon className="h-[18px] w-[18px] text-brand-500" aria-hidden />
                  <h3 className="mt-3 text-[13.5px] font-semibold text-foreground">
                    {mod.label}
                  </h3>
                  <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {mod.description}
                  </p>
                  <ArrowRight
                    className="mt-3 h-4 w-4 self-end text-brand-500 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="mono text-[10.5px] leading-relaxed text-muted-foreground">
            NPHCDA, in partnership with NTBLCP, The Global Fund and Solina.{' '}
            {COVERAGE.statesPrimary} states assessed by primary facility survey;{' '}
            {COVERAGE.statesSecondary} states and the FCT by secondary desk review, which
            yields state-level findings only. Readiness is reported as a band —
            ready, moderately ready or not ready — and never as a score, and every
            facility carries two: readiness to <em>use</em> an EMR and readiness to{' '}
            <em>deploy</em> one.{' '}
            {/* What replaced the blanket "everything here is synthetic" notice.
                The figures are sourced now, so a global disclaimer would be
                false — but the two things the dataset does not carry are worth
                stating once, in the same place, rather than leaving a reader to
                infer them from an absence. */}
            <strong className="font-semibold text-foreground">
              Costs are the assessment&rsquo;s own indicative pricing and exclude a small
              number of critical actions it does not price.
            </strong>
          </p>
        </div>
      </footer>
    </div>
  );
}
