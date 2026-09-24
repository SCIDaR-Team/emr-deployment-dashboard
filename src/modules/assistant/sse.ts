/**
 * The assistant's events off the wire.
 *
 * The endpoint streams server-sent events, one JSON object per `data:` line.
 * A network chunk can end mid-event, so the reader keeps what it has not yet
 * seen a blank line for and completes it with the next chunk.
 */

export interface AssistantLink {
  label: string;
  href: string;
}

export type AssistantEvent =
  | { type: 'text'; delta: string }
  | { type: 'activity'; label: string }
  | { type: 'links'; links: AssistantLink[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

export function createSseReader(): (chunk: string) => AssistantEvent[] {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const events: AssistantEvent[] = [];
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        events.push(JSON.parse(data) as AssistantEvent);
      } catch {
        // A malformed event is skipped rather than ending the answer.
      }
    }
    return events;
  };
}
