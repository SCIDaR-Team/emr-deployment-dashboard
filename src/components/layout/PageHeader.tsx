import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { nextModule } from '@/app/navigation';
import { cn } from '@/lib/cn';
import { SectionTabs, type PageSection } from './SectionTabs';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** A way back up the hierarchy, rendered immediately before the title. Kept
   *  as a slot rather than a `to` prop because going back is rarely only a
   *  navigation — Assessed States has to drop its state scope on the way out. */
  back?: React.ReactNode;
  /** Filter controls. Rendered as their own hairline-separated row beneath the
   *  title bar, so the title row keeps a fixed height on every page. */
  children?: React.ReactNode;
  /** Actions that sit at the right of the title row — export menus, mode
   *  toggles. The next-module arrow is appended after them. */
  actions?: React.ReactNode;
  /**
   * The page's own sections, in document order — rendered as a strip of
   * in-page tabs beneath the filter row. Each id must match a `data-section`
   * element on the page. Fewer than two is not navigation, so the strip does
   * not render.
   */
  sections?: PageSection[];
  className?: string;
}

/**
 * The page's title bar and filter row.
 *
 * One line, ~52px, sentence case. The previous header set the title in
 * uppercase at `text-3xl` over a subtitle and a filter block, which spent about
 * 180px of a 900px viewport before any data appeared — and shouted, on a page
 * whose job is to be read. The title and its one-line description now share a
 * single baseline row, and filters get their own band below.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  children,
  actions,
  sections,
  className,
}: PageHeaderProps) {
  const { pathname } = useLocation();
  const next = nextModule(pathname);
  const ref = useRef<HTMLElement>(null);

  /**
   * Publish the header's height as `--page-header-h`.
   *
   * Anything scrolled to the top of the page has to clear it, and it is not one
   * number: the title row is fixed, but the filter row and the section strip
   * are per-page and the filter row rewraps with the viewport. Measuring it and
   * letting `scroll-margin-top` read the variable keeps every scroll target
   * correct without any page having to know what its own header costs.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        '--page-header-h',
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    publish();
    // Mounted once. The observer is what keeps the number current — it fires
    // for a filter row rewrapping or a section strip appearing just as readily
    // as for a viewport resize, so re-running this per render would only churn
    // observers to learn the same thing.
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // Sticky, not fixed: `main` in AppShell is the scroll container, so the
    // header pins to the top of the content column and keeps the rail's own
    // scroll behaviour untouched. z-30 clears the panels and tables that scroll
    // beneath it but stays under the drawer/toast layer at z-90+.
    <header ref={ref} className={cn('sticky top-0 z-30 shrink-0', className)}>
      <div className="flex min-h-[52px] items-center gap-4 border-b border-border bg-surface px-4 sm:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          {back}
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="min-w-0 truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {next && (
            // A predictable "next" is worth keeping from the prototype — these
            // stakeholders present from the dashboard in sequence. Hidden on
            // small screens, where the top corner is already spoken for by the
            // navigation button.
            <Link
              to={next}
              aria-label="Next module"
              className="hidden h-8 w-8 place-items-center rounded border border-input text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {children && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 sm:px-5">
          {children}
        </div>
      )}

      {sections && <SectionTabs sections={sections} />}
    </header>
  );
}

/** The label + control pairing used inside the filter row. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="mono shrink-0 text-[9.5px] uppercase tracking-[0.11em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
