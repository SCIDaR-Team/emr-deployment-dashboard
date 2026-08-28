/**
 * The raw ODK workbook — the assessment's second source.
 *
 * The survey export the gaps CSV was derived from: one row per facility, and
 * everything the instrument collected before it was summarised into gaps and
 * interventions. Read from `ERA dataset_v4 (1).xlsx`, which is **not committed**
 * — see `.gitignore`, and `WORKBOOK` in `scripts/ingest-assessment.mjs` for
 * what happens when it is absent.
 *
 * Only what the dashboard actually uses is read out of it. The workbook holds a
 * great deal more — service points, staff counts, devices, per-question
 * responses — and each of those is a decision about what the page should say,
 * not a free upgrade. Taking one field at a time keeps the model honest about
 * where every figure came from.
 *
 * ## Why it finds its sheet and header instead of counting to them
 *
 * There was an earlier export of this same survey, `Raw data with readiness
 * level.xlsx`, with identical columns in identical positions — and column L,
 * Latitude, empty in 2,805 of its 2,807 rows. A longitude without a latitude is
 * a meridian rather than a place, so nothing could be plotted from it.
 *
 * The ERA workbook carries the same sheet with latitude populated, one header
 * row higher, and behind several other sheets. Those are exactly the two
 * differences a hardcoded offset reads straight past: it would take the
 * numbering row for headers and match nothing, silently. So the sheet is found
 * by name and the header by content, and both exports parse.
 *
 * Column positions within the row are still fixed and still asserted — the
 * sheet repeats near-identical question text across its service-point blocks,
 * so a name lookup is not safe for the columns themselves.
 */

import * as XLSX from 'xlsx';

/** The sheet to read, wherever it sits in the book. The ERA workbook opens on
 *  `Raw data ODK`, which is a different shape. */
const SHEET_NAME = 'Raw data with readiness level';

/** How far in to look for the header before giving up. Both known exports put
 *  it in the first three rows. */
const HEADER_SEARCH_LIMIT = 8;

/**
 * Columns, by position, asserted against the header below so a re-export that
 * shifts one fails the build rather than reading its neighbour.
 */
const COL = {
  nameSlug: 1,
  uuid: 3,
  latitude: 11,
  longitude: 12,
  altitude: 13,
  locationAccuracy: 14,
  state: 16,
  lga: 17,
  geography: 18,
};

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

/**
 * Nigeria's bounding box, generously drawn.
 *
 * A coordinate outside it is a transposed pair, a decimal-comma, or a stray
 * cell — all of which would put a clinic in the Gulf of Guinea and none of
 * which should reach the map. Checked rather than trusted, because a plausible
 * wrong position is worse than no position: the reader cannot tell.
 */
const NIGERIA = { minLat: 3.5, maxLat: 14.5, minLon: 2.5, maxLon: 15.0 };

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
  // By name where the book has it — the ERA workbook's first sheet is a
  // different export of the same survey, with different columns.
  const sheet = wb.Sheets[SHEET_NAME] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Facility workbook has no sheets');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  // The header row, found rather than counted: the two known exports put it at
  // different depths, and an offset that is wrong by one reads the numbering
  // row as headers and silently matches nothing.
  const headerRow = rows.findIndex(
    (row, i) => i < HEADER_SEARCH_LIMIT && text(row?.[COL.nameSlug]) === EXPECTED_HEADERS.nameSlug,
  );
  if (headerRow === -1) {
    throw new Error(
      `Facility workbook has no header row in its first ${HEADER_SEARCH_LIMIT} rows — ` +
        `expected "${EXPECTED_HEADERS.nameSlug}" in column ` +
        `${XLSX.utils.encode_col(COL.nameSlug)}.`,
    );
  }
  const firstDataRow = headerRow + 1;
  if (rows.length <= firstDataRow) throw new Error('Facility workbook has no data rows');

  const header = rows[headerRow];
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
  for (let r = firstDataRow; r < rows.length; r += 1) {
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
      ...coordinate(row, r),
    });
  }

  return records;
}

/**
 * A facility's position, or nulls.
 *
 * Both or neither. A longitude without a latitude is a meridian rather than a
 * place, which is exactly what the earlier export supplied — so a half-pair is
 * discarded rather than carried as a coordinate that cannot be plotted.
 *
 * Out-of-country values throw instead of being dropped. A blank is a facility
 * whose GPS did not record; a coordinate in the Atlantic is a column that has
 * moved, and quietly skipping those would let a shifted export through with
 * most of its facilities silently unplottable.
 */
function coordinate(row, r) {
  // Through `text` first: `Number(null)` and `Number('')` are both 0, which is
  // finite, in the Gulf of Guinea, and exactly what the latitude-less export
  // supplies for every row. A blank has to be missing, not the origin.
  const rawLat = text(row[COL.latitude]);
  const rawLon = text(row[COL.longitude]);
  if (rawLat === null || rawLon === null) return { lat: null, lon: null };

  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: null, lon: null };

  if (
    lat < NIGERIA.minLat ||
    lat > NIGERIA.maxLat ||
    lon < NIGERIA.minLon ||
    lon > NIGERIA.maxLon
  ) {
    throw new Error(
      `Facility workbook row ${r + 1} has coordinate ${lat}, ${lon}, which is outside ` +
        `Nigeria. Check that columns ${XLSX.utils.encode_col(COL.latitude)} and ` +
        `${XLSX.utils.encode_col(COL.longitude)} are still Latitude and Longitude, ` +
        `and in that order.`,
    );
  }
  return { lat, lon };
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
