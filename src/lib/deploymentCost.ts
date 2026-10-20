/**
 * What deploying costs beyond fixing the gaps — the Investment Plan's Train
 * and deploy and Operations and TA sections, and the Cost overview above them.
 *
 * The prices are the workbook's (`DEPLOYMENT_COSTS`, generated from
 * "Unit_costs_and_assumptions"); the rules they are multiplied by are the
 * ERA team's costing slides. Two kinds of line:
 *
 * - **Per state.** One three-day training event per state, run by two
 *   facilitators, and the state's technical-assistance package. Scales with
 *   the assessed states in view.
 * - **Per facility.** Two trainees from every facility, its deployment
 *   validation, and its routine operations. Scales with the facilities in
 *   view.
 *
 * Where the workbook and the slides disagree the slides win, at the team's
 * direction: facilitator accommodation is charged for every training day (the
 * sheet's frequency column says two nights), and refreshments for every day of
 * training (the sheet labels them per event, but its own ₦57,200 per trainee
 * only adds up at three days).
 */

import { DEPLOYMENT_COSTS } from './deploymentCosts';

export type Payer = 'NPHCDA' | 'State' | 'Facility' | 'NPHCDA/state';

export interface DeploymentLine {
  id: string;
  label: string;
  unitCostNGN: number;
  /** What one unit is — "facilitator-day", "trainee", "facility". Singular. */
  unit: string;
  quantity: number;
  totalNGN: number;
  payer: Payer;
  remark: string;
}

export interface DeploymentGroup {
  id: string;
  label: string;
  lines: DeploymentLine[];
  totalNGN: number;
}

export interface DeploymentSection {
  groups: DeploymentGroup[];
  totalNGN: number;
}

/** What the lines are counted over: assessed states, and their facilities. */
export interface DeploymentScope {
  states: number;
  facilities: number;
}

const line = (
  id: string,
  label: string,
  unitCostNGN: number,
  unit: string,
  quantity: number,
  payer: Payer,
  remark: string,
): DeploymentLine => ({
  id,
  label,
  unitCostNGN,
  unit,
  quantity,
  totalNGN: unitCostNGN * quantity,
  payer,
  remark,
});

const group = (id: string, label: string, lines: DeploymentLine[]): DeploymentGroup => ({
  id,
  label,
  lines,
  totalNGN: lines.reduce((sum, l) => sum + l.totalNGN, 0),
});

const section = (groups: DeploymentGroup[]): DeploymentSection => ({
  groups,
  totalNGN: groups.reduce((sum, g) => sum + g.totalNGN, 0),
});

/** Slide 3: the state training package, then deployment validation. */
export function trainAndDeploy({ states, facilities }: DeploymentScope): DeploymentSection {
  const t = DEPLOYMENT_COSTS.training;
  const trainees = t.traineesPerFacility * facilities;
  return section([
    group('training', 'State deployment-cohort training package', [
      line(
        'facilitator_honorarium',
        'Facilitator honorarium',
        t.facilitatorHonorariumNGN,
        'facilitator-day',
        t.facilitators * t.days * states,
        'NPHCDA',
        `${t.facilitators} facilitators for ${t.days} days in each state`,
      ),
      line(
        'facilitator_travel',
        'Facilitator return travel',
        t.facilitatorTravelNGN,
        'facilitator',
        t.facilitators * states,
        'NPHCDA',
        `Two flight legs and airport transfers for ${t.facilitators} facilitators per state`,
      ),
      line(
        'facilitator_accommodation',
        'Facilitator accommodation',
        t.facilitatorAccommodationNGN,
        'facilitator-night',
        t.facilitators * t.days * states,
        'NPHCDA',
        `${t.days} nights' accommodation for ${t.facilitators} facilitators per state`,
      ),
      line(
        'training_venue',
        'Training venue',
        t.venueNGN,
        'venue-day',
        t.days * states,
        'State',
        `Large training venue for ${t.days} days per state`,
      ),
      line(
        'refreshments',
        'Refreshments',
        t.refreshmentsNGN,
        'trainee-day',
        trainees * t.days,
        'State',
        `${t.traineesPerFacility} trainees per facility, refreshments for each of the ${t.days} training days`,
      ),
      line(
        'participant_transport',
        'Participant transport',
        t.participantTransportNGN,
        'trainee',
        trainees,
        'State',
        `${t.traineesPerFacility} trainees per facility, a transport stipend each`,
      ),
      line(
        'training_materials',
        'SOPs, job aids & printing',
        t.materialsNGN,
        'trainee',
        trainees,
        'NPHCDA',
        `${t.traineesPerFacility} trainees per facility, training materials for each`,
      ),
    ]),
    group('validation', 'Deployment validation', [
      line(
        'deployment_validation',
        'Deployment validation',
        DEPLOYMENT_COSTS.validationNGN,
        'facility',
        facilities,
        'State',
        'LGA M&E officer transport and printed validation checklists/forms per facility',
      ),
    ]),
  ]);
}

/** Slide 4: routine operations per facility, then state technical assistance. */
export function operationsAndTA({ states, facilities }: DeploymentScope): DeploymentSection {
  const o = DEPLOYMENT_COSTS.operations;
  const ta = DEPLOYMENT_COSTS.ta;
  return section([
    group('operations', 'Routine operations & continuous support', [
      line(
        'internet_subscription',
        'Internet subscription',
        o.internetNGN,
        'facility',
        facilities,
        'Facility',
        'Internet subscription for a year in each facility',
      ),
      line(
        'device_maintenance',
        'Device maintenance',
        o.deviceMaintenanceNGN,
        'facility',
        facilities,
        'Facility',
        'Preventive maintenance and first-line support for the devices in each facility, a year',
      ),
    ]),
    group('ta', 'State technical assistance & transition support', [
      line(
        'local_firm',
        'Local firm service charge',
        ta.localFirmNGN,
        'visit',
        ta.localFirmVisits * states,
        'NPHCDA/state',
        `Local-firm engagement and ${ta.localFirmVisits} bi-annual visits per state a year`,
      ),
      line(
        'coordination_allowance',
        'Communications & coordination allowance',
        ta.coordinationNGN,
        'state',
        states,
        'NPHCDA/state',
        'Allowance for one year per state',
      ),
    ]),
  ]);
}

export type OverviewPart = 'fixes' | 'train-deploy' | 'operations';

export interface OverviewLine {
  id: string;
  label: string;
  /** The page section that itemises it. */
  part: OverviewPart;
  totalNGN: number;
  /** At 2027 prices, with the workbook's inflation — not the section's figure. */
  inflated: boolean;
  description: string;
}

/**
 * Slide 1: the whole cost, in five lines.
 *
 * Training and operations are the five-year roadmap's 2027 figures, inflation
 * included, as the slide has them; the fixes, validation and technical
 * assistance are at base prices, also as the slide has them. So two of these
 * lines are higher than the sections that itemise them, and say so.
 *
 * The roadmap prices the twelve states together. For fewer, each inflated
 * line is the scope's base cost scaled by the roadmap's ratio to the national
 * base cost — which gives the roadmap's own figure back for all twelve.
 */
export function overview(
  fixesNGN: number,
  scope: DeploymentScope,
  national: DeploymentScope,
): OverviewLine[] {
  const here = trainAndDeploy(scope);
  const all = trainAndDeploy(national);
  const ops = operationsAndTA(scope);
  const allOps = operationsAndTA(national);
  const part = (s: DeploymentSection, id: string) =>
    s.groups.find((g) => g.id === id)?.totalNGN ?? 0;
  const scaled = (base: number, nationalBase: number, roadmap: number) =>
    nationalBase > 0 ? (base / nationalBase) * roadmap : 0;

  const t = DEPLOYMENT_COSTS.training;
  const perTrainee = t.refreshmentsNGN * t.days + t.participantTransportNGN + t.materialsNGN;
  const o = DEPLOYMENT_COSTS.operations;
  const ta = DEPLOYMENT_COSTS.ta;

  return [
    {
      id: 'fixes',
      label: 'Fix gaps',
      part: 'fixes',
      totalNGN: fixesNGN,
      inflated: false,
      description:
        'Fixing the identified gaps across power, connectivity, devices and physical infrastructure',
    },
    {
      id: 'training',
      label: 'Training',
      part: 'train-deploy',
      totalNGN: scaled(
        part(here, 'training'),
        part(all, 'training'),
        DEPLOYMENT_COSTS.roadmap.trainingNGN,
      ),
      inflated: true,
      description: `Training ${t.traineesPerFacility} staff per facility over ${t.days} days, with ${t.facilitators} facilitators per state (₦${Math.round(perTrainee / 100) / 10}K per trainee)`,
    },
    {
      id: 'validation',
      label: 'Deployment validation',
      part: 'train-deploy',
      totalNGN: part(here, 'validation'),
      inflated: false,
      description: `Validating facilities before deployment: ₦${DEPLOYMENT_COSTS.validationNGN.toLocaleString('en-NG')} per facility for LGA M&E transport`,
    },
    {
      id: 'operations',
      label: 'Operations',
      part: 'operations',
      totalNGN: scaled(
        part(ops, 'operations'),
        part(allOps, 'operations'),
        DEPLOYMENT_COSTS.roadmap.operations2027NGN,
      ),
      inflated: true,
      description: `₦${(o.internetNGN + o.deviceMaintenanceNGN).toLocaleString('en-NG')} a year per live facility for internet subscription and device maintenance`,
    },
    {
      id: 'ta',
      label: 'TA support',
      part: 'operations',
      totalNGN: part(ops, 'ta'),
      inflated: false,
      description: `₦${(ta.localFirmNGN * ta.localFirmVisits + ta.coordinationNGN).toLocaleString('en-NG')} per state for a local firm supporting change management and the move to EMR`,
    },
  ];
}
