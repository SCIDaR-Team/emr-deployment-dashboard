/**
 * The landing page's two pieces of decoration, drawn rather than imported so
 * they take the app's own colours and follow dark mode: a primary health
 * care facility among trees, and the sweep of green that closes the
 * "How readiness is measured" card. Both are `aria-hidden` — they say nothing
 * the words beside them do not.
 */

export function FacilityIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 110" className={className} aria-hidden focusable="false">
      {/* Ground and a low hill behind. */}
      <path d="M0 96 C50 70 170 70 220 96 Z" className="fill-chrome-active/60" />
      <ellipse cx="110" cy="100" rx="104" ry="8" className="fill-chrome-active" />

      {/* Wings. */}
      <rect x="40" y="58" width="34" height="38" rx="1.5" className="fill-surface stroke-border" />
      <rect x="146" y="58" width="34" height="38" rx="1.5" className="fill-surface stroke-border" />
      <rect x="37" y="54" width="40" height="6" rx="1.5" className="fill-sidebar/80" />
      <rect x="143" y="54" width="40" height="6" rx="1.5" className="fill-sidebar/80" />

      {/* Main block, roof and door. */}
      <rect x="70" y="42" width="80" height="54" rx="2" className="fill-surface stroke-border" />
      <rect x="66" y="36" width="88" height="8" rx="2" className="fill-sidebar" />
      <rect x="101" y="72" width="18" height="24" rx="1.5" className="fill-sidebar" />
      <rect x="109.5" y="72" width="1" height="24" className="fill-surface/60" />

      {/* Windows. */}
      {[
        [78, 52],
        [92, 52],
        [122, 52],
        [136, 52],
        [78, 72],
        [136, 72],
        [46, 66],
        [60, 66],
        [152, 66],
        [166, 66],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="9"
          height="10"
          rx="1"
          className="fill-sky-200/80 dark:fill-sky-900/60"
        />
      ))}

      {/* The cross. */}
      <circle cx="110" cy="24" r="10" className="fill-surface stroke-sidebar" strokeWidth="2.5" />
      <rect x="107.5" y="17.5" width="5" height="13" rx="1" className="fill-sidebar" />
      <rect x="103.5" y="21.5" width="13" height="5" rx="1" className="fill-sidebar" />

      {/* Trees. */}
      {[
        { x: 22, r: 13, h: 22 },
        { x: 8, r: 9, h: 14 },
        { x: 196, r: 13, h: 22 },
        { x: 211, r: 8, h: 12 },
      ].map((t) => (
        <g key={t.x}>
          <rect x={t.x - 1.5} y={96 - t.h} width="3" height={t.h} className="fill-amber-900/50" />
          <circle
            cx={t.x}
            cy={96 - t.h}
            r={t.r}
            className="fill-emerald-600/80 dark:fill-emerald-700/80"
          />
          <circle
            cx={t.x - t.r / 3}
            cy={96 - t.h - t.r / 3}
            r={t.r / 2.2}
            className="fill-emerald-500/60"
          />
        </g>
      ))}
    </svg>
  );
}

/** Three overlapping sweeps — mint, gold, emerald — rising to the right. */
export function GreenSweep({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 120"
      preserveAspectRatio="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M200 0 C150 20 120 70 40 120 L200 120 Z" className="fill-chrome-active" />
      <path
        d="M200 18 C160 40 140 85 95 120 L200 120 Z"
        className="fill-amber-200/90 dark:fill-amber-300/40"
      />
      <path d="M200 8 C175 35 160 90 135 120 L200 120 Z" className="fill-sidebar" />
    </svg>
  );
}
