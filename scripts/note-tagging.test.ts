/* eslint-disable @typescript-eslint/no-explicit-any -- tests read recorded requests loosely. */
import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS, tagBatch, type TaggingClient } from './note-tagging';

/** A stand-in model: replies in turn, and records what it was sent. */
function client(replies: (object | Error)[]) {
  const sent: any[] = [];
  const c = {
    responses: {
      create: async (body: any) => {
        sent.push(body);
        const next = replies.shift();
        if (next instanceof Error) throw next;
        return { output_text: JSON.stringify(next) };
      },
    },
  } as unknown as TaggingClient;
  return { c, sent };
}

const items = [
  { id: 'n1', text: 'Needs a boat to cross the river; no fence.' },
  { id: 'n2', text: 'Everything works well.' },
];

describe('tagBatch', () => {
  it('sends the notes by id only, unstored, and reads the tags back', async () => {
    const { c, sent } = client([
      {
        results: [
          { id: 'n1', themes: ['access', 'security', 'security'] },
          { id: 'n2', themes: [] },
        ],
      },
    ]);
    const tags = await tagBatch(c, 'm', items);
    expect(tags.get('n1')).toEqual(['access', 'security']);
    expect(tags.get('n2')).toEqual([]);
    expect(sent[0].store).toBe(false);
    expect(sent[0].instructions).toBe(INSTRUCTIONS);
    expect(JSON.parse(sent[0].input[0].content)).toEqual([
      { id: 'n1', note: items[0]!.text },
      { id: 'n2', note: items[1]!.text },
    ]);
    expect(sent[0].text.format.strict).toBe(true);
  });

  it('drops ids it did not send and themes not on the list', async () => {
    const { c } = client([
      { results: [{ id: 'n1', themes: ['access', 'weather'] }, { id: 'n9', themes: ['power'] }] },
    ]);
    const tags = await tagBatch(c, 'm', items);
    expect([...tags]).toEqual([['n1', ['access']]]);
  });

  it('retries a rate limit, and gives up on a bad request', async () => {
    const limited = Object.assign(new Error('slow down'), { status: 429 });
    const { c, sent } = client([limited, { results: [{ id: 'n1', themes: ['power'] }] }]);
    const tags = await tagBatch(c, 'm', items, async () => {});
    expect(sent).toHaveLength(2);
    expect(tags.get('n1')).toEqual(['power']);

    const bad = Object.assign(new Error('bad'), { status: 400 });
    await expect(tagBatch(client([bad]).c, 'm', items, async () => {})).rejects.toThrow('bad');
  });
});
