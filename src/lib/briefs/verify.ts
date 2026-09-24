import { unverifiedFigures as unverified } from '../figures';
import type { BriefFacts } from './facts';

/**
 * Every figure in a brief's words must be one of its facts.
 *
 * The narrative is written by a model and edited by a reviewer; either can
 * slip a number that the data does not hold. The drafting script records
 * these for the reviewer, the brief page flags them on a draft, and a test
 * fails if an approved brief has any. The matching itself is `lib/figures`.
 */
export function unverifiedFigures(text: string, facts: BriefFacts): string[] {
  return unverified(text, facts);
}
