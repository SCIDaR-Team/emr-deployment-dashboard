import { describe, expect, it } from 'vitest';
import { formatUnits } from './format';

describe('formatUnits', () => {
  it('adds an s to the units the source uses', () => {
    expect(formatUnits(5, 'tablet')).toBe('5 tablets');
    expect(formatUnits(13, 'electric fan')).toBe('13 electric fans');
  });

  it('takes "ies" after a consonant and y', () => {
    expect(formatUnits(571, 'facility')).toBe('571 facilities');
    expect(formatUnits(1032, 'facility')).toBe('1,032 facilities');
  });

  it('keeps the s after a vowel and y', () => {
    expect(formatUnits(2, 'day')).toBe('2 days');
  });

  it('leaves one of anything singular', () => {
    expect(formatUnits(1, 'facility')).toBe('1 facility');
    expect(formatUnits(1, 'desk')).toBe('1 desk');
  });
});
