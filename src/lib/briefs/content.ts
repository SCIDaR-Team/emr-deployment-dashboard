import { parseBrief, type BriefDocument } from './document';

/**
 * The briefs in `src/content/briefs`, bundled with the site.
 *
 * Twelve short text files, so they are read eagerly: whether a state has a
 * brief is known the moment a page renders, and the button that opens it
 * never flickers in. Drafts are visible only where they are being reviewed —
 * `npm run dev`, or a build with `VITE_SHOW_DRAFT_BRIEFS=true` — and the live
 * site shows approved briefs alone.
 */

const FILES = import.meta.glob('/src/content/briefs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const SHOW_DRAFT_BRIEFS =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DRAFT_BRIEFS === 'true';

const BY_STATE = new Map<string, BriefDocument>();
for (const [path, text] of Object.entries(FILES)) {
  const doc = parseBrief(text);
  const id = path.split('/').pop()!.replace(/\.md$/, '');
  if (doc) BY_STATE.set(id, doc);
}

/** The state's brief as this build may show it, or null. */
export function briefFor(stateId: string): BriefDocument | null {
  const doc = BY_STATE.get(stateId) ?? null;
  if (!doc) return null;
  return doc.status === 'approved' || SHOW_DRAFT_BRIEFS ? doc : null;
}

/** Whether this build offers a brief for the state at all. In review, every
 *  assessed state has a page, written or not, so the figures can be seen
 *  before the words exist. */
export function offersBrief(stateId: string): boolean {
  return SHOW_DRAFT_BRIEFS || briefFor(stateId) !== null;
}
