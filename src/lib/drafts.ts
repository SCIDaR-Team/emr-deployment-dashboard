/**
 * Whether this build shows AI-drafted content that no one has reviewed yet —
 * state briefs still in draft, and note themes without a reviewer.
 *
 * On under `npm run dev`, and in a build with `VITE_SHOW_DRAFT_BRIEFS=true`
 * (the review build). The live site shows reviewed content only.
 */
export const SHOW_DRAFTS =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DRAFT_BRIEFS === 'true';
