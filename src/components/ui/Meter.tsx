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
import { formatCount, percentOf } from '@/lib/format';
import { BandIcon } from './BandBadge';
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
        'band-swatch inline-block h-2 w-2 shrink-0 rounded-[1px] align-baseline',
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
      <span className="flex min-w-0 items-baseline gap-2 text-body text-foreground">
        <BandMark band={band} />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-3">
        {note && <span className="mono text-note text-muted-foreground">{note}</span>}
        <span
          className={cn(
            'mono text-tick uppercase tracking-[0.09em]',
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
        'mono flex flex-wrap items-center gap-x-4 gap-y-1 text-tick tracking-wide text-muted-foreground',
        className,
      )}
    >
      {STACK_ORDER.map((band) => (
        <li key={band} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              'band-swatch block h-2 w-5',
              BAND_CLASSES[band].bg,
              BAND_CLASSES[band].texture,
            )}
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
// Band cards
// ---------------------------------------------------------------------------

/**
 * The three bands as three cards, side by side.
 *
 * The one way a band breakdown is stated across the app. Three peers set in a
 * row rather than a list of three rows, because they *are* peers: a stacked
 * list reads as a ranking, and "6 states ready" is not a step above "18 not
 * ready", it is one third of the same sentence.
 *
 * Icon, figure, label — in that order and all three present. `BAND_CLASSES` has
 * the rule: the scale is red/amber/green, the worst possible combination for
 * deuteranopia and protanopia and indistinguishable in greyscale, so colour
 * never travels alone. Here it travels with both of the other two carriers.
 *
 * The card is *filled* with its band rather than set in white with coloured
 * type. Type was carrying the colour on its own here — a 9px uppercase label
 * and a 14px icon — which is the thinnest possible reading of a value the
 * client picked as an area fill, and it left three near-identical white cards
 * to be told apart by two small marks. Filled, the row states the split before
 * a single figure is read. The figure itself stays ink (`--on-band`, fixed in
 * both schemes because the fill under it is): recolouring a number to encode
 * its band is the thing `BandMark` exists to avoid.
 *
 * `unit` is for counts of things the reader needs named — "6 states". Omit it
 * where the surrounding block has already said what is being counted, and pass
 * `showPercent` where the share matters as much as the count.
 */
export function BandCards({
  counts,
  unit,
  showPercent = false,
  className,
}: {
  counts: Record<Band, number>;
  unit?: string;
  showPercent?: boolean;
  className?: string;
}) {
  const order: Band[] = ['ready', 'moderately_ready', 'not_ready'];
  const total = order.reduce((sum, band) => sum + (counts[band] ?? 0), 0);

  return (
    /* The rules are `--on-band` at 15%, not `--border`. A hairline in the
       border colour is a 1.04:1 edge against the Ready and Moderate fills —
       invisible, so the three cards run together into one strip. This one
       darkens whatever it lies on, which is what a rule between filled cards
       has to do. */
    <div
      className={cn('grid grid-cols-3 gap-px border border-onband/15 bg-onband/15', className)}
    >
      {order.map((band) => (
        <div key={band} className={cn('band-card px-2 py-2', BAND_CLASSES[band].bg)}>
          {/* Figure, then its qualifiers on the same baseline. The unit is the
              number's own noun so it stays against it ("6 states"); the share
              is a second reading of the same count, so it goes to the card's
              right edge instead — beside the figure it read as more digits,
              and out there the three shares stack into a column of their own.
              The band label has the line under it to itself. */}
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <BandIcon band={band} className="h-3.5 w-3.5 shrink-0 translate-y-[2px]" />
            <span className="mono text-lead font-semibold leading-none tracking-tight">
              {formatCount(counts[band] ?? 0)}
            </span>
            {unit && <span className="text-note leading-none text-onband-muted">{unit}</span>}
            {showPercent && (
              <span className="mono ml-auto text-note font-semibold leading-none text-onband-muted">
                {total ? percentOf(counts[band] ?? 0, total, 1) : '—'}
              </span>
            )}
          </div>

          <p className="mono mt-2 text-tick font-bold uppercase leading-tight tracking-[0.07em]">
            {BAND_LABEL[band]}
          </p>
        </div>
      ))}
    </div>
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
  lead = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  note?: React.ReactNode;
  band?: Band;
  /**
   * The page's focal reading — the one figure that is the answer to the
   * question the page asks. Sets the value at `hero` instead of `figure-sm`.
   *
   * One per page. A row where two tiles claim the lead has no lead, and the
   * reader is back to scanning four equal figures for the one that matters.
   */
  lead?: boolean;
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
    <div className={cn('min-w-0 bg-surface px-3.5 py-3', lead && 'py-5', className)}>
      <div className="mono mb-2 flex items-center gap-2 text-tick uppercase tracking-[0.11em] text-muted-foreground">
        {band && <BandMark band={band} className="h-2 w-3.5" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
        <span
          className={cn(
            'mono font-semibold leading-none tracking-tight text-foreground',
            lead ? 'text-hero' : 'text-figure-sm',
          )}
        >
          {value}
          {suffix && (
            <span className="ml-1.5 text-body font-medium tracking-normal text-muted-foreground">
              {suffix}
            </span>
          )}
        </span>
        {aside}
      </div>
      {note && <div className="mt-1.5 text-body text-muted-foreground">{note}</div>}
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
 * Mandatory wherever `GeoDatum.step` is used: a ramp with no scale is a picture
 * of nothing. Bounds are printed rather than described because the domains are
 * fitted to the data on screen, so "dark = worse" is not enough — the reader
 * needs to know worse *than what*.
 *
 * ## Two numbers, not six
 *
 * Only the ends are labelled. A label under every step needs about 48px to set
 * "₦215.2m" and gets about 34px, so the five run into each other and the legend
 * becomes less readable than no legend at all — which is what happened the
 * first time this carried money instead of percentages.
 *
 * Losing the interior bounds costs nothing a reader was using. The ramp is
 * linear and the buckets are equal, so the middle values are exactly where the
 * eye already assumes they are; what cannot be guessed from the picture is
 * where it starts and where it stops. Those two survive at any width, in any
 * currency, however long the formatted string turns out to be — and the exact
 * bucket is still on the swatch's own tooltip for anyone who wants it.
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
      <p className="mono mb-1.5 text-tick uppercase tracking-[0.11em] text-muted-foreground">
        {caption}
      </p>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex gap-0.5">
            {RAMP_CLASS.map((bg, i) => (
              <div
                key={bg}
                className={cn('h-[9px] min-w-0 flex-1 rounded-[1px]', bg)}
                title={`${format(lo + ((hi - lo) * i) / 5)} – ${format(
                  lo + ((hi - lo) * (i + 1)) / 5,
                )}`}
              />
            ))}
          </div>
          {/* The ends only, pushed apart. `tabular-nums` so the right-hand
              figure does not shuffle sideways as the scope changes under it. */}
          <div className="mono mt-1 flex justify-between gap-2 text-tick tabular-nums text-muted-foreground">
            <span>{format(lo)}</span>
            <span>{format(hi)}</span>
          </div>
        </div>
        <div className="shrink-0">
          <div className="hatch-secondary h-[9px] w-7 rounded-[1px] bg-surface-sunk" />
          <div className="mono mt-1 text-tick leading-tight text-muted-foreground">
            {noDataLabel}
          </div>
        </div>
      </div>
      {note && <p className="mono mt-2 text-note leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}
