/** Types for the parts of `facility-workbook.mjs` that TypeScript scripts use. */
export function nameKey(state: unknown, lga: unknown, name: unknown): string;
export function lookupFor<T extends { uuid: string | null; nameKey: string }>(
  records: T[],
): {
  find(uuid: string | null | undefined, key: string): T | null;
  size: number;
  ambiguousNameKeys: number;
};
