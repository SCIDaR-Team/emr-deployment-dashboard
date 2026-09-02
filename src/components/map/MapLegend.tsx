import { MapHatchDefs } from './MapHatch';
import { bandMarkerPath, bandFlatFill, useHatchPatternId } from './mapTypes';
import { BAND_LABEL } from '@/lib/bands';
import type { Band } from '@/lib/types';

const BAND_ORDER: Band[] = ['ready', 'moderately_ready', 'not_ready'];

const BAND_SWATCH_CLASS: Record<Band, string> = {
  ready: 'fill-ready',
  moderately_ready: 'fill-moderate',
  not_ready: 'fill-notready',
};

interface MapLegendProps {
  /** National level shows all three evidential states; state/LGA levels are
   *  primary-only, so the secondary swatch would be dead weight there. */
  showSecondary?: boolean;
  showNoData?: boolean;
  /** The facility layer draws points, which carry the band as a shape rather
   *  than a texture — the legend has to show whichever the map beneath it
   *  actually uses, or it is teaching the wrong vocabulary. */
  marks?: 'area' | 'point';
  className?: string;
}

/**
 * Shared legend for all three map layers — the guide is explicit that the
 * three-band scale "is used everywhere... define it once and never
 * hand-pick," and the same discipline applies to what accompanies it on a map.
 *
 * The swatches carry exactly what the map carries, whatever that is. Area
 * fills are flat colour (see `bandFlatFill` for why the textures went), so the
 * squares are flat; facility points carry the band as a silhouette, so the
 * point marks are drawn with `bandMarkerPath` rather than as squares in the
 * right colour. A legend that teaches a vocabulary the map does not speak is
 * worse than no legend.
 */
export function MapLegend({
  showSecondary = false,
  showNoData = true,
  marks = 'area',
  className,
}: MapLegendProps) {
  const hatchId = useHatchPatternId();

  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground ${className ?? ''}`}
    >
      {BAND_ORDER.map((band) => (
        <span key={band} className="flex items-center gap-1.5">
          <svg width={14} height={14} aria-hidden>
            {marks === 'area' ? (
              <rect
                x={0.5}
                y={0.5}
                width={13}
                height={13}
                rx={2.5}
                fill={bandFlatFill(band)}
                stroke="rgb(0 0 0 / 0.12)"
              />
            ) : (
              <path d={bandMarkerPath(band, 7, 7, 5.4)} className={BAND_SWATCH_CLASS[band]} />
            )}
          </svg>
          {BAND_LABEL[band]}
        </span>
      ))}
      {showNoData && (
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14} aria-hidden>
            <rect
              x={0.5}
              y={0.5}
              width={13}
              height={13}
              rx={2.5}
              className="fill-nodata"
              stroke="rgb(0 0 0 / 0.12)"
            />
          </svg>
          No data
        </span>
      )}
      {showSecondary && (
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14} aria-hidden>
            <MapHatchDefs id={hatchId} />
            <rect width={14} height={14} rx={3} fill={`url(#${hatchId})`} />
          </svg>
          Secondary evidence (desk review only)
        </span>
      )}
    </div>
  );
}
