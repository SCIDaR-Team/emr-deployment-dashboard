import { Check, CircleSlash, Minus } from 'lucide-react';
import {
  BAND_CLASSES,
  BAND_LABEL,
} from '@/lib/bands';
import { cn } from '@/lib/cn';
import type { Band } from '@/lib/types';

/**
 * Readiness band pill.
 *
 * Carries an icon as well as a colour — the three-band scale is red/amber/green,
 * which is exactly the combination that disappears for the most common forms of
 * colour-vision deficiency and in greyscale print.
 */

const ICONS: Record<Band, typeof Check> = {
  ready: Check,
  moderately_ready: Minus,
  not_ready: CircleSlash,
};

/**
 * The band's icon on its own, for the places a full pill does not fit — a score
 * in a 3.5rem-wide small multiple, a cell in a dense table. Same three glyphs
 * as the badge, so the vocabulary is learnt once.
 *
 * Always give it a name or mark it decorative at the call site: on its own an
 * icon is not a label, and this is the form of the band that carries the least
 * text with it.
 */
export function BandIcon({
  band,
  className,
  label,
}: {
  band: Band | null;
  className?: string;
  /** Accessible name. Omit only where the band is already stated in text. */
  label?: string;
}) {
  if (!band) return null;
  const Icon = ICONS[band];
  return (
    <>
      <Icon className={className} aria-hidden />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}

interface BandBadgeProps {
  band: Band | null;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export function BandBadge({
  band,
  size = 'md',
  showIcon = true,
  className,
}: BandBadgeProps) {
  if (!band) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-muted font-medium text-muted-foreground',
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
          className,
        )}
      >
        No data
      </span>
    );
  }

  const Icon = ICONS[band];
  const classes = BAND_CLASSES[band];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        classes.wash,
        classes.text,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        className,
      )}
    >
      {showIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />}
      {BAND_LABEL[band]}
    </span>
  );
}
