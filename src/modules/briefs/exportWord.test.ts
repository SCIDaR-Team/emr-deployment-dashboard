import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { briefFacts } from '@/lib/briefs/facts';
import type { AreaProfile, FacilitySummary } from '@/lib/types';
import { briefDocx } from './exportWord';

const DATA = resolve(__dirname, '../../../public/data');
const raw = JSON.parse(readFileSync(resolve(DATA, 'facilities-summary.json'), 'utf8'));
const facilities: FacilitySummary[] = Array.isArray(raw) ? raw : raw.facilities;
const states: AreaProfile[] = JSON.parse(readFileSync(resolve(DATA, 'states.json'), 'utf8'));
const kano = briefFacts(
  states.find((s) => s.name === 'Kano')!,
  facilities,
)!;

async function documentXml(brief: Parameters<typeof briefDocx>[1]) {
  const buffer = await Packer.toBuffer(briefDocx(kano, brief));
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

describe('briefDocx', () => {
  it('writes the figures, and the narrative when there is one', async () => {
    const xml = await documentXml({
      state: 'Kano',
      status: 'draft',
      factsVersion: kano.version,
      drafted: '2026-09-24',
      model: 'test-model',
      reviewedBy: '',
      body: '## Summary\n\nKano has **438** facilities.\n\n## Readiness\n\n- 72 are Ready',
    });
    for (const text of [
      'Kano State',
      '72 (16%)',
      '₦1.2bn',
      'Summary',
      '438',
      '72 are Ready',
      'not yet reviewed',
      'Satellite',
      'All connectivity (Router + FibreX + Network extension + Satellite)',
    ]) {
      expect(xml).toContain(text);
    }
  });

  it('still makes a document of the figures alone', async () => {
    const xml = await documentXml(null);
    expect(xml).toContain('Most common gaps');
    expect(xml).not.toContain('AI assistance');
  });
});
