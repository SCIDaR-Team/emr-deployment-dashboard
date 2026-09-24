import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, FileDown, Loader2, Printer } from 'lucide-react';
import { InstitutionMark } from '@/components/layout/InstitutionMark';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { BAND_CLASSES } from '@/lib/bands';
import { briefFor } from '@/lib/briefs/content';
import { briefSections } from '@/lib/briefs/document';
import { briefFacts } from '@/lib/briefs/facts';
import { unverifiedFigures } from '@/lib/briefs/verify';
import { cn } from '@/lib/cn';
import { Markdown } from '@/modules/assistant/Markdown';
import { useDataContext } from '@/state/dataContext';
import type { Band } from '@/lib/types';
import type { BriefFacts, UnlockRow } from '@/lib/briefs/facts';

/**
 * A state brief — one page on a state's EMR readiness, at `/brief/:stateId`.
 *
 * Two halves, kept apart on purpose:
 *
 * - **The figures** are computed here, now, from the dashboard's data, by the
 *   same `briefFacts` the drafting script used. They are always current.
 * - **The words** are the reviewed narrative in `src/content/briefs`, written
 *   with an AI model around those figures and approved by a person. Every
 *   figure in them is checked against the facts on this page.
 *
 * On a draft, the page says so, lists any figure that is not in the data, and
 * says when the data has moved since the draft was written. The live site
 * shows approved briefs only (see `content.ts`).
 *
 * Outside the app shell, like the landing page, so it prints as a page: the
 * toolbar and review notes are `print:hidden`, and "Save as PDF" is the
 * browser's own print-to-PDF — sharp, selectable text rather than a picture.
 */

const BANDS: Band[] = ['ready', 'moderately_ready', 'not_ready'];

export default function BriefPage() {
  const { stateId = '' } = useParams();
  const { facilities, states } = useDataContext();
  const [exporting, setExporting] = useState(false);

  const state = states.data?.find((s) => s.id === stateId);
  const facts = useMemo(
    () => (state && facilities.data ? briefFacts(state, facilities.data) : null),
    [state, facilities.data],
  );
  const brief = briefFor(stateId);

  // The datasets start as empty lists, not null, so "not loaded yet" has to be
  // read from the loading flag — an empty list mid-load is not "no such state".
  if (states.isLoading || facilities.isLoading) return <PageSkeleton />;
  if (!state || !facts) return <Navigate to="/assessment" replace />;

  const unknown = brief ? unverifiedFigures(brief.body, facts) : [];
  const stale = brief ? brief.factsVersion !== facts.version : false;
  const r = facts.readiness;

  return (
    <div className="min-h-screen bg-page print:bg-white">
      {/* Toolbar — not printed. */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3 px-4 py-2.5">
          <Link
            to={`/assessment/${stateId}`}
            className="inline-flex items-center gap-1.5 text-body text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {facts.state} on Assessed States
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {brief && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-tick font-bold uppercase tracking-[0.08em]',
                  brief.status === 'approved' && !stale
                    ? 'bg-ready-wash text-ready-ink'
                    : 'bg-moderate-wash text-moderate-ink',
                )}
              >
                {stale ? 'Out of date' : brief.status === 'approved' ? 'Approved' : 'Draft'}
              </span>
            )}
            <button
              type="button"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const { exportBriefToWord } = await import('./exportWord');
                  await exportBriefToWord(facts, brief);
                } finally {
                  setExporting(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-2.5 py-1.5 text-body font-semibold text-foreground hover:border-foreground/40 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden />
              )}
              Word
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-sidebar px-2.5 py-1.5 text-body font-semibold text-sidebar-foreground hover:bg-sidebar/90"
            >
              <Printer className="h-4 w-4" aria-hidden />
              Save as PDF
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[860px] px-4 py-6 print:max-w-none print:p-0">
        {/* Review notes — not printed, and never on an approved, current brief. */}
        {(!brief || brief.status !== 'approved' || stale || unknown.length > 0) && (
          <div className="mb-4 flex gap-2.5 rounded-[10px] border border-moderate/60 bg-moderate-wash px-4 py-3 text-body text-foreground print:hidden">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-moderate-ink" aria-hidden />
            <div className="space-y-1">
              {!brief ? (
                <p>
                  <strong>No narrative yet.</strong> The figures below are live from the data. Draft
                  the words with{' '}
                  <code className="mono">npm run briefs:draft -- --state {stateId}</code>.
                </p>
              ) : (
                <>
                  {brief.status !== 'approved' && (
                    <p>
                      <strong>Draft — not on the live site.</strong> Review{' '}
                      <code className="mono">src/content/briefs/{stateId}.md</code>, then set{' '}
                      <code className="mono">status: approved</code> and your name.
                    </p>
                  )}
                  {stale && (
                    <p>
                      <strong>Out of date:</strong> the data has changed since this was written.
                      Redraft or re-check the figures, then approve again.
                    </p>
                  )}
                  {unknown.length > 0 && (
                    <p>
                      <strong>Check these figures</strong> — they are not in the data:{' '}
                      {unknown.join(', ')}.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <article className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_8px_24px_-12px_hsl(160_30%_20%/0.15)] print:rounded-none print:border-0 print:shadow-none">
          {/* Masthead */}
          <header className="rail flex items-center gap-4 bg-sidebar px-6 py-5 print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
            <InstitutionMark size="lg" />
            <div className="min-w-0">
              <p className="text-note font-semibold uppercase tracking-[0.14em] text-emerald-300">
                EMR readiness · State brief
              </p>
              <h1 className="mt-1 text-[28px] font-extrabold leading-tight text-foreground">
                {facts.state} State
              </h1>
              <p className="mt-0.5 text-body text-muted-foreground">
                {facts.zone} · {facts.facilities} facilities assessed in {facts.lgas} LGAs
              </p>
            </div>
          </header>

          {/* Key figures */}
          <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-5">
            {BANDS.map((b) => (
              <div key={b} className="bg-surface px-4 py-3">
                <p
                  className={cn(
                    'text-tick font-bold uppercase tracking-[0.08em]',
                    BAND_CLASSES[b].text,
                  )}
                >
                  {r[b].label}
                </p>
                <p
                  className={cn(
                    'mt-1 text-figure-sm font-extrabold leading-none',
                    BAND_CLASSES[b].text,
                  )}
                >
                  {r[b].facilities}
                </p>
                <p className="mt-1 text-note text-muted-foreground">{r[b].share} of facilities</p>
              </div>
            ))}
            <div className="bg-surface px-4 py-3">
              <p className="text-tick font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Plan
              </p>
              <p className="mt-1 text-figure-sm font-extrabold leading-none text-foreground">
                {facts.plan.total}
              </p>
              <p className="mt-1 text-note text-muted-foreground">
                {facts.plan.perFacility} per facility
              </p>
            </div>
            <div className="col-span-2 bg-surface px-4 py-3 sm:col-span-1">
              <p className="text-tick font-bold uppercase tracking-[0.08em] text-muted-foreground">
                State maturity
              </p>
              <p className="mt-1 text-lead font-extrabold leading-tight text-foreground">
                {facts.maturity.band}
              </p>
            </div>
          </div>

          {/* The narrative */}
          {brief && (
            <div className="space-y-5 px-6 py-5">
              {briefSections(brief.body).map((s) => (
                <section key={s.heading}>
                  <h2 className="text-body font-bold uppercase tracking-[0.1em] text-chrome-ink">
                    {s.heading}
                  </h2>
                  <div className="mt-1.5 text-prose leading-relaxed text-foreground">
                    <Markdown text={s.text} />
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* In figures */}
          <div className="grid gap-5 border-t border-border px-6 py-5 md:grid-cols-2 print:grid-cols-2">
            <FigureTable
              title="Most common gaps"
              rows={facts.topGaps.map((g) => [g.gap, `${g.facilities} · ${g.share}`])}
            />
            <FigureTable
              title="Investment"
              rows={[
                ['Before deployment', facts.plan.beforeDeployment],
                ['During deployment', facts.plan.duringDeployment],
                ['After deployment', facts.plan.afterDeployment],
                ['Total', facts.plan.total],
                ['National per facility', facts.plan.nationalPerFacility],
              ]}
            />
          </div>
          <UnlocksTable unlocks={facts.unlocks} />

          <footer className="border-t border-border px-6 py-3 text-note text-muted-foreground">
            {brief ? (
              <>
                Written with AI assistance ({brief.model}) from the assessment data
                {brief.reviewedBy ? `; reviewed by ${brief.reviewedBy}` : '; not yet reviewed'}
                .{' '}
              </>
            ) : null}
            Figures are computed from the dashboard&rsquo;s data. Costs are indicative. NPHCDA, with
            NTBLCP, The Global Fund and Solina.
          </footer>
        </article>
      </main>
    </div>
  );
}

function FigureTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div>
      <h3 className="text-tick font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h3>
      <table className="mt-1.5 w-full text-note">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-border">
              <td className="py-1 pr-2 text-foreground">{label}</td>
              <td className="mono py-1 text-right font-semibold tabular-nums text-foreground">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What funding unlocks, in the Scenarios section's terms: each fix alone, then
 * four combinations, each with its cost, the facilities it makes Ready
 * (Unlocked) and where that leaves the state (Total Ready). No budget limit —
 * each row is the set of fixes funded as far as it goes.
 */
function UnlocksTable({ unlocks }: { unlocks: BriefFacts['unlocks'] }) {
  const group = (title: string, rows: (UnlockRow & { fixes?: string })[]) => (
    <tbody>
      <tr>
        <th
          colSpan={4}
          className="pb-1 pt-3 text-left text-tick font-bold uppercase tracking-[0.08em] text-chrome-ink"
        >
          {title}
        </th>
      </tr>
      {rows.map((r) => (
        <tr key={r.label} className="border-t border-border">
          <td className="py-1 pr-2 text-foreground">
            <span className="font-semibold">{r.label}</span>
            {r.fixes && <span className="text-muted-foreground"> · {r.fixes}</span>}
          </td>
          <td className="mono py-1 pl-2 text-right tabular-nums text-foreground">{r.spend}</td>
          <td className="mono py-1 pl-2 text-right font-semibold tabular-nums text-ready-ink">
            +{r.unlocked}
          </td>
          <td className="mono py-1 pl-2 text-right font-bold tabular-nums text-foreground">
            {r.totalReady}
          </td>
        </tr>
      ))}
    </tbody>
  );
  return (
    <div className="border-t border-border px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-tick font-bold uppercase tracking-[0.1em] text-muted-foreground">
          What funding unlocks
        </h3>
        <p className="text-note text-muted-foreground">
          Ready before: <strong className="text-foreground">{unlocks.readyBefore}</strong> · no
          budget limit
        </p>
      </div>
      <table className="mt-1.5 w-full text-note">
        <thead>
          <tr className="whitespace-nowrap text-tick uppercase tracking-[0.08em] text-muted-foreground">
            <th className="py-1 text-left font-semibold">Fixes funded</th>
            <th className="py-1 pl-2 text-right font-semibold">Cost</th>
            <th className="py-1 pl-2 text-right font-semibold">Unlocked</th>
            <th className="py-1 pl-2 text-right font-semibold">Total Ready</th>
          </tr>
        </thead>
        {group('Each fix alone', unlocks.fixes)}
        {group('Combinations', unlocks.combinations)}
      </table>
    </div>
  );
}
