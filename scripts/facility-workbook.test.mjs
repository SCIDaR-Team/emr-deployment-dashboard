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

/**
 * A miniature of the export.
 *
 * `lead` is how many junk rows precede the header — the ERA workbook has a
 * numbering row, the export before it had a grouping row as well, and a third
 * revision could have neither. That is why the parser finds the header rather
 * than counting to it, and why this varies.
 *
 * `sheets` puts the data sheet behind others, as the ERA workbook does — it
 * opens on a differently-shaped export of the same survey.
 */
function workbook(rows, { lead = 2, sheets = ['Raw data with readiness level'] } = {}) {
  const header = [];
  header[1] = 'Name of facility';
  header[3] = 'UUID';
  header[12] = 'Longitude';
  header[13] = 'Altitude';
  header[14] = 'Location accuracy';
  header[16] = 'State';
  header[17] = 'LGA';
  header[18] = 'Geography';

  const junk = [['Facility demography'], [1, 2, 3]].slice(0, lead);
  const aoa = [...junk, header, ...rows];
  const wb = XLSX.utils.book_new();
  for (const name of sheets) {
    const ws =
      name === 'Raw data with readiness level'
        ? XLSX.utils.aoa_to_sheet(aoa)
        : XLSX.utils.aoa_to_sheet([['a different export entirely']]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const row = ({
  uuid,
  name,
  state = 'kano',
  lga = 'dala',
  geography = 'rural',
  lat,
  lon,
}) => {
  const r = [];
  r[1] = name;
  r[3] = uuid;
  r[11] = lat;
  r[12] = lon;
  r[16] = state;
  r[17] = lga;
  r[18] = geography;
  return r;
};

describe('parseFacilityWorkbook', () => {
  it('finds its header wherever the export puts it', () => {
    for (const lead of [0, 1, 2, 3]) {
      const records = parseFacilityWorkbook(
        workbook([row({ uuid: 'u1', name: 'alpha_health_post' })], { lead }),
      );
      expect(records, `lead ${lead}`).toHaveLength(1);
      expect(records[0].uuid, `lead ${lead}`).toBe('u1');
    }
  });

  it('reads its own sheet, not whichever comes first', () => {
    const records = parseFacilityWorkbook(
      workbook([row({ uuid: 'u1', name: 'alpha_health_post' })], {
        sheets: ['Raw data ODK', 'Raw data with readiness level'],
      }),
    );
    expect(records).toHaveLength(1);
    expect(records[0].uuid).toBe('u1');
  });

  it('reads a coordinate, and treats a blank one as missing rather than 0,0', () => {
    const records = parseFacilityWorkbook(
      workbook([
        row({ uuid: 'u1', name: 'alpha', lat: 6.244616, lon: 7.083059 }),
        // The latitude-less export: longitude present, latitude empty. Both
        // must drop — `Number('')` is 0, which is finite and off West Africa.
        row({ uuid: 'u2', name: 'beta', lon: 7.083059 }),
        row({ uuid: 'u3', name: 'gamma' }),
      ]),
    );

    expect(records[0]).toMatchObject({ lat: 6.244616, lon: 7.083059 });
    expect(records[1]).toMatchObject({ lat: null, lon: null });
    expect(records[2]).toMatchObject({ lat: null, lon: null });
  });

  it('throws on a coordinate outside Nigeria rather than plotting it', () => {
    expect(() =>
      parseFacilityWorkbook(
        // Latitude and longitude the wrong way round: 7.08, 6.24 is still in
        // the box, so the case that must fail is a genuinely foreign one.
        workbook([row({ uuid: 'u1', name: 'alpha', lat: 51.5, lon: -0.12 })]),
      ),
    ).toThrow(/outside Nigeria/);
  });

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
