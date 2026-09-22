import { useMemo } from 'react';
import { latAtY, metresPerUnit } from '@/lib/mapProjection';
import { cn } from '@/lib/cn';
import type { ViewportRect } from '@/hooks/useMapViewport';

/**
 * How much ground the map is showing.
 *
 * The thing that separates a map from a diagram of a country. Without it a
 * reader can see that Kano's facilities are spread out and Lagos's are packed
 * together, but cannot say whether "spread out" means two kilometres or twenty
 * — and on a page whose whole purpose is deciding where to send equipment and
 * how far a supervisor has to drive, that is the question.
 *
 * ## Why this is arithmetic rather than a constant
 *
 * Mercator's scale factor is 1/cos(lat): the projection stretches distances
 * further from the equator, so one viewBox unit is a different number of metres
 * in Sokoto than in Port Harcourt. The bar therefore measures at the **centre
 * latitude of the current view**, not at some fixed reference — see
 * `metresPerUnit`. Across Nigeria that correction is around 1.5%, which nobody
 * would notice; it is applied because a scale bar's only job is to be right,
 * and one that is casually wrong by a knowable amount is not doing it.
 *
 * ## Why the length is not fixed
 *
 * The bar picks a **round distance** and draws whatever width represents it,
 * rather than taking a fixed width and printing whatever distance it works out
 * to. "137 km" tells a reader nothing they can hold in their head; "100 km"
 * they can lay against the map by eye four times over. So the candidate lengths
 * are 1, 2 and 5 at every power of ten, and the largest that fits the budget
 * below wins.
 */

/** The most of the map's width the bar may take. Enough to be measurable
 *  against, not so much that it becomes furniture. */
const MAX_WIDTH_FRAC = 0.26;

/** 1-2-5 at every power of ten, from ten metres to a thousand kilometres —
 *  which spans a single facility compound to the whole country. */
const NICE_METRES = [
  10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000,
  500_000, 1_000_000,
];

function formatDistance(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
}

export function MapScaleBar({
  rect,
  renderPx,
  className,
}: {
  /** The live viewport, in viewBox units. */
  rect: ViewportRect;
  /**
   * How wide the map is drawn, in CSS pixels.
   *
   * The bar has to end up a real length on screen, and viewBox units alone
   * cannot say what that is — an SVG has no intrinsic size. Every layer already
   * measures this for tile selection (`useRenderSize`), so it is passed in
   * rather than measured a second time here and risking the two disagreeing.
   */
  renderPx: number;
  className?: string;
}) {
  const bar = useMemo(() => {
    const centreLat = latAtY(rect.y + rect.h / 2);
    const mPerUnit = metresPerUnit(centreLat);
    if (!Number.isFinite(mPerUnit) || mPerUnit <= 0 || rect.w <= 0) return null;

    const budgetMetres = rect.w * MAX_WIDTH_FRAC * mPerUnit;
    // Largest round distance that fits the budget; the smallest candidate if
    // even that overflows, which only happens on an absurdly zoomed-in view.
    const metres = [...NICE_METRES].reverse().find((m) => m <= budgetMetres) ?? NICE_METRES[0]!;
    return { metres, widthPx: (metres / mPerUnit / rect.w) * renderPx };
  }, [rect, renderPx]);

  if (!bar) return null;

  return (
    <div
      className={cn('pointer-events-none flex flex-col items-start gap-0.5', className)}
      // Announced as one string: a screen reader meeting the ticks and the
      // number separately gets three unrelated fragments.
      role="img"
      aria-label={`Map scale: ${formatDistance(bar.metres)}`}
    >
      <span className="mono text-tick font-medium leading-none text-foreground">
        {formatDistance(bar.metres)}
      </span>
      {/* The classic surveyor's bar: a baseline with a riser at each end, so
          the measured span is unambiguous where the two ends sit. */}
      <div
        aria-hidden
        className="relative h-[6px] border-x-2 border-b-2 border-foreground/70"
        style={{ width: Math.max(28, Math.round(bar.widthPx)) }}
      />
    </div>
  );
}
