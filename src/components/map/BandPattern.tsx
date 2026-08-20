import { BANDS, BAND_TEXTURE } from '@/lib/bands';
import { bandPatternId } from './mapTypes';
import type { Band } from '@/lib/types';

const PATTERN_FILL: Record<Band, string> = {
  ready: 'fill-ready',
  moderately_ready: 'fill-moderate',
  not_ready: 'fill-notready',
};

/**
 * SVG counterpart to the `.band-texture-*` classes in globals.css — the way
 * `MapHatch` is the counterpart to `.hatch-secondary`.
 *
 * The three-band scale is red / amber / green, which is exactly the combination
 * that collapses for the commonest colour-vision deficiencies and in greyscale,
 * and a map polygon has nowhere to put the label or icon `BandBadge` uses
 * instead. So each band fill is a `<pattern>` carrying the band colour *and* its
 * texture: solid for Ready, dots for Moderately ready, 135° stripes for Not
 * ready. `BAND_TEXTURE` in `lib/bands.ts` is the source of truth.
 *
 * 135°, not 45°: `MapHatch` owns 45° for the secondary-evidence grade, which is
 * a different axis entirely. Lines at one angle mean "desk review", lines at the
 * other mean "not ready", and a reader who has to tell them apart deserves to
 * be able to.
 *
 * The band colour comes from a Tailwind class *inside* the pattern rather than a
 * literal, so a fill still repaints on the dark-mode toggle for free — the same
 * reason the layers used `fill-ready`/`fill-moderate` directly before.
 *
 * `unit` is the tile size in viewBox units; pass `textureUnit(view.viewBox)`.
 */

/**
 * Texture marks are a fixed dark ink, *not* `--foreground`.
 *
 * The band colours do not follow the colour scheme — amber is the same amber in
 * dark mode, and near enough in red — so a mark drawn from `--foreground` flips
 * to near-white against a background that did not change, and the texture that
 * reads clearly in light mode all but vanishes in dark. Only the two mid-toned
 * bands are textured (Ready is solid), so one dark ink works on both in both
 * schemes.
 */
const MARK_INK = '#000';
export function BandPatternDefs({ id, unit }: { id: string; unit: number }) {
  // Clamped, because a degenerate viewBox (a single-facility LGA, a map
  // measured before layout) would otherwise ask for a zero-width tile — and
  // Chrome drops the whole pattern rather than just the texture, so the polygon
  // renders with no fill at all, which reads as missing data.
  const u = Math.max(0.05, unit);

  return (
    <defs>
      {BANDS.map((band) => (
        <pattern
          key={band}
          id={bandPatternId(id, band)}
          width={u}
          height={u}
          patternUnits="userSpaceOnUse"
          patternTransform={BAND_TEXTURE[band] === 'stripes' ? 'rotate(135)' : undefined}
        >
          <rect width={u} height={u} className={PATTERN_FILL[band]} />
          {BAND_TEXTURE[band] === 'dots' && (
            <circle cx={u / 2} cy={u / 2} r={u * 0.19} fill={MARK_INK} fillOpacity={0.36} />
          )}
          {BAND_TEXTURE[band] === 'stripes' && (
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={u}
              stroke={MARK_INK}
              // Weighted to match the dots' apparent density rather than their
              // geometry: a 1px line reads lighter than a dot of the same area,
              // and the two textures have to feel like one scale.
              strokeWidth={u * 0.34}
              strokeOpacity={0.34}
            />
          )}
        </pattern>
      ))}
    </defs>
  );
}
