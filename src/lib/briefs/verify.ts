import type { BriefFacts } from './facts';

/**
 * Every figure in a brief's words must be one of its facts.
 *
 * The narrative is written by a model and edited by a reviewer; either can
 * slip a number that the data does not hold. This finds every figure in the
 * text — naira amounts, percentages, counts — and returns the ones that do
 * not appear, exactly as written, among the facts. The drafting script records
 * them for the reviewer, the brief page flags them on a draft, and a test
 * fails if an approved brief has any.
 */

/** ₦1.2bn, ₦45.0m, 67.4%, <1%, 1,125, 438, 3.5 — as figures appear in text. */
const FIGURE = /₦\s?\d[\d,]*(?:\.\d+)?\s?(?:bn|m|k)?|<1%|\d[\d,]*(?:\.\d+)?%?/g;

function figures(text: string): string[] {
  return (text.match(FIGURE) ?? []).map((f) => f.replace(/\s+/g, '').replace(/[.,]$/, ''));
}

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

export function unverifiedFigures(text: string, facts: BriefFacts): string[] {
  const known = new Set<string>();
  for (const s of allStrings(facts)) {
    for (const f of figures(s)) {
      known.add(f);
      // A share may be quoted without its sign ("67.4 per cent").
      if (f.endsWith('%')) known.add(f.slice(0, -1));
    }
  }
  const unknown = new Set<string>();
  for (const f of figures(text)) if (!known.has(f)) unknown.add(f);
  return [...unknown];
}
