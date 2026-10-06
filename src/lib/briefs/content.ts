import { SHOW_DRAFTS } from '../drafts';
import { parseBrief, type BriefDocument } from './document';

/**
 * The briefs in `src/content/briefs`, bundled with the site.
 *
 * Twelve short text files, so they are read eagerly: whether a state has a
 * brief is known the moment a page renders, and the button that opens it
 * never flickers in.
 *
 * Drafts are on the live site. The team reviews the narratives where they
 * will be read rather than on a separate build, so every brief that exists is
 * shown, and one still in draft carries "Draft — under review" on the page,
 * in print and in the Word file (see `BriefPage`, `exportWord`). Approval is
 * still a person setting `status: approved` and their name; it is what takes
 * the label off.
 */

const FILES = import.meta.glob('/src/content/briefs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const SHOW_DRAFT_BRIEFS = SHOW_DRAFTS;

const BY_STATE = new Map<string, BriefDocument>();
for (const [path, text] of Object.entries(FILES)) {
  const doc = parseBrief(text);
  const id = path.split('/').pop()!.replace(/\.md$/, '');
  if (doc) BY_STATE.set(id, doc);
}

/** The state's brief, draft or approved, or null where none is written. */
export function briefFor(stateId: string): BriefDocument | null {
  return BY_STATE.get(stateId) ?? null;
}

/** Whether the State brief button appears for the state. Wherever a brief is
 *  written; and under `npm run dev` (or a `VITE_SHOW_DRAFT_BRIEFS` build) for
 *  every assessed state, so the figures can be seen before the words exist. */
export function offersBrief(stateId: string): boolean {
  return SHOW_DRAFT_BRIEFS || briefFor(stateId) !== null;
}
