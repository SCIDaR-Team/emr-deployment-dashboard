/**
 * The workbook join.
 *
 * The interesting behaviour here is not the parsing — it is what happens when
 * the key is broken, which in this dataset it demonstrably is. Two facilities
 * lost their UUID to spreadsheet auto-formatting (`1.23E+19`), in the gaps CSV
 * and in this workbook alike, so neither can be matched on id and the fallback
 * is the only thing that recovers them.
 *
 * A fallback that matched the *wrong* facility would be worse than leaving the
 * field null, so the ambiguity rule is pinned here too.
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { lookupFor, nameKey, parseFacilityWorkbook } from './facility-workbook.mjs';

/** A miniature of the export: two junk rows, then the header, then data. */
function workbook(rows) {
  const header = [];
  header[1] = 'Name of facility';
  header[3] = 'UUID';
  header[12] = 'Longitude';
  header[13] = 'Altitude';
  header[14] = 'Location accuracy';
  header[16] = 'State';
  header[17] = 'LGA';
  header[18] = 'Geography';

  const aoa = [['Facility demography'], [1, 2, 3], header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Raw data');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const row = ({ uuid, name, state = 'kano', lga = 'dala', geography = 'rural' }) => {
  const r = [];
  r[1] = name;
  r[3] = uuid;
  r[16] = state;
  r[17] = lga;
  r[18] = geography;
  return r;
};

describe('parseFacilityWorkbook', () => {
  it('reads the setting for each facility', () => {
    const records = parseFacilityWorkbook(
      workbook([
        row({ uuid: 'u1', name: 'alpha_health_post', geography: 'rural' }),
        row({ uuid: 'u2', name: 'beta_clinic', geography: 'urban' }),
      ]),
    );

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ uuid: 'u1', geography: 'rural' });
    expect(records[1]).toMatchObject({ uuid: 'u2', geography: 'urban' });
    expect(records[0].nameKey).toBe('kano/dala/alpha_health_post');
  });

  it('throws when a column has moved rather than reading its neighbour', () => {
    // The failure this guards against is silent: the sheet repeats near-
    // identical question text across five service-point blocks, so a shifted
    // column reads a plausible wrong value that nothing downstream can detect.
    const bad = workbook([row({ uuid: 'u1', name: 'alpha' })]);
    const wb = XLSX.read(bad, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    ws['S3'] = { t: 's', v: 'Something Else' };
    const shifted = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    expect(() => parseFacilityWorkbook(shifted)).toThrow(/column S should be "Geography"/);
  });

  it('rejects a setting that is neither rural nor urban', () => {
    expect(() =>
      parseFacilityWorkbook(workbook([row({ uuid: 'u1', name: 'a', geography: 'semi-urban' })])),
    ).toThrow(/expected rural or urban/);
  });
});

describe('lookupFor', () => {
  const records = [
    { uuid: 'u1', nameKey: 'kano/dala/alpha', geography: 'rural' },
    { uuid: '1.23E+19', nameKey: 'lagos/alimosho/opeki', geography: 'urban' },
  ];

  it('matches on UUID first', () => {
    expect(lookupFor(records).find('u1', 'nonsense/key/here')?.geography).toBe('rural');
  });

  it('falls back to state/lga/name when the UUID is unusable', () => {
    // The real case: the same facility carries `1.23E+19` in both files, so an
    // id match is impossible and the name key is what recovers it.
    const found = lookupFor(records).find('9.99E+18', nameKey('lagos', 'alimosho', 'opeki'));
    expect(found?.geography).toBe('urban');
  });

  it('refuses an ambiguous name key rather than picking one', () => {
    const ambiguous = [
      { uuid: 'a', nameKey: 'kano/dala/same', geography: 'rural' },
      { uuid: 'b', nameKey: 'kano/dala/same', geography: 'urban' },
    ];
    const lookup = lookupFor(ambiguous);

    expect(lookup.ambiguousNameKeys).toBe(1);
    // Null, not a coin flip: labelling a facility urban when it is rural is a
    // worse outcome than labelling it unknown.
    expect(lookup.find('missing', 'kano/dala/same')).toBeNull();
    // The UUIDs still resolve — only the shared key is withdrawn.
    expect(lookup.find('a', 'kano/dala/same')?.geography).toBe('rural');
  });

  it('returns null for a facility in neither index', () => {
    expect(lookupFor(records).find('nope', 'no/such/key')).toBeNull();
  });
});
