import { describe, expect, it } from 'vitest';
import { drawnBox } from './useMapViewport';

describe('drawnBox', () => {
  const view = { x: 100, y: 50, w: 200, h: 100 };

  it('is the whole box when the box has the view’s own shape', () => {
    expect(drawnBox({ left: 10, top: 20, width: 400, height: 200 }, view)).toEqual({
      left: 10,
      top: 20,
      scale: 2,
    });
  });

  it('centres the view in a box wider than it, scaled by the height', () => {
    // 600×200 box, 2:1 view → drawn 400×200, 100px margin either side.
    expect(drawnBox({ left: 0, top: 0, width: 600, height: 200 }, view)).toEqual({
      left: 100,
      top: 0,
      scale: 2,
    });
  });

  it('centres the view in a box taller than it, scaled by the width', () => {
    // 400×400 box → drawn 400×200, 100px margin above and below.
    expect(drawnBox({ left: 0, top: 0, width: 400, height: 400 }, view)).toEqual({
      left: 0,
      top: 100,
      scale: 2,
    });
  });

  it('does not divide by zero before the box has a size', () => {
    expect(drawnBox({ left: 0, top: 0, width: 0, height: 0 }, view).scale).toBe(1);
  });
});
