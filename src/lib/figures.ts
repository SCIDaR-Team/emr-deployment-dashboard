/**
 * Every figure in a model's words must be one it was given.
 *
 * A model writing around figures can slip a number the data does not hold —
 * a rounding, a sum, a misremembering. This finds every figure in a text —
 * naira amounts, percentages, counts — and returns the ones that do not
 * appear, exactly as written, anywhere in the source it was written from.
 * Used by the state briefs and by "Explain this chart".
 */

/** ₦1.2bn, ₦45.0m, 67.4%, <1%, 1,125, 438, 3.5 — as figures appear in text. */
const FIGURE = /₦\s?\d[\d,]*(?:\.\d+)?\s?(?:tn|bn|m|k)?|<1%|\d[\d,]*(?:\.\d+)?%?/g;

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

/** The figures in `text` that no string in `source` (searched deeply) holds. */
export function unverifiedFigures(text: string, source: unknown): string[] {
  const known = new Set<string>();
  for (const s of allStrings(source)) {
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
