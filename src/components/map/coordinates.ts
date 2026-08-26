/**
 * Formatting a coordinate.
 *
 * Split out of `MapCoordinates.tsx` for the same reason `mapTypes.ts` exists
 * beside `MapLabel.tsx`: a module that exports both components and plain
 * functions loses fast refresh, and these two are imported by the assessment
 * pane as well as by the map.
 *
 * ## Precision
 *
 * Four decimal places, which is ~11 m at Nigeria's latitudes. That is the right
 * order for a facility: it resolves one compound from its neighbour and does
 * not imply the survey knew which corner of the building it was standing at.
 * The live pointer readout passes three (~110 m), because it is reporting where
 * a cursor happens to be — a figure that changes with every pixel of mouse
 * movement should not be printed to a precision it does not have.
 */

export const FACILITY_DP = 4;
export const POINTER_DP = 3;

/** `9.0765° N, 7.3986° E` — hemisphere spelled out rather than left as a sign,
 *  which is how a coordinate is read aloud and written on a form. */
export function formatLatLon(lat: number, lon: number, dp = FACILITY_DP): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(dp)}° ${ns}, ${Math.abs(lon).toFixed(dp)}° ${ew}`;
}

/** The signed decimal pair, which is what every mapping tool and spreadsheet
 *  actually wants pasted into it — not the human-readable form above. */
export function plainLatLon(lat: number, lon: number, dp = FACILITY_DP): string {
  return `${lat.toFixed(dp)}, ${lon.toFixed(dp)}`;
}
