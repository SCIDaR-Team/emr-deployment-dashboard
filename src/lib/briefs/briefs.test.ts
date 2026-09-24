import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AreaProfile, FacilitySummary } from '../types';
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

describe('briefFacts', () => {
  const kano = briefFacts(stateNamed('Kano'), facilities)!;

  it('gives a state the figures its pages show', () => {
    expect(kano.facilities).toBe('438');
    expect(kano.readiness.ready.facilities).toBe('72');
    expect(kano.readiness.moderately_ready.facilities).toBe('251');
    expect(kano.readiness.not_ready.facilities).toBe('115');
    expect(kano.readyRank).toMatch(/^\d+ of 12$/);
    expect(kano.unlocks.allFixes.totalReady).toBe('438');
    expect(kano.plan.total).toBe('₦1.2bn');
  });

  it('says what each fix alone and four combinations unlock', () => {
    const { readyBefore, fixes, combinations } = kano.unlocks;
    expect(readyBefore).toBe('72');
    expect(fixes.map((u) => u.label)).toEqual([
      'Full solar',
      'Solar top-up',
      'Router',
      'FibreX',
      'Network extension',
      'Satellite',
    ]);
    expect(fixes.find((u) => u.label === 'Router')).toMatchObject({
      unlocked: '111',
      totalReady: '183',
    });
    expect(combinations.map((u) => u.label)).toEqual([
      'All power',
      'All connectivity',
      'Full solar and routers',
      'All six fixes',
    ]);
    expect(combinations[1]).toMatchObject({ unlocked: '151', totalReady: '223' });
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
 * The guard on published briefs: an approved brief may only quote figures the
 * data holds, and must have been reviewed against the data as it is now.
 * When the data changes, this fails until the brief is redrafted and reviewed.
 */
describe('approved briefs', () => {
  const files = existsSync(BRIEFS) ? readdirSync(BRIEFS).filter((f) => f.endsWith('.md')) : [];
  const approved = files
    .map((f) => parseBrief(readFileSync(resolve(BRIEFS, f), 'utf8')))
    .filter((d) => d?.status === 'approved');

  it.each(approved.map((d) => [d!.state, d!] as const))(
    '%s quotes only figures in the data, and is current',
    (_name, doc) => {
      const facts = briefFacts(stateNamed(doc.state), facilities)!;
      expect(unverifiedFigures(doc.body, facts)).toEqual([]);
      expect(doc.factsVersion).toBe(facts.version);
      expect(doc.reviewedBy).not.toBe('');
    },
  );

  it('runs (there may be no approved briefs yet)', () => {
    expect(Array.isArray(approved)).toBe(true);
  });
});
