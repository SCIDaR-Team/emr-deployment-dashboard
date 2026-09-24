import { useFetchJSON } from '@/hooks/useFetchJSON';
import { DATA_PATHS } from '@/lib/constants';
import { SHOW_DRAFTS } from '@/lib/drafts';
import type { NoteThemesFile } from '@/lib/notes/themes';

/**
 * The note themes, when this build may show them: once someone has reviewed
 * the tags, or anywhere drafts are shown. Null until then, and null if the
 * file is not there — the themes are optional, and a page without them is the
 * page as it was.
 */
export function useNoteThemes(): NoteThemesFile | null {
  const { data } = useFetchJSON<NoteThemesFile | null>({
    path: DATA_PATHS.noteThemes,
    fallback: null,
  });
  if (!data?.facilities) return null;
  return data.reviewedBy || SHOW_DRAFTS ? data : null;
}
