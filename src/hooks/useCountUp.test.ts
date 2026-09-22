import { describe, expect, it } from 'vitest';
import { easeOutQuint } from './useCountUp';

describe('easeOutQuint', () => {
  it('starts at zero and ends at one', () => {
    expect(easeOutQuint(0)).toBe(0);
    expect(easeOutQuint(1)).toBe(1);
  });

  it('clamps outside the unit interval, so a late frame cannot overshoot', () => {
    expect(easeOutQuint(-0.5)).toBe(0);
    expect(easeOutQuint(2)).toBe(1);
  });

  it('front-loads the distance, so the figure is readable early', () => {
    // The point of the curve: a third of the time covers most of the count.
    expect(easeOutQuint(1 / 3)).toBeGreaterThan(0.85);
    // And it is monotonic, so a figure never counts backwards.
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const eased = easeOutQuint(t);
      expect(eased).toBeGreaterThan(previous);
      previous = eased;
    }
  });
});
