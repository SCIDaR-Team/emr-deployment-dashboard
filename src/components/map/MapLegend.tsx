import { MapHatchDefs } from './MapHatch';
import { BandPatternDefs } from './BandPattern';
import {
  bandMarkerPath,
  bandPatternFill,
  useBandPatternId,
  useHatchPatternId,
} from './mapTypes';
import { BAND_LABEL, BAND_TEXTURE, BAND_TEXTURE_LABEL } from '@/lib/bands';
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
 * The swatches carry the same textures and shapes the map does, because a
 * legend that shows three flat colours against a textured map is worse than no
 * legend: it tells a reader who cannot separate the colours that there is
 * nothing else to look for.
 */
export function MapLegend({
  showSecondary = false,
  showNoData = true,
  marks = 'area',
  className,
}: MapLegendProps) {
  const hatchId = useHatchPatternId();
  const bandId = useBandPatternId();

  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground ${className ?? ''}`}
    >
      {BAND_ORDER.map((band) => (
        <span key={band} className="flex items-center gap-1.5">
          <svg width={14} height={14} aria-hidden>
            {marks === 'area' ? (
              <>
                {/* Tile sized for a 14px swatch rather than a viewBox — this is
                    the one place the texture is not drawn at map scale. */}
                <BandPatternDefs id={`${bandId}-legend`} unit={4.5} />
                <rect
                  width={14}
                  height={14}
                  rx={3}
                  fill={bandPatternFill(`${bandId}-legend`, band)}
                />
              </>
            ) : (
              <path d={bandMarkerPath(band, 7, 7, 5.4)} className={BAND_SWATCH_CLASS[band]} />
            )}
          </svg>
          {BAND_LABEL[band]}
          {marks === 'area' && BAND_TEXTURE[band] !== 'solid' && (
            <span className="sr-only"> ({BAND_TEXTURE_LABEL[BAND_TEXTURE[band]]})</span>
          )}
        </span>
      ))}
      {showNoData && (
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14} aria-hidden>
            <rect width={14} height={14} rx={3} className="fill-nodata" />
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
