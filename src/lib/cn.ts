import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The type scale's step names, repeated here because tailwind-merge cannot read
 * the Tailwind config.
 *
 * Without this list, `twMerge` sees `text-prose` and `text-muted-foreground` in
 * one `cn()` call, recognises neither name as a font size — its built-in list
 * is Tailwind's own `xs`/`sm`/`base`/… — and so files both under *text colour*,
 * where later wins and the size is deleted. The class never reaches the DOM,
 * nothing errors, the build passes, and the element quietly renders at the
 * inherited 16px. Every step therefore has to be named here as well as in
 * `tailwind.config.js`; adding one in only one place is the failure mode, and
 * it is a silent one.
 */
const FONT_SIZES = [
  'tick',
  'note',
  'body',
  'prose',
  'lead',
  'title',
  'figure-sm',
  'figure',
  'hero',
  'display',
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...FONT_SIZES] }] } },
});

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
