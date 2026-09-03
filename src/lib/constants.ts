/**
 * Programme constants.
 *
 * The state and zone lists are the real administrative geography of Nigeria and
 * match `public/geo/*.geojson` after slugification. Nothing here is a finding —
 * findings live in `public/data`, built from the assessment by
 * `npm run data:ingest`.
 */

import { NATIONAL_TOTAL } from './nationalSplit';
import type { EvidenceGrade } from './types';

export const PROGRAMME = {
  title: 'EMR Readiness Assessment',
  subtitle:
    'Readiness findings across 36 states, 305 LGAs, and 2,806 healthcare facilities',
  partners: ['NPHCDA', 'NTBLCP', 'The Global Fund', 'Solina'],
} as const;

/**
 * Programme coverage.
 *
 * 36 states plus the FCT; the 12 primary states were surveyed facility by
 * facility, and the survey reached 305 of their LGAs.
 */
export const COVERAGE = {
  statesTotal: 37, // 36 + FCT
  statesPrimary: 12,
  statesSecondary: 25, // + FCT
  /** LGAs the survey reached across the 12 primary states. */
  lgas: 305,
  /**
   * Facilities assessed.
   *
   * Read from the generated module rather than written here, so the figure on
   * the landing page cannot drift from the dataset behind it — the ingest is
   * the only thing that decides how many facilities there are.
   */
  facilitiesScored: NATIONAL_TOTAL,
} as const;

/**
 * The 12 states with primary facility data collection.
 *
 * Everywhere else in Nigeria was covered by secondary desk review, which yields
 * state-level findings only. The distinction is load-bearing: a user comparing
 * Kano (444 facilities assessed) with a desk-reviewed state is comparing two
 * different kinds of claim, and the UI has to say so.
 */
export const PRIMARY_STATES = [
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Imo',
  'Jigawa',
  'Kano',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Oyo',
  'Rivers',
] as const;

export type PrimaryState = (typeof PRIMARY_STATES)[number];

export const ALL_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT',
  'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
  'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

export const ZONES = [
  'north_central',
  'north_east',
  'north_west',
  'south_east',
  'south_south',
  'south_west',
] as const;

export const ZONE_LABELS: Record<(typeof ZONES)[number], string> = {
  north_central: 'North Central',
  north_east: 'North East',
  north_west: 'North West',
  south_east: 'South East',
  south_south: 'South South',
  south_west: 'South West',
};

export function evidenceGrade(state: string): EvidenceGrade {
  return (PRIMARY_STATES as readonly string[]).includes(state)
    ? 'primary'
    : 'secondary';
}

export const FUNCTIONALITY_LEVELS = [
  'Functional L1',
  'Functional L2',
  'Partially Functional',
] as const;

export const SERVICE_POINTS = [
  { id: 'registration', label: 'Registration' },
  { id: 'examination', label: 'Examination / triage' },
  { id: 'consultation', label: 'Consultation' },
  { id: 'laboratory', label: 'Laboratory' },
  { id: 'pharmacy', label: 'Pharmacy' },
] as const;

// ---------------------------------------------------------------------------
// Data paths
// ---------------------------------------------------------------------------

export const CURRENCY = { code: 'NGN', symbol: '₦', locale: 'en-NG' } as const;

/**
 * Everything under `/data` is built from the assessment by
 * `npm run data:ingest`, committed, and served statically — the Vercel build
 * does not run the ingest, so nothing in CI can recreate it. See
 * docs/ASSESSMENT_DATA.md.
 */
export const DATA_PATHS = {
  snapshot: '/data/snapshot.json',
  facilitiesSummary: '/data/facilities-summary.json',
  states: '/data/states.json',
  lgas: '/data/lgas.json',
  national: '/data/national.json',
  statesGeo: '/geo/nigeria-states.geojson',
  /**
   * The same 37 outlines, simplified to about a kilometre — 65 kB against the
   * 2.0 MB above.
   *
   * Drawn *behind* the state and LGA layers so a map of Kano also shows Jigawa
   * and Katsina around it. That line is one device pixel wide and never the
   * subject of the view, so full ADM1 fidelity would be 2 MB spent on detail
   * nothing can resolve. Built by `npm run geo:context`.
   */
  stateContextGeo: '/geo/nigeria-states-context.json',
  /**
   * LGA boundaries, one file per state — all 774 LGAs across all 37 states,
   * built by `npm run geo:build`.
   *
   * Split rather than served as one layer because nothing ever draws more than
   * one state's LGAs at a time: the national map draws states, and the
   * drill-down draws the state you clicked. One national LGA layer would be
   * 927 kB to render 50 kB of it.
   */
  lgaGeo: (stateId: string) => `/geo/lgas/${stateId}.json`,
  /** stateId → [{ lgaId, name }], for the LGA filter's options. */
  lgaIndex: '/geo/lga-index.json',
} as const;
