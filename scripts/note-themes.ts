/**
 * Tag the assessors' notes with themes.
 *
 *   npm run notes:themes                  tag every note
 *   npm run notes:themes -- --dry-run     remove personal details and write the
 *                                         review file only; nothing is sent
 *   npm run notes:themes -- --limit 100   a trial run on the first 100 notes
 *
 * Reads each facility's free-text note from the ERA workbook on this machine
 * (`note-source.ts`), removes personal details and the facility's own name and
 * place (`note-redact.ts`), and has the OpenAI model tag it with the fixed
 * themes in `src/lib/notes/themes.ts`. Notes are sent in batches under a row
 * number only — no facility name, LGA or state goes with them — and with
 * `store: false`.
 *
 * Writes:
 *   public/data/note-themes.json   facility → themes. The tags only, never the
 *                                  text. `reviewedBy` starts empty; the live
 *                                  site shows the themes once it is set.
 *   note-themes-review.md          counts, and example notes (redacted) per
 *                                  theme, for checking the tags. Git-ignored:
 *                                  it holds note text and stays on this machine.
 *
 * Reads OPENAI_API_KEY and OPENAI_MODEL from `.env.local`.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import OpenAI from 'openai';
import {
  NOTE_THEME_IDS,
  NOTE_THEME_LABEL,
  type NoteThemeId,
  type NoteThemesFile,
} from '../src/lib/notes/themes';
import { loadDashboardData } from '../server/assistant/data';
import { redactNote } from './note-redact';
import { readFacilityNotes, type FacilityNote } from './note-source';
import { tagBatch } from './note-tagging';

const ROOT = resolve(import.meta.dirname, '..');
const WORKBOOK = resolve(ROOT, 'ERA dataset_v4 (1).xlsx');
const OUT = resolve(ROOT, 'public/data/note-themes.json');
const REVIEW = resolve(ROOT, 'note-themes-review.md');
const BATCH = 40;
const PARALLEL = 4;

function args() {
  const a = process.argv.slice(2);
  const i = a.indexOf('--limit');
  return {
    dryRun: a.includes('--dry-run'),
    limit: i >= 0 ? Number(a[i + 1]) : undefined,
  };
}

interface Item {
  id: string;
  note: FacilityNote;
  text: string;
}

/** Run `fn` over `list`, `n` at a time, in order. */
async function pool<T, R>(list: T[], n: number, fn: (t: T, i: number) => Promise<R>) {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i]!, i);
      }
    }),
  );
  return out;
}

function reviewFile(
  items: Item[],
  tags: Map<string, NoteThemeId[]> | null,
  info: { unmatched: number; empty: number; removed: Record<string, number>; model?: string },
): string {
  const clip = (s: string) => (s.length > 320 ? `${s.slice(0, 320)}…` : s);
  const lines = [
    '# Assessors’ notes — review',
    '',
    'Local only: this file holds note text (with personal details removed) and is git-ignored.',
    '',
    `- Facilities with a usable note: ${items.length}`,
    `- Empty notes left out ("nil", "ok"…): ${info.empty}`,
    `- Facilities not found in the workbook: ${info.unmatched}`,
    `- Details removed before sending: ${Object.entries(info.removed)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}`,
    '',
  ];
  if (!tags) {
    lines.push(
      '## Dry run — what would be sent',
      '',
      'The first 40 notes, exactly as they would go:',
      '',
    );
    for (const it of items.slice(0, 40)) lines.push(`- \`${it.id}\` ${clip(it.text)}`);
    return lines.join('\n');
  }

  const untagged = items.filter((it) => !tags.has(it.id)).length;
  lines.push(
    `- Tagged by ${info.model}; notes the model returned no answer for: ${untagged}`,
    '',
    '## How often each theme is raised',
    '',
    '| Theme | Facilities | Share of notes |',
    '|---|---|---|',
  );
  const byTheme = new Map<NoteThemeId, Item[]>();
  for (const it of items)
    for (const t of tags.get(it.id) ?? []) byTheme.set(t, [...(byTheme.get(t) ?? []), it]);
  const ranked = [...byTheme].sort((a, b) => b[1].length - a[1].length);
  for (const [t, list] of ranked)
    lines.push(
      `| ${NOTE_THEME_LABEL[t]} | ${list.length} | ${((list.length / items.length) * 100).toFixed(1)}% |`,
    );
  const none = items.filter((it) => tags.get(it.id)?.length === 0);
  lines.push(
    `| (no theme) | ${none.length} | ${((none.length / items.length) * 100).toFixed(1)}% |`,
  );

  lines.push('', '## Examples per theme', '', 'Check that each note really raises the theme.', '');
  for (const [t, list] of ranked) {
    lines.push(`### ${NOTE_THEME_LABEL[t]}`, '');
    // Spread through the list rather than the first few, which share a state.
    const step = Math.max(1, Math.floor(list.length / 6));
    for (let i = 0; i < list.length && i / step < 6; i += step) {
      const it = list[i]!;
      lines.push(
        `- ${clip(it.text)}  \n  _${it.note.facility.state} · also: ${
          (tags.get(it.id) ?? [])
            .filter((x) => x !== t)
            .map((x) => NOTE_THEME_LABEL[x])
            .join(', ') || '—'
        }_`,
      );
    }
    lines.push('');
  }
  lines.push('## Notes with no theme (a sample)', '');
  for (const it of none.slice(0, 12)) lines.push(`- ${clip(it.text)}`);
  lines.push(
    '',
    '## When it looks right',
    '',
    'Set `"reviewedBy"` in `public/data/note-themes.json` to your name and commit that file.',
    'Do not commit this review file.',
  );
  return lines.join('\n');
}

async function main() {
  const { dryRun, limit } = args();
  const envFile = resolve(ROOT, '.env.local');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const { OPENAI_API_KEY, OPENAI_MODEL } = process.env;
  if (!dryRun && (!OPENAI_API_KEY || !OPENAI_MODEL)) {
    console.error('Set OPENAI_API_KEY and OPENAI_MODEL in .env.local first (or use --dry-run).');
    process.exit(1);
  }
  if (!existsSync(WORKBOOK)) {
    console.error(`The notes are read from "${WORKBOOK}", which is not here.`);
    process.exit(1);
  }

  const data = await loadDashboardData(resolve(ROOT, 'public/data'));
  const { notes, unmatched, empty } = readFacilityNotes(WORKBOOK, data.facilities);
  const removed = { phone: 0, email: 0, name: 0, place: 0 };
  const items: Item[] = notes.slice(0, limit).map((note, i) => {
    const r = redactNote(note.note, {
      facility: note.facility.name,
      lga: note.facility.lga,
      state: note.facility.state,
    });
    for (const k of Object.keys(removed) as (keyof typeof removed)[]) removed[k] += r.removed[k];
    return { id: `n${i + 1}`, note, text: r.text };
  });
  console.log(
    `${items.length} notes to tag (${empty} empty left out, ${unmatched} facilities not in the workbook).`,
  );
  console.log(
    `Removed before sending: ${removed.phone} phone, ${removed.email} email, ${removed.name} names, ${removed.place} facility names and places.`,
  );

  if (dryRun) {
    writeFileSync(REVIEW, reviewFile(items, null, { unmatched, empty, removed }));
    console.log(`Dry run: nothing sent. What would be sent is in ${REVIEW}.`);
    return;
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const batches: Item[][] = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
  const tags = new Map<string, NoteThemeId[]>();
  let done = 0;
  await pool(batches, PARALLEL, async (batch) => {
    let result = await tagBatch(client, OPENAI_MODEL!, batch);
    // Anything the model skipped goes round once more on its own.
    const missed = batch.filter((it) => !result.has(it.id));
    if (missed.length)
      result = new Map([...result, ...(await tagBatch(client, OPENAI_MODEL!, missed))]);
    for (const [id, t] of result) tags.set(id, t);
    done += batch.length;
    process.stdout.write(`\rTagged ${done} of ${items.length}`);
  });
  process.stdout.write('\n');

  const facilities: Record<string, NoteThemeId[]> = {};
  for (const it of [...items].sort((a, b) =>
    a.note.facility.uuid.localeCompare(b.note.facility.uuid),
  )) {
    const t = tags.get(it.id);
    if (t) facilities[it.note.facility.uuid] = NOTE_THEME_IDS.filter((id) => t.includes(id));
  }
  const file: NoteThemesFile = {
    generated: new Date().toISOString().slice(0, 10),
    model: OPENAI_MODEL!,
    reviewedBy: '',
    facilities,
  };
  writeFileSync(OUT, `${JSON.stringify(file)}\n`);
  writeFileSync(
    REVIEW,
    reviewFile(items, tags, { unmatched, empty, removed, model: OPENAI_MODEL }),
  );
  console.log(`Wrote ${OUT} (${Object.keys(facilities).length} facilities).`);
  console.log(`Check the tags in ${REVIEW}, then set "reviewedBy" in the JSON and commit it.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
