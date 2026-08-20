/**
 * The measurement primitives: band marks and rows, band composition bars, stat
 * tiles and the sequential scale legend.
 *
 * These carry the one colour rule, so every surface that shows a reading
 * reaches for them rather than styling a bar inline:
 *
 *   hue means band            — the three readiness colours, always with a
 *                               texture and a label beside them
 *   darkness means magnitude  — the single-hue ramp, --s1 → --s5, used only
 *                               for shares and counts, never for a band
 *
 * See the header comment in src/styles/globals.css for why the two are kept
 * apart, and BAND_TEXTURE in src/lib/bands.ts for the non-colour channel.
 *
 * There are no score tracks and no maturity meter: this dashboard has no
 * numeric readiness scale to draw. A domain reading is a band, and `BandRow` is
 * what shows one.
 */

import { BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import type { Band } from '@/lib/types';


// ---------------------------------------------------------------------------
// Band mark
// ---------------------------------------------------------------------------

/**
 * A small textured square that carries a band beside a figure.
 *
 * Values themselves stay in ink. Recolouring a number to encode its band makes
 * the number harder to read and puts meaning in a channel a colour-blind or
 * greyscale reader loses; the mark takes the meaning instead.
 */
export function BandMark({
  band,
  className,
}: {
  band: Band | null;
  className?: string;
}) {
  const label = band ? BAND_LABEL[band] : 'Not scored';
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-[1px] align-baseline',
        band ? cn(BAND_CLASSES[band].bg, BAND_CLASSES[band].texture) : 'bg-nodata',
        className,
      )}
    />
  );
}

/**
 * One domain, one band — the row every domain panel is built from.
 *
 * Replaces the score track that used to sit here. A track needs a magnitude to
 * be long or short by, and a band has none: drawing "Moderately ready" as
 * two-thirds of a bar would invent the very number this model removed. The
 * band's own texture and label carry the reading instead.
 */
export function BandRow({
  label,
  band,
  note,
}: {
  label: string;
  band: Band | null;
  /** Optional right-hand annotation — a facility count, a share. */
  note?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="flex min-w-0 items-baseline gap-2 text-[12.5px] text-foreground">
        <BandMark band={band} />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-3">
        {note && <span className="mono text-[10.5px] text-muted-foreground">{note}</span>}
        <span
          className={cn(
            'mono text-[10px] uppercase tracking-[0.09em]',
            band ? BAND_CLASSES[band].text : 'text-muted-foreground',
          )}
        >
          {band ? BAND_LABEL[band] : 'Not assessed'}
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band composition
// ---------------------------------------------------------------------------

const STACK_ORDER: Band[] = ['ready', 'moderately_ready', 'not_ready'];

/**
 * A 100% stacked band bar: how a population splits across the three bands.
 *
 * Segments are separated by a 2px surface gap rather than by a border. A border
 * adds a fourth colour between every pair of fills and, at the 12px heights
 * these run at, reads as its own segment.
 */
export function BandStack({
  distribution,
  label,
  className,
}: {
  distribution: Record<Band, number>;
  label?: string;
  className?: string;
}) {
  const total = STACK_ORDER.reduce((sum, b) => sum + (distribution[b] ?? 0), 0);
  if (!total) return null;

  return (
    <div className={cn('flex h-3 min-w-[150px] gap-[2px]', className)}>
      {STACK_ORDER.map((band) => {
        const n = distribution[band] ?? 0;
        if (!n) return null;
        const pct = (n / total) * 100;
        return (
          <span
            key={band}
            title={`${label ? `${label} — ` : ''}${BAND_LABEL[band]} ${n.toLocaleString()} · ${pct.toFixed(1)}%`}
            className={cn(
              'block rounded-[1px]',
              BAND_CLASSES[band].bg,
              BAND_CLASSES[band].texture,
            )}
            style={{ width: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}

/** The three-band key. Present whenever a BandStack is, because identity must
 *  never rest on colour alone. */
export function BandLegend({
  includeNoData = false,
  noDataLabel = 'No facility data',
  className,
}: {
  includeNoData?: boolean;
  noDataLabel?: string;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'mono flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] tracking-wide text-muted-foreground',
        className,
      )}
    >
      {STACK_ORDER.map((band) => (
        <li key={band} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn('block h-2 w-5', BAND_CLASSES[band].bg, BAND_CLASSES[band].texture)}
          />
          {BAND_LABEL[band]}
        </li>
      ))}
      {includeNoData && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="hatch-secondary block h-2 w-5 bg-surface-sunk" />
          {noDataLabel}
        </li>
      )}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Stat tiles
// ---------------------------------------------------------------------------

/** A row of hairline-separated figures. The grid is a 1px-gap sheet so the
 *  rules between tiles are the container's background showing through. */
export function TileRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-px border border-border bg-border', className)}>
      {children}
    </div>
  );
}

export function Tile({
  label,
  value,
  suffix,
  note,
  band,
  aside,
  className,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  note?: React.ReactNode;
  band?: Band;
  /**
   * A second reading of the same figure, on the figure's own line after the
   * suffix — a readiness badge beside a score. Outside the mono block rather
   * than inside it, so a pill does not inherit the tabular face the number is
   * set in. For a second *number*, add a tile.
   */
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 bg-surface px-3.5 py-3', className)}>
      <div className="mono mb-2 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.11em] text-muted-foreground">
        {band && <BandMark band={band} className="h-2 w-3.5" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
        <span className="mono text-[25px] font-semibold leading-none tracking-tight text-foreground">
          {value}
          {suffix && (
            <span className="ml-1.5 text-xs font-medium tracking-normal text-muted-foreground">
              {suffix}
            </span>
          )}
        </span>
        {aside}
      </div>
      {note && <div className="mt-1.5 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sequential scale legend
// ---------------------------------------------------------------------------

const RAMP_CLASS = ['bg-score-1', 'bg-score-2', 'bg-score-3', 'bg-score-4', 'bg-score-5'];

/**
 * The key for a sequential choropleth.
 *
 * Mandatory wherever `GeoDatum.step` is used: a ramp with no scale is a
 * picture of nothing. Bounds are printed rather than described because the
 * domains are fitted to the data on screen, so "dark = worse" is not enough —
 * the reader needs to know worse *than what*.
 */
export function ScaleLegend({
  lo,
  hi,
  format,
  caption,
  note,
  noDataLabel = 'no data',
  className,
}: {
  lo: number;
  hi: number;
  format: (v: number) => string;
  caption: string;
  note?: React.ReactNode;
  noDataLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('mt-3', className)}>
      <p className="mono mb-1.5 text-[9.5px] uppercase tracking-[0.11em] text-muted-foreground">
        {caption}
      </p>
      <div className="flex items-start gap-0.5">
        {RAMP_CLASS.map((bg, i) => {
          const from = lo + ((hi - lo) * i) / 5;
          const to = lo + ((hi - lo) * (i + 1)) / 5;
          return (
            <div key={bg} className="min-w-0 flex-1" title={`${format(from)} – ${format(to)}`}>
              <div className={cn('h-[9px] rounded-[1px]', bg)} />
              <div className="mono mt-1 text-[9px] text-muted-foreground">{format(from)}</div>
            </div>
          );
        })}
        <div className="shrink-0 pl-2.5">
          <div className="hatch-secondary h-[9px] w-7 rounded-[1px] bg-surface-sunk" />
          <div className="mono mt-1 text-[9px] text-muted-foreground">{noDataLabel}</div>
        </div>
      </div>
      {note && <p className="mono mt-2 text-[10.5px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}
