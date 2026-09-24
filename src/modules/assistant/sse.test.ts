import { describe, expect, it } from 'vitest';
import { createSseReader } from './sse';

describe('createSseReader', () => {
  it('reads whole events and holds a partial one for the next chunk', () => {
    const read = createSseReader();
    expect(read('data: {"type":"text","delta":"Hel')).toEqual([]);
    expect(read('lo"}\n\ndata: {"type":"done"}\n\n')).toEqual([
      { type: 'text', delta: 'Hello' },
      { type: 'done' },
    ]);
  });

  it('skips a malformed event and keeps going', () => {
    const read = createSseReader();
    expect(read('data: {oops\n\ndata: {"type":"done"}\n\n')).toEqual([{ type: 'done' }]);
  });
});
