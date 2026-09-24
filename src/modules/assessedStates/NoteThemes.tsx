import { useMemo } from 'react';
import { formatCount, formatShare } from '@/lib/format';
import {
  NOTE_THEME_LABEL,
  countNoteThemes,
  type NoteThemesFile,
} from '@/lib/notes/themes';
import type { FacilitySummary } from '@/lib/types';
import { useExplainTables, useExplaining } from '@/modules/explain/context';

/**
 * What assessors noted — the themes raised in the free-text notes, counted
 * over the facilities in scope. See `lib/notes/themes`.
 *
 * Plain ink and a neutral bar, like the coverage figures: a theme is something
 * an assessor wrote down, not a readiness reading, and giving it a band colour
 * would claim a judgement the notes do not make. The share is of facilities
 * *with a note*, the only population the themes can speak for, and the line
 * above the bars says how many that is.
 */
export function NoteThemesSummary({
  facilities,
  file,
}: {
  facilities: FacilitySummary[];
  file: NoteThemesFile;
}) {
  const counts = useMemo(() => countNoteThemes(facilities, file), [facilities, file]);
  const top = counts.themes[0]?.facilities ?? 0;

  const explaining = useExplaining();
  const tables = useMemo(
    () =>
      explaining && counts.withNote
        ? [
            {
              title: `Of ${formatCount(counts.withNote)} facilities with a note, of ${formatCount(counts.facilities)} in scope`,
              columns: ['Theme', 'Facilities', 'Share of facilities with a note'],
              rows: counts.themes.map((t) => [
                t.label,
                formatCount(t.facilities),
                formatShare(t.facilities, counts.withNote),
              ]),
            },
          ]
        : null,
    [explaining, counts],
  );
  useExplainTables('notes', tables);

  if (!counts.withNote) {
    return (
      <p className="text-prose italic text-muted-foreground">
        No assessor wrote a note at the facilities in scope.
      </p>
    );
  }

  return (
    <div>
      <p className="text-body leading-snug text-muted-foreground">
        From the notes written at{' '}
        <span className="mono font-semibold text-foreground">{formatCount(counts.withNote)}</span>{' '}
        of {formatCount(counts.facilities)} facilities. A note can raise several themes.
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {counts.themes.map((t) => (
          <li key={t.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-prose text-foreground">{t.label}</span>
              <span className="mono shrink-0 whitespace-nowrap text-body tabular-nums">
                <span className="font-semibold text-foreground">{formatCount(t.facilities)}</span>
                <span className="ml-1.5 text-muted-foreground">
                  {formatShare(t.facilities, counts.withNote)}
                </span>
              </span>
            </div>
            <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-surface-sunk">
              <span
                className="block h-full rounded-full bg-foreground/55"
                style={{ width: `${top ? (t.facilities / top) * 100 : 0}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-note leading-snug text-muted-foreground">
        Tagged by AI from the assessors&rsquo; free-text notes
        {file.reviewedBy ? `, checked by ${file.reviewedBy}` : ' — not yet reviewed'}. The
        notes themselves are not shown.
      </p>
    </div>
  );
}

/** One facility's themes, as a short list of labels. */
export function FacilityNoteThemes({
  facility,
  file,
}: {
  facility: FacilitySummary;
  file: NoteThemesFile;
}) {
  const themes = file.facilities[facility.uuid];
  if (!themes) {
    return <p className="text-prose italic text-muted-foreground">No note was written here.</p>;
  }
  if (!themes.length) {
    return (
      <p className="text-prose italic text-muted-foreground">
        The assessor&rsquo;s note raises no problem.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {themes.map((t) => (
        <li
          key={t}
          className="rounded-[4px] border border-border bg-surface-sunk/60 px-2 py-0.5 text-body text-foreground"
        >
          {NOTE_THEME_LABEL[t]}
        </li>
      ))}
    </ul>
  );
}
