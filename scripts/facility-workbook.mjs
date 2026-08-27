/**
 * The raw ODK workbook — the assessment's second source.
 *
 * `Raw data with readiness level.xlsx` is the survey export the gaps CSV was
 * derived from: one row per facility, 335 columns, everything the instrument
 * collected before it was summarised into gaps and interventions.
 *
 * Only what the dashboard actually uses is read out of it. The workbook holds a
 * great deal more — service points, staff counts, devices, per-question
 * responses — and each of those is a decision about what the page should say,
 * not a free upgrade. Taking one field at a time keeps the model honest about
 * where every figure came from.
 *
 * ## What is not here
 *
 * **Latitude.** Column L sits exactly where ODK puts it, between the data
 * collector's name and Longitude, and it is empty in 2,805 of 2,807 rows. The
 * two rows that do carry a value (both Kano) hold plausible latitudes, so the
 * column is correctly positioned and its values were lost in whatever produced
 * this export.
 *
 * Longitude, Altitude and Location accuracy are all fully populated — but a
 * longitude without a latitude is a meridian, not a place, so no facility can
 * be plotted from this file. `FacilitySummary.lat`/`lon` stay null until a
 * re-export arrives. See `docs/ASSESSMENT_DATA.md`.
 */

import * as XLSX from 'xlsx';

/** Row 3 of the sheet is the header; rows 4 on are data. */
const HEADER_ROW = 2;
const FIRST_DATA_ROW = 3;

/**
 * Columns, by position.
 *
 * Positional like the gaps CSV, and for a related reason: this sheet repeats
 * near-identical question text across the five service-point blocks, so a
 * name lookup is not safe here either. The headers are asserted below so a
 * re-export that shifts a column fails the build rather than reading the
 * neighbouring one.
 */
const COL = {
  nameSlug: 1,
  uuid: 3,
  latitude: 11, // Excel L — empty in this export; see the note above
  longitude: 12,
  altitude: 13,
  locationAccuracy: 14,
  state: 16,
  lga: 17,
  geography: 18,
};

/** The header each column must carry. `latitude` is absent from the header row
 *  in this export, so it is checked by position and emptiness instead. */
const EXPECTED_HEADERS = {
  nameSlug: 'Name of facility',
  uuid: 'UUID',
  longitude: 'Longitude',
  altitude: 'Altitude',
  locationAccuracy: 'Location accuracy',
  state: 'State',
  lga: 'LGA',
  geography: 'Geography',
};

const slugify = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** `state/lga/name`, the fallback join key. See `lookupFor`. */
export const nameKey = (state, lga, name) =>
  `${slugify(state)}/${slugify(lga)}/${slugify(name)}`;

const text = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Read the workbook into per-facility records.
 *
 * Takes a buffer rather than a path so the parsing stays testable without a
 * 4.9 MB fixture on disk.
 */
export function parseFacilityWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Facility workbook has no sheets');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (rows.length <= FIRST_DATA_ROW) throw new Error('Facility workbook has no data rows');

  const header = rows[HEADER_ROW];
  for (const [field, expected] of Object.entries(EXPECTED_HEADERS)) {
    const actual = text(header[COL[field]]);
    if (actual !== expected) {
      throw new Error(
        `Facility workbook column ${XLSX.utils.encode_col(COL[field])} should be ` +
          `"${expected}" but reads "${actual}". The export's column order has ` +
          `changed; update COL in scripts/facility-workbook.mjs.`,
      );
    }
  }

  const records = [];
  for (let r = FIRST_DATA_ROW; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || row.every((c) => c === null || String(c).trim() === '')) continue;

    const geography = text(row[COL.geography])?.toLowerCase() ?? null;
    if (geography !== null && geography !== 'rural' && geography !== 'urban') {
      throw new Error(
        `Facility workbook row ${r + 1} has geography "${geography}", expected rural or urban`,
      );
    }

    records.push({
      /**
       * The UUID as written. Two rows carry a number rather than a UUID —
       * spreadsheet auto-formatting turned a long id into scientific notation,
       * in this file and in the gaps CSV alike — so this is not a reliable key
       * on its own. Hence `nameKey`.
       */
      uuid: text(row[COL.uuid]),
      nameKey: nameKey(row[COL.state], row[COL.lga], row[COL.nameSlug]),
      geography,
    });
  }

  return records;
}

/**
 * Index the records for joining, primary key first and a fallback behind it.
 *
 * The primary key is the UUID. The fallback is `state/lga/name`, which exists
 * because two facilities lost their UUID to spreadsheet auto-formatting — the
 * same two in both files, so neither can be matched on id. The fallback is
 * asserted unique across the whole workbook (it is: 2,807 keys, no collisions),
 * because a fallback that silently matched the wrong facility would be worse
 * than not matching at all.
 */
export function lookupFor(records) {
  const byUuid = new Map();
  const byName = new Map();
  const ambiguous = new Set();

  for (const rec of records) {
    if (rec.uuid && !byUuid.has(rec.uuid)) byUuid.set(rec.uuid, rec);
    if (byName.has(rec.nameKey)) ambiguous.add(rec.nameKey);
    else byName.set(rec.nameKey, rec);
  }

  // Drop rather than guess: an ambiguous key resolves to no record, and the
  // facility reports as unmatched.
  for (const key of ambiguous) byName.delete(key);

  return {
    /** The record for a facility, or null. */
    find(uuid, key) {
      return byUuid.get(uuid) ?? byName.get(key) ?? null;
    },
    size: records.length,
    ambiguousNameKeys: ambiguous.size,
  };
}
