/**
 * Display formatting.
 *
 * Note on names: the assessment data arrives as ODK slugs (`akwa_ibom`,
 * `ndito_eka_iba_health_centre`). The authoritative label comes from the
 * XLSForm `choices` sheet and is resolved at build time — every name in
 * public/data is already the real one — with `titleCaseName()` as the fallback
 * where the choice list has no entry. Title-casing is a heuristic and will
 * mangle names the choice list would have got right, so it is a last resort,
 * not the default path.
 */

import { CURRENCY } from './constants';

/** Health-sector acronyms that must keep a fixed casing. */
const ACRONYMS: Record<string, string> = {
  PHC: 'PHC', PHCC: 'PHCC', HC: 'HC', MCH: 'MCH', CHC: 'CHC', RHC: 'RHC',
  GH: 'GH', FHC: 'FHC', FMC: 'FMC', BHCPF: 'BHCPF', EMR: 'EMR', LGA: 'LGA',
  FCT: 'FCT', ODK: 'ODK', DHIS2: 'DHIS2', ICT: 'ICT', OIC: 'OIC',
  MTN: 'MTN', ISP: 'ISP', UPS: 'UPS', SOP: 'SOP', HMIS: 'HMIS',
};

/**
 * Slug or free text to a display name.
 *
 * Replaces underscores/hyphens/slashes with spaces, collapses whitespace,
 * strips trailing punctuation, then title-cases word by word while preserving
 * known acronyms.
 */
export function titleCaseName(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const cleaned = value
    .replace(/[_\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
    .trim();
  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS[upper] !== undefined) return ACRONYMS[upper];
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Repair CP1252/UTF-8 double-encoding.
 *
 * The source export contains at least one such column — `â‰¤10` for `≤10` in
 * patient_consultations. Sweep during ETL rather than patching at render time.
 */
export function fixMojibake(value: string): string {
  if (!/[ÂÃâ€]/.test(value)) return value;
  try {
    return new TextDecoder('utf-8').decode(
      Uint8Array.from(value, (c) => c.charCodeAt(0) & 0xff),
    );
  } catch {
    return value;
  }
}

/**
 * Split an ODK multi-select cell into tokens.
 *
 * Multi-selects arrive space-delimited inside one cell (`"laptop tablet
 * smartphone"`). Comparing the whole cell against a single option undercounts
 * badly — `laptop tablet`, `tablet laptop` and `laptop` all mean "has a laptop".
 */
export function tokenizeMultiSelect(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value.trim().split(/\s+/).filter((t) => t && t !== 'none');
}

export function hasOption(value: unknown, option: string): boolean {
  return tokenizeMultiSelect(value).includes(option);
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export function formatScore(score: number | null | undefined, dp = 1): string {
  if (score == null || !Number.isFinite(score)) return '—';
  return score.toFixed(dp);
}

export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-NG');
}

export function formatPercent(
  value: number | null | undefined,
  dp = 0,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(dp)}%`;
}

export function percentOf(part: number, whole: number, dp = 0): string {
  if (!whole) return '—';
  return formatPercent((part / whole) * 100, dp);
}

/**
 * A share of a population, for display beside its own count.
 *
 * As `percentOf`, except a non-zero part that rounds to zero is written `<1%`.
 * One ready facility out of 255 is a real finding, and "1  0%" beside it reads
 * as a rounding error or a contradiction.
 */
export function formatShare(part: number, whole: number): string {
  if (!whole) return '—';
  const share = (part / whole) * 100;
  return part > 0 && share < 0.5 ? '<1%' : formatPercent(share);
}

/** Naira, compacted for headline figures (₦100.0bn) or full for tables. */
export function formatNaira(
  amount: number | null | undefined,
  compact = false,
): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  if (!compact) {
    return `${CURRENCY.symbol}${Math.round(amount).toLocaleString(CURRENCY.locale)}`;
  }
  const units: [number, string][] = [
    [1e12, 'tn'],
    [1e9, 'bn'],
    [1e6, 'm'],
    [1e3, 'k'],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(amount) >= size) {
      return `${CURRENCY.symbol}${(amount / size).toFixed(1)}${suffix}`;
    }
  }
  return `${CURRENCY.symbol}${Math.round(amount)}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Stable slug for URLs and geo keys. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
