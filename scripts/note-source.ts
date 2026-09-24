import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import type { FacilitySummary } from '../src/lib/types';
import { lookupFor, nameKey } from './facility-workbook.mjs';

/**
 * The assessors' free-text notes, read from the ERA workbook and matched to
 * the dashboard's facilities.
 *
 * The column is the survey's `additional_comments-general_remarks`, in the
 * visible "Raw data with readiness level" sheet — the same sheet the ingest
 * reads. It is found by its header rather than by position, and joined on the
 * facility's UUID with `state/lga/name` behind it, as the ingest joins.
 *
 * The notes stay on this machine: nothing here writes them anywhere.
 */

const SHEET = 'Raw data with readiness level';
const REMARKS = 'additional_comments-general_remarks';
const HEADERS = { name: 'Name of facility', uuid: 'UUID', state: 'State', lga: 'LGA' };

/** Notes that say nothing — "nil", "ok", "none" — are left out. */
const EMPTY =
  /^(?:nil|none|nothing|no|n\/?a|ok|okay|good|fine|no comments?|no remarks?|-+|\.+)[.!]?$/i;

export interface FacilityNote {
  facility: FacilitySummary;
  note: string;
}

const text = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

export function readFacilityNotes(
  workbookPath: string,
  facilities: readonly FacilitySummary[],
): { notes: FacilityNote[]; unmatched: number; empty: number } {
  const wb = XLSX.read(readFileSync(workbookPath), { type: 'buffer' });
  const sheet = wb.Sheets[SHEET];
  if (!sheet) throw new Error(`The workbook has no "${SHEET}" sheet.`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  const headerRow = rows.findIndex((r, i) => i < 8 && r?.some((c) => text(c) === REMARKS));
  if (headerRow === -1) throw new Error(`No "${REMARKS}" column in the first rows of "${SHEET}".`);
  // The column names can sit a row above or below the remarks header, as the
  // two exports of this sheet differ; look in the rows around it.
  const col = (header: string) => {
    for (const r of [headerRow, headerRow - 1, headerRow + 1]) {
      const i = rows[r]?.findIndex((c) => text(c) === header) ?? -1;
      if (i >= 0) return i;
    }
    throw new Error(`No "${header}" column near the header of "${SHEET}".`);
  };
  const c = {
    remarks: col(REMARKS),
    name: col(HEADERS.name),
    uuid: col(HEADERS.uuid),
    state: col(HEADERS.state),
    lga: col(HEADERS.lga),
  };

  const records: { uuid: string | null; nameKey: string; note: string | null }[] = [];
  for (const row of rows.slice(headerRow + 1)) {
    if (!row || !text(row[c.name])) continue;
    records.push({
      uuid: text(row[c.uuid]),
      nameKey: nameKey(row[c.state], row[c.lga], row[c.name]),
      note: text(row[c.remarks]),
    });
  }
  const lookup = lookupFor(records);

  const notes: FacilityNote[] = [];
  let unmatched = 0;
  let empty = 0;
  for (const facility of facilities) {
    const rec = lookup.find(facility.uuid, nameKey(facility.state, facility.lga, facility.name));
    if (!rec) {
      unmatched += 1;
      continue;
    }
    const note = rec.note?.replace(/\s+/g, ' ').trim();
    if (!note || note.length < 4 || EMPTY.test(note)) {
      if (note) empty += 1;
      continue;
    }
    notes.push({ facility, note });
  }
  return { notes, unmatched, empty };
}
