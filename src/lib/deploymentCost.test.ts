import { describe, expect, it } from 'vitest';
import { overview, operationsAndTA, trainAndDeploy } from './deploymentCost';
import { DEPLOYMENT_COSTS } from './deploymentCosts';

/** The 12 assessed states and their 2,806 facilities — the slides' scope. */
const NATIONAL = { states: 12, facilities: 2806 };

const byId = (s: ReturnType<typeof trainAndDeploy>) =>
  Object.fromEntries(s.groups.flatMap((g) => g.lines).map((l) => [l.id, l.totalNGN]));

describe('trainAndDeploy', () => {
  it('reproduces slide 3 line by line', () => {
    const lines = byId(trainAndDeploy(NATIONAL));
    expect(lines.facilitator_honorarium).toBe(3_600_000);
    expect(lines.facilitator_travel).toBe(10_800_000);
    expect(lines.facilitator_accommodation).toBe(4_680_000);
    expect(lines.training_venue).toBe(7_200_000);
    expect(lines.refreshments).toBe(168_360_000);
    expect(lines.participant_transport).toBe(134_688_000);
    expect(lines.training_materials).toBe(17_958_400);
    expect(lines.deployment_validation).toBe(70_150_000);
  });

  it('totals ₦417.4m — the slide sums its rounded lines to 417.6', () => {
    expect(trainAndDeploy(NATIONAL).totalNGN).toBe(417_436_400);
  });

  it('scales per-state lines with states and per-trainee lines with facilities', () => {
    const one = byId(trainAndDeploy({ states: 1, facilities: 100 }));
    expect(one.training_venue).toBe(600_000);
    expect(one.participant_transport).toBe(24_000 * 2 * 100);
  });
});

describe('operationsAndTA', () => {
  it('reproduces slide 4', () => {
    const s = operationsAndTA(NATIONAL);
    const lines = byId(s);
    expect(lines.internet_subscription).toBe(1_010_160_000);
    expect(lines.device_maintenance).toBe(140_300_000);
    expect(lines.local_firm).toBe(4_800_000);
    expect(lines.coordination_allowance).toBe(1_200_000);
    expect(s.totalNGN).toBe(1_156_460_000);
  });
});

describe('overview', () => {
  const fixes = 6_724_515_333;

  it('shows slide 1: roadmap training and 2027 operations, the rest at base prices', () => {
    const all = overview(fixes, NATIONAL, NATIONAL);
    const line = (id: string) => all.find((l) => l.id === id)!;
    const lines = {
      fixes: line('fixes'),
      training: line('training'),
      validation: line('validation'),
      operations: line('operations'),
      ta: line('ta'),
    };
    expect(lines.fixes.totalNGN).toBe(fixes);
    expect(lines.training.totalNGN).toBeCloseTo(DEPLOYMENT_COSTS.roadmap.trainingNGN, 0);
    expect(lines.validation.totalNGN).toBe(70_150_000);
    expect(lines.operations.totalNGN).toBeCloseTo(DEPLOYMENT_COSTS.roadmap.operations2027NGN, 0);
    expect(lines.ta.totalNGN).toBe(6_000_000);
    expect(lines.training.inflated && lines.operations.inflated).toBe(true);
  });

  it('is the 2027 operations year: base operations with one year of inflation', () => {
    const ops = overview(fixes, NATIONAL, NATIONAL).find((l) => l.id === 'operations')!;
    expect(ops.totalNGN).toBeCloseTo(1_150_460_000 * (1 + DEPLOYMENT_COSTS.inflationRate), -1);
  });

  it('scales the roadmap figures to a smaller scope', () => {
    const half = overview(0, { states: 6, facilities: 1403 }, NATIONAL);
    const ops = half.find((l) => l.id === 'operations')!;
    expect(ops.totalNGN).toBeCloseTo(DEPLOYMENT_COSTS.roadmap.operations2027NGN / 2, 0);
  });
});
