import { BAND_CLASSES, BAND_LABEL, BANDS } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount, percentOf } from '@/lib/format';
import type { Band } from '@/lib/types';

/**
 * How the facilities behind one cell split across the three bands.
 *
 * A mean score of 3.4 can be forty facilities clustered at 3.4 or twenty at 1.5
 * and twenty at 5.0, and those two areas need entirely different interventions.
 * The bar is what stops the headline figure being read as the whole story.
 *
 * Worst-to-best, left to right, at every size — the reader learns the order
 * once. Segments are proportioned on `scored` rather than `n`: they can only
 * describe the facilities that carry a value for this thematic node.
 *
 * Each segment carries its band's texture as well as its colour. The legend
 * below names the bands, but this component is also rendered with
 * `showLegend={false}` — in the ranked table's Split column and in the context
 * panel's small multiples — and there the bar was three colours and nothing
 * else. Red, amber and green in a 6px strip is the least separable form the
 * scale takes anywhere in the app.
 *
 * Takes a distribution and a denominator rather than an explorer cell: the
 * Overview draws the same bar per domain from the facility population, which
 * never passes through the cube.
 */
export function DistributionBar({
  distribution,
  scored,
  size = 'md',
  showLegend = true,
  className,
}: {
  distribution: Record<Band, number>;
  /** Facilities carrying a score here — the denominator, not `distribution`'s
   *  sum, which excludes nothing but is not what the segments are cut on. */
  scored: number;
  size?: 'sm' | 'md';
  showLegend?: boolean;
  className?: string;
}) {

  if (!scored) {
    return (
      <div className={className}>
        <div
          className={cn(
            'w-full overflow-hidden rounded-full bg-muted',
            size === 'sm' ? 'h-1.5' : 'h-2.5',
          )}
        />
        {showLegend && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            No facilities scored on this selection
          </p>
        )}
      </div>
    );
  }

  const label = BANDS.map(
    (band) => `${BAND_LABEL[band]} ${distribution[band]}`,
  ).join(', ');

  return (
    <div className={className}>
      <div
        className={cn(
          'flex w-full overflow-hidden rounded-full bg-muted',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
        role="img"
        aria-label={`Distribution of ${formatCount(scored)} facilities: ${label}`}
      >
        {BANDS.map((band) => {
          const count = distribution[band];
          if (!count) return null;
          return (
            <div
              key={band}
              className={cn(BAND_CLASSES[band].bg, BAND_CLASSES[band].texture)}
              style={{ width: `${(count / scored) * 100}%` }}
              title={`${BAND_LABEL[band]}: ${formatCount(count)} (${percentOf(count, scored)})`}
            />
          );
        })}
      </div>

      {showLegend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {BANDS.map((band) => (
            <li key={band} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-sm',
                  BAND_CLASSES[band].bg,
                  BAND_CLASSES[band].texture,
                )}
                aria-hidden
              />
              <span className="text-muted-foreground">
                {BAND_LABEL[band]}{' '}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCount(distribution[band])}
                </span>{' '}
                <span className="tabular-nums">
                  {percentOf(distribution[band], scored)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
