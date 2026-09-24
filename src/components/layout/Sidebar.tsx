import { AssistantButton } from '@/modules/assistant/AssistantButton';
import { useCallback, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  Coins,
  Compass,
  FileText,
  Home,
  Map,
  Menu,
  PanelLeft,
  X,
  type LucideIcon,
} from 'lucide-react';
import { NAV_ITEMS, moduleFor } from '@/app/navigation';
import { InstitutionMark } from '@/components/layout/InstitutionMark';
import { INSTITUTION } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { useDismissable, useScrollLock } from '@/hooks/useDismissable';
import { useSidebarStore } from '@/store/sidebarStore';

const ICONS: Record<string, LucideIcon> = {
  Home,
  Map,
  BarChart3,
  ClipboardList,
  Coins,
  Compass,
  FileText,
};

/**
 * The wordmark, and the way back out to the landing page.
 *
 * Collapsed, it drops to the mark alone — the `title` carries the name, the way
 * the nav links below do.
 *
 * The name is stacked, agency over product, and that is a width decision rather
 * than a hierarchy one: the rail is 192px, which leaves about 124px beside the
 * mark, and "NPHCDA EMR Readiness" set inline needs every pixel of it before
 * truncating on the narrower mobile panel. Two lines read top-down as the same
 * name and neither line is ever cut. The landing page's header has the room to
 * set it inline and does.
 */
function BrandBlock({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to="/"
      onClick={onNavigate}
      title={`${INSTITUTION.abbr} EMR Readiness Assessment — landing page`}
      className={cn(
        // 52px, the page header's title row, so the two hairlines under them
        // meet as one line across the screen.
        'flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4 transition-colors',
        'hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        collapsed && 'justify-center px-0',
      )}
    >
      <InstitutionMark size="sm" />
      {collapsed ? (
        <span className="sr-only">{INSTITUTION.abbr} EMR Readiness Assessment</span>
      ) : (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="mono truncate text-tick uppercase tracking-[0.13em] text-muted-foreground">
            {INSTITUTION.abbr}
          </span>
          <span className="mt-1 truncate text-body font-semibold leading-tight text-foreground">
            EMR Readiness
          </span>
        </span>
      )}
    </Link>
  );
}

/**
 * The rail's contents, shared by the fixed desktop rail and the mobile panel.
 *
 * The active item is marked by a pale mint left edge and a lift onto
 * `bg-surface`, which `.rail` resolves to a lighter emerald than the rail. The mint is
 * the frame's cool green, not Ready's yellow-green, so a selected item does
 * not read as a Ready badge.
 */
function NavContents({
  collapsed = false,
  footer,
  onNavigate,
}: {
  collapsed?: boolean;
  footer?: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <>
      {!collapsed && (
        <p className="mono px-4 pb-1.5 pt-4 text-tick uppercase tracking-[0.13em] text-muted-foreground">
          Modules
        </p>
      )}
      <ul className={cn('flex flex-1 flex-col', collapsed && 'pt-4')}>
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon] ?? Home;
          return (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/dashboard'}
                onClick={onNavigate}
                // Collapsed, the icon is the only label there is, so the native
                // tooltip carries the name rather than leaving seven unmarked
                // glyphs. The `sr-only` span keeps the accessible name intact
                // either way — `title` alone is not a reliable one.
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 border-l-2 border-transparent py-2 pl-3.5 pr-4 text-prose font-medium text-muted-foreground transition-colors',
                    'hover:bg-surface hover:text-foreground',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    collapsed && 'justify-center px-0 pl-2',
                    isActive && '!border-brand-500 bg-surface font-semibold text-foreground',
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto border-t border-border p-3">{footer}</div>
    </>
  );
}

/**
 * The fixed navigation rail.
 *
 * Emerald in light mode and dark green in dark — the dashboard's colour, a cool
 * green kept apart from Ready's. The `rail` class re-points the ordinary
 * tokens (text, muted text, surface, border, accent) at the rail's own values,
 * so everything inside is written with the same classes as the rest of the app.
 *
 * Desktop only. At 375px it was 68% of the viewport, so below `lg` navigation
 * moves into `MobileNavBar` — the rail is not narrowed *there*, because a
 * seven-item icon strip and a seven-item labelled list are different components
 * pretending to be one, and on a phone the labels are what make this navigable
 * to someone who has not used the dashboard before.
 */
export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);

  return (
    <nav
      aria-label="Main"
      className={cn(
        'rail hidden shrink-0 flex-col border-r border-border bg-sidebar lg:flex',
        // Width only — animating anything else here would drag the map and the
        // charts through a resize on every frame of the transition.
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[60px]' : 'w-[192px]',
      )}
    >
      <BrandBlock collapsed={collapsed} />
      <NavContents
        collapsed={collapsed}
        footer={
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className={cn(
              'mono flex w-full items-center gap-2.5 px-1 py-1.5 text-tick uppercase tracking-[0.1em] text-muted-foreground transition-colors',
              'hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              collapsed && 'justify-center',
            )}
          >
            <PanelLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {!collapsed && <span>Collapse</span>}
          </button>
        }
      />
    </nav>
  );
}

/**
 * Navigation below `lg`: a top bar with the current module and a slide-over
 * panel.
 *
 * Written here rather than through the shared `Drawer` because it reuses the
 * rail's own surface and active-state treatment; it shares the dismiss and
 * scroll-lock hooks every other overlay uses, and the same `slide-in-left`
 * keyframe the reduced-motion rule already neutralises.
 */
export function MobileNavBar() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { pathname } = useLocation();

  useDismissable(open, close);
  useScrollLock(open);

  const current = moduleFor(pathname);

  return (
    <>
      <div className="rail flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-3 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-label="Open navigation"
          className="-ml-1 rounded p-1.5 text-foreground transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <p className="truncate text-prose font-semibold leading-tight text-foreground">
            {current?.label ?? 'EMR Readiness Assessment'}
          </p>
          {/* The product name carries the agency here too. One surface still
              saying "EMR readiness" while the rail and the landing page say
              "NPHCDA EMR Readiness" is the inconsistency, not the length. */}
          <p className="mono truncate text-tick uppercase tracking-[0.1em] leading-tight text-muted-foreground">
            {INSTITUTION.abbr} EMR readiness
          </p>
        </div>
        <div className="ml-auto">
          <AssistantButton compact />
        </div>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px] animate-fade-in lg:hidden"
            onClick={close}
            aria-hidden
          />
          <nav
            aria-label="Main"
            className="rail fixed bottom-0 left-0 top-0 z-[95] flex w-64 max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-pop animate-slide-in-left lg:hidden"
          >
            <div className="flex items-stretch">
              <div className="min-w-0 flex-1">
                <BrandBlock onNavigate={close} />
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close navigation"
                autoFocus
                className="shrink-0 border-b border-border px-3 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {/* Closing on navigate: the panel covers the content it just
                navigated to, and a reader who taps a link has finished with it. */}
            <NavContents onNavigate={close} />
          </nav>
        </>
      )}
    </>
  );
}
