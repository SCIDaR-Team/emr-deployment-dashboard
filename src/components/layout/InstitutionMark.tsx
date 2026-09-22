import { useState } from 'react';
import { cn } from '@/lib/cn';
import { INSTITUTION } from '@/lib/constants';

/**
 * The institutional mark — NPHCDA's crest, with a monogram fallback.
 *
 * Drawn wherever the product signs its own name: the landing page's wordmark
 * and the rail's home button. Shared rather than written twice, because the
 * fallback is the part that has to agree — a page showing the crest beside a
 * rail showing `ER` reads as two products.
 *
 * **The fallback is decided at runtime, not build time.** The file lives in
 * `public/`, which Vite copies rather than bundles, so nothing in the app can
 * know at compile time whether it is there. The image's own `error` event
 * switches to the monogram tile, which means the artwork can be dropped in or
 * pulled out as a file operation with no code change either way, and a missing
 * file degrades to a mark rather than to a broken-image glyph.
 *
 * **A white tile in both schemes**, following the same rule as the operator
 * chips in `CoveragePane`: institutional artwork is coloured ink drawn for a
 * light ground, and a crest placed straight onto the dark scheme's rail loses
 * its outlines. `object-contain`, so a crest of any aspect ratio letterboxes
 * rather than distorts.
 *
 * **`alt=""` deliberately.** Every call site sets the name in text immediately
 * beside the mark, inside the same link; announcing the agency twice in one
 * link is noise, not access.
 */

/**
 * Two sizes, and the monogram treatment differs with them.
 *
 * Filled ink at `md`, where the mark is the largest thing in a quiet header and
 * can carry the weight; outlined at `sm`, where a solid 26px block beside four
 * nav links would out-shout the active-item marker. Same reasoning as the rest
 * of the rail: furniture stays quiet so state can be loud.
 */
const SIZES = {
  md: {
    tile: 'h-[38px] w-[38px] rounded-[4px] p-[3px]',
    monogram:
      'h-[38px] w-[38px] rounded-[4px] bg-foreground text-body text-surface',
  },
  sm: {
    tile: 'h-[26px] w-[26px] rounded-[3px] p-[2px]',
    monogram:
      'h-[26px] w-[26px] rounded-[3px] border-[1.5px] border-foreground text-note text-foreground',
  },
} as const;

export function InstitutionMark({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [artworkMissing, setArtworkMissing] = useState(false);
  const style = SIZES[size];

  if (artworkMissing) {
    return (
      <span
        className={cn(
          'mono grid shrink-0 place-items-center font-bold tracking-tighter',
          style.monogram,
          className,
        )}
      >
        ER
      </span>
    );
  }

  return (
    <img
      src={INSTITUTION.logo}
      alt=""
      onError={() => setArtworkMissing(true)}
      className={cn('shrink-0 bg-white object-contain ring-1 ring-border', style.tile, className)}
    />
  );
}
