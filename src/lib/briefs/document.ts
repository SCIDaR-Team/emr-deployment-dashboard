/**
 * A state brief on disk: `src/content/briefs/<state-id>.md`.
 *
 *   ---
 *   state: Kano
 *   status: draft            # the reviewer changes this to approved
 *   factsVersion: 1a2b3c4d   # the facts it was written against
 *   drafted: 2026-09-24
 *   model: <the OpenAI model that drafted it>
 *   reviewedBy:              # the reviewer's name, once approved
 *   ---
 *   ## Summary
 *   …
 *
 * Plain Markdown with a small header, so review is editing a text file: read
 * it, change what needs changing, set `status: approved` and your name. The
 * live site shows approved briefs only.
 */

export type BriefStatus = 'draft' | 'approved';

export interface BriefDocument {
  state: string;
  status: BriefStatus;
  factsVersion: string;
  drafted: string;
  model: string;
  reviewedBy: string;
  /** The narrative, as Markdown with `##` section headings. */
  body: string;
}

export function parseBrief(text: string): BriefDocument | null {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*?)\s*(?:#.*)?$/);
    if (kv) meta[kv[1]!] = kv[2]!;
  }
  if (!meta.state) return null;
  return {
    state: meta.state,
    status: meta.status === 'approved' ? 'approved' : 'draft',
    factsVersion: meta.factsVersion ?? '',
    drafted: meta.drafted ?? '',
    model: meta.model ?? '',
    reviewedBy: meta.reviewedBy ?? '',
    body: m[2]!.trim(),
  };
}

export function serializeBrief(doc: BriefDocument): string {
  return `---
state: ${doc.state}
status: ${doc.status}            # change to approved once reviewed
factsVersion: ${doc.factsVersion}
drafted: ${doc.drafted}
model: ${doc.model}
reviewedBy: ${doc.reviewedBy}
---

${doc.body.trim()}
`;
}

/** The narrative split at its `##` headings. */
export function briefSections(body: string): { heading: string; text: string }[] {
  return body
    .split(/^##\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const nl = chunk.indexOf('\n');
      return nl === -1
        ? { heading: chunk, text: '' }
        : { heading: chunk.slice(0, nl).trim(), text: chunk.slice(nl + 1).trim() };
    });
}
