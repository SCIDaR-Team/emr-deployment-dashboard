import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatCount, formatNaira } from '../format';
import { facilityPaths, planScenario } from '../scenarios';
import type { AreaProfile, FacilitySummary, ScenarioComponentId } from '../types';
import { briefSections, parseBrief, serializeBrief } from './document';
import { briefFacts } from './facts';
import { unverifiedFigures } from './verify';

const DATA = resolve(__dirname, '../../../public/data');
const BRIEFS = resolve(__dirname, '../../content/briefs');
const read = <T>(f: string) => JSON.parse(readFileSync(resolve(DATA, f), 'utf8')) as T;
const facilitiesRaw = read<FacilitySummary[] | { facilities: FacilitySummary[] }>(
  'facilities-summary.json',
);
const facilities = Array.isArray(facilitiesRaw) ? facilitiesRaw : facilitiesRaw.facilities;
const states = read<AreaProfile[]>('states.json');
const stateNamed = (name: string) => states.find((s) => s.name === name)!;

/**
 * Against the state's facilities, counted here — so the test holds whatever
 * the figures are, and a new revision of the data needs no change.
 */
describe('briefFacts', () => {
  const kano = briefFacts(stateNamed('Kano'), facilities)!;
  const kanoFacilities = facilities.filter((f) => f.state === 'Kano');
  const count = (band: string) =>
    formatCount(kanoFacilities.filter((f) => f.deploymentBand === band).length);
  const unlocks = (fixes: ScenarioComponentId[]) => {
    const p = planScenario(facilityPaths(kanoFacilities), new Set(fixes), null);
    return {
      unlocked: formatCount(p.newlyReady),
      totalReady: formatCount(p.readyBefore + p.newlyReady),
    };
  };

  it('gives a state the figures its pages show', () => {
    expect(kano.facilities).toBe(formatCount(kanoFacilities.length));
    expect(kano.readiness.ready.facilities).toBe(count('ready'));
    expect(kano.readiness.moderately_ready.facilities).toBe(count('moderately_ready'));
    expect(kano.readiness.not_ready.facilities).toBe(count('not_ready'));
    const assessed = new Set(facilities.map((f) => f.state)).size;
    expect(kano.readyRank).toMatch(new RegExp(`^\\d+ of ${assessed}$`));
    expect(kano.unlocks.allFixes.totalReady).toBe(formatCount(kanoFacilities.length));
    expect(kano.plan.total).toBe(
      formatNaira(kanoFacilities.reduce((s, f) => s + f.costNGN, 0), true),
    );
  });

  it('says what each fix alone and four combinations unlock', () => {
    const { readyBefore, fixes, combinations } = kano.unlocks;
    expect(readyBefore).toBe(count('ready'));
    expect(fixes.map((u) => u.label)).toEqual([
      'Full solar',
      'Solar top-up',
      'Router',
      'FibreX',
      'Network extension',
      'Starlink',
    ]);
    expect(fixes.find((u) => u.label === 'Router')).toMatchObject(unlocks(['router']));
    expect(combinations.map((u) => u.label)).toEqual([
      'All power',
      'All connectivity',
      'Full solar and routers',
      'All six fixes',
    ]);
    expect(combinations[1]).toMatchObject(
      unlocks(['router', 'fibrex', 'network_extension', 'satellite']),
    );
    expect(combinations[3]!.totalReady).toBe(kano.unlocks.allFixes.totalReady);
  });

  it('is null for a state outside the facility assessment', () => {
    expect(briefFacts(stateNamed('Edo'), facilities)).toBeNull();
  });

  it('fingerprints the figures: same data, same version; changed data, new version', () => {
    expect(briefFacts(stateNamed('Kano'), facilities)!.version).toBe(kano.version);
    const fewer = facilities.filter(
      (f) => f.uuid !== facilities.find((x) => x.state === 'Kano')!.uuid,
    );
    expect(briefFacts(stateNamed('Kano'), fewer)!.version).not.toBe(kano.version);
  });
});

describe('unverifiedFigures', () => {
  const kano = briefFacts(stateNamed('Kano'), facilities)!;

  it('accepts figures quoted exactly from the facts', () => {
    const text = `Kano has ${kano.facilities} assessed facilities; ${kano.readiness.ready.facilities} are Ready (${kano.readiness.ready.share}). It ranks ${kano.readyRank}. The plan is ${kano.plan.total}.`;
    expect(unverifiedFigures(text, kano)).toEqual([]);
  });

  it('flags a figure the data does not hold', () => {
    expect(unverifiedFigures('The plan is ₦9.9bn, or 12.5% more.', kano)).toEqual([
      '₦9.9bn',
      '12.5%',
    ]);
  });
});

describe('brief documents', () => {
  it('round-trip through their file form', () => {
    const doc = {
      state: 'Kano',
      status: 'draft' as const,
      factsVersion: 'abc12345',
      drafted: '2026-09-24',
      model: 'test-model',
      reviewedBy: '',
      body: '## Summary\n\nOne.\n\n## Readiness\n\n- Two',
    };
    expect(parseBrief(serializeBrief(doc))).toEqual(doc);
    expect(briefSections(doc.body)).toEqual([
      { heading: 'Summary', text: 'One.' },
      { heading: 'Readiness', text: '- Two' },
    ]);
  });

  it('treats anything but "approved" as a draft', () => {
    const text = serializeBrief({
      state: 'Oyo',
      status: 'draft',
      factsVersion: '',
      drafted: '',
      model: '',
      reviewedBy: '',
      body: '## Summary\n\nx',
    }).replace('status: draft', 'status: Approved?');
    expect(parseBrief(text)!.status).toBe('draft');
  });
});

/**
 * The guard on published briefs: an approved brief must have been reviewed, and
 * while it is current it may only quote figures the data holds.
 *
 * A data update leaves a brief out of date, and its page says so ("Out of
 * date: the data has changed since this was written"). That stops nothing —
 * the daily sync must be able to publish new data — so an out-of-date brief
 * passes here until it is redrafted and reviewed.
 */
describe('approved briefs', () => {
  const files = existsSync(BRIEFS) ? readdirSync(BRIEFS).filter((f) => f.endsWith('.md')) : [];
  const approved = files
    .map((f) => parseBrief(readFileSync(resolve(BRIEFS, f), 'utf8')))
    .filter((d) => d?.status === 'approved');

  it.each(approved.map((d) => [d!.state, d!] as const))(
    '%s was reviewed, and quotes only figures in the data while current',
    (_name, doc) => {
      const facts = briefFacts(stateNamed(doc.state), facilities)!;
      expect(doc.reviewedBy).not.toBe('');
      if (doc.factsVersion !== facts.version) return;
      expect(unverifiedFigures(doc.body, facts)).toEqual([]);
    },
  );

  it('runs (there may be no approved briefs yet)', () => {
    expect(Array.isArray(approved)).toBe(true);
  });
});
