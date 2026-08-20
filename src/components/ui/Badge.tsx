import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * A small label pill.
 *
 * Deliberately has no readiness tones. Ready / Moderately ready / Not ready is
 * red-amber-green — the exact combination that fails for the commonest
 * colour-vision deficiencies and in greyscale — so every band indicator has to
 * pair colour with an icon or word. `BandBadge` does that and is the only thing
 * that should ever render a band. Keeping the two apart means a future
 * `<Badge tone="ready">` cannot quietly lose the icon.
 */
export type BadgeTone = 'neutral' | 'brand' | 'info' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  brand: 'bg-brand-50 text-brand-600 border-brand-500/25',
  info: 'bg-brand-50 text-brand-700 border-brand-500/20',
  warning: 'bg-moderate-wash text-foreground border-moderate/40',
  danger: 'bg-notready-wash text-notready border-notready/30',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/**
 * The count-of-things badge used on filter buttons and tab labels.
 *
 * Renders nothing at zero — "0 selected" is noise, and an always-present badge
 * makes it harder to spot the buttons that do hold a selection.
 */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <Badge tone="brand" className={cn('px-1.5 tabular-nums', className)}>
      {count}
    </Badge>
  );
}
