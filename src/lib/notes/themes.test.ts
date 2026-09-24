import { describe, expect, it } from 'vitest';
import type { FacilitySummary } from '../types';
import { NOTE_THEME_IDS, countNoteThemes, type NoteThemesFile } from './themes';

const f = (uuid: string) => ({ uuid }) as FacilitySummary;
const file: NoteThemesFile = {
  generated: '2026-09-24',
  model: 'm',
  reviewedBy: '',
  facilities: { a: ['access', 'security'], b: ['security'], c: [], z: ['power'] },
};

describe('countNoteThemes', () => {
  it('counts facilities per theme over the facilities in scope, most first', () => {
    const c = countNoteThemes([f('a'), f('b'), f('c'), f('d')], file);
    expect(c.facilities).toBe(4);
    // `c` wrote a note that raises nothing; `d` wrote none. `z` is out of scope.
    expect(c.withNote).toBe(3);
    expect(c.themes.map((t) => [t.id, t.facilities])).toEqual([
      ['security', 2],
      ['access', 1],
    ]);
  });

  it('has unique theme ids', () => {
    expect(new Set(NOTE_THEME_IDS).size).toBe(NOTE_THEME_IDS.length);
  });
});
