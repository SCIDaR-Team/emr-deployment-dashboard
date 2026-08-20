import { RotateCw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

/** Route-level fallback. Mirrors the usual header + KPI row + panel layout so
 *  the page does not jump when real content arrives. */
export function PageSkeleton() {
  return (
    <div className="p-8" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="mt-3 h-4 w-96" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="mt-6 h-80" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  message?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-border px-6 py-16 text-center">
      <div className="max-w-sm">
        <p className="font-medium text-foreground">{title}</p>
        {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

interface LoadErrorProps {
  /** What could not be loaded, as a noun phrase: "the facility summary". */
  what: string;
  error?: Error | null;
  /** `refetch` from the hook that failed. Omit only where nothing can retry. */
  onRetry?: () => void;
  className?: string;
}

/**
 * A fetch that failed.
 *
 * **Deliberately not an `EmptyState`.** An empty state is an answer — nothing
 * here matches, and the reader can stop looking. A failed fetch is the absence
 * of an answer, and the reader should try again. Rendering the second as the
 * first is the specific bug this component exists to make impossible: before
 * it, a 404 on `facilities-summary.json` reached the reader as "No facility
 * data loaded — run `npm run data:refresh`", sending whoever saw it to rebuild
 * an ETL over what was actually a bad path.
 *
 * So it looks like a problem rather than a result — a solid warning wash rather
 * than the empty state's neutral dashed box — and it says outright that the
 * figures have not arrived rather than gone missing. `useFetchJSON` keeps the
 * last good data on failure, so this frequently appears beside numbers that are
 * still on screen and now stale; that is what the second sentence is for.
 *
 * The technical detail is shown, not hidden behind a console. The people
 * operating this dashboard are the people who deploy it, and "responded 404"
 * next to the path is the whole diagnosis.
 */
export function LoadError({ what, error, onRetry, className }: LoadErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-card border border-notready/30 bg-notready-wash px-5 py-6',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-notready" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">Could not load {what}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing here is a finding — these figures have not arrived, rather
            than being absent from the assessment. Anything still on screen is
            from before the failure.
          </p>
          {error && (
            <p className="mt-2 break-words font-mono text-xs text-muted-foreground/80">
              {error.message}
            </p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-input bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-brand-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
