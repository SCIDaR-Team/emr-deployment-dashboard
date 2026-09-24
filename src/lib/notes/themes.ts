import type { FacilitySummary } from '../types';

/**
 * What assessors noted — the themes raised in the survey's free-text remarks.
 *
 * Every facility visit ended with an open comments box. Those notes carry what
 * the structured questions cannot: a river to cross, no fence, a borrowed
 * room. `npm run notes:themes` has an AI model tag each note with the themes
 * below (personal details removed first), and only the tags are published, in
 * `public/data/note-themes.json`. The notes themselves never reach the
 * dashboard.
 *
 * The list is fixed, so a tag means the same thing in every state, and each
 * theme is a problem or need raised — a note that only says what works gets
 * no tag.
 */

export const NOTE_THEMES = [
  {
    id: 'access',
    label: 'Access and terrain',
    means:
      'Hard to reach: bad or no road, river or creek crossings, boats, flooding, seasonal access, remoteness, long distance.',
  },
  {
    id: 'security',
    label: 'Security',
    means:
      'Insecurity in the area, banditry, theft or vandalism, no fence, no gate, no security guard.',
  },
  {
    id: 'building',
    label: 'Building and space',
    means:
      'No proper building, dilapidated or unfinished structure, leaking roof, rented or borrowed space, too few rooms, under renovation.',
  },
  {
    id: 'staffing',
    label: 'Staffing',
    means:
      'Too few health workers, reliance on volunteers, missing cadres, staff needed or requested.',
  },
  {
    id: 'staff_housing',
    label: 'Staff accommodation',
    means: 'No staff quarters or housing for staff.',
  },
  {
    id: 'water_sanitation',
    label: 'Water and sanitation',
    means: 'No water supply or borehole, no toilets, poor sanitation.',
  },
  {
    id: 'power',
    label: 'Power supply',
    means: 'No or unreliable electricity, grid, solar, generator or fuel problems.',
  },
  {
    id: 'connectivity',
    label: 'Network and internet',
    means: 'Poor or no mobile network signal, no internet.',
  },
  {
    id: 'ict_devices',
    label: 'Computers and devices',
    means: 'No or too few computers, tablets, phones or printers; broken devices.',
  },
  {
    id: 'equipment_supplies',
    label: 'Equipment and supplies',
    means:
      'Medical equipment, furniture, beds, laboratory, drugs or commodities lacking or broken.',
  },
  {
    id: 'digital_skills',
    label: 'Digital skills and training',
    means: 'Staff lack computer skills, need training, or are unsure about digital records.',
  },
  {
    id: 'funding_support',
    label: 'Funding and support',
    means:
      'No funds or funding delays (e.g. BHCPF), requests for government or partner support, management problems.',
  },
  {
    id: 'service_use',
    label: 'Patients and community',
    means:
      'Low patient turnout, community issues, catchment population, cost of services to patients.',
  },
] as const;

export type NoteThemeId = (typeof NOTE_THEMES)[number]['id'];

export const NOTE_THEME_IDS = NOTE_THEMES.map((t) => t.id) as NoteThemeId[];
export const NOTE_THEME_LABEL = Object.fromEntries(
  NOTE_THEMES.map((t) => [t.id, t.label]),
) as Record<NoteThemeId, string>;

/** `public/data/note-themes.json`. */
export interface NoteThemesFile {
  /** The day the notes were tagged, and by which model. */
  generated: string;
  model: string;
  /** Who checked the tags. Empty until someone has; the live site then shows nothing. */
  reviewedBy: string;
  /** Facility uuid → the themes its note raises. Only facilities whose note said
   *  something are listed; an empty list is a note with no problem in it. */
  facilities: Record<string, NoteThemeId[]>;
}

export interface NoteThemeCounts {
  /** Facilities in scope. */
  facilities: number;
  /** Of them, those whose assessor wrote a usable note. */
  withNote: number;
  /** Facilities raising each theme, most first; themes nobody raised are left out. */
  themes: { id: NoteThemeId; label: string; facilities: number }[];
}

export function countNoteThemes(
  facilities: readonly FacilitySummary[],
  file: NoteThemesFile,
): NoteThemeCounts {
  const counts = new Map<NoteThemeId, number>();
  let withNote = 0;
  for (const f of facilities) {
    const themes = file.facilities[f.uuid];
    if (!themes) continue;
    withNote += 1;
    for (const t of new Set(themes)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return {
    facilities: facilities.length,
    withNote,
    themes: NOTE_THEMES.filter((t) => counts.has(t.id))
      .map((t) => ({ id: t.id, label: t.label, facilities: counts.get(t.id)! }))
      .sort((a, b) => b.facilities - a.facilities || a.label.localeCompare(b.label)),
  };
}
