import { saveAs } from 'file-saver';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { BriefFacts } from '@/lib/briefs/facts';
import { briefSections, type BriefDocument } from '@/lib/briefs/document';
import { exportFilename } from '@/lib/export';

/**
 * The brief as a Word document: the same key figures, narrative and tables as
 * the page, as editable text. Imported only when the reader asks for it —
 * the `docx` library is not part of any page's first load.
 */

const EMERALD = '265E42';

function runs(text: string): TextRun[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? new TextRun({ text: part.slice(2, -2), bold: true })
        : new TextRun(part),
    );
}

/** A section's Markdown — paragraphs and `- ` bullets — as Word paragraphs. */
function narrative(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length)
      out.push(new Paragraph({ children: runs(para.join(' ')), spacing: { after: 120 } }));
    para = [];
  };
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      flush();
      out.push(new Paragraph({ children: runs(bullet[1]!), bullet: { level: 0 } }));
    } else if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return out;
}

function table(header: string[], rows: string[][]): Table {
  const cell = (text: string, head = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold: head })] })],
      shading: head ? { fill: 'E8F3EC' } : undefined,
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: header.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
    ],
  });
}

/** The brief as a Word document, ready to pack. */
export function briefDocx(facts: BriefFacts, brief: BriefDocument | null): Document {
  const r = facts.readiness;
  const children = [
    new Paragraph({
      children: [
        new TextRun({ text: 'NPHCDA · EMR readiness · State brief', color: EMERALD, bold: true }),
      ],
    }),
    new Paragraph({ text: `${facts.state} State`, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${facts.zone ?? ''} · ${facts.facilities} facilities assessed in ${facts.lgas} LGAs`,
          color: '555555',
        }),
      ],
      spacing: { after: 240 },
    }),
    table(
      ['Ready', 'Moderately ready', 'Not ready', 'Plan', 'State maturity'],
      [
        [
          `${r.ready.facilities} (${r.ready.share})`,
          `${r.moderately_ready.facilities} (${r.moderately_ready.share})`,
          `${r.not_ready.facilities} (${r.not_ready.share})`,
          facts.plan.total,
          facts.maturity.band,
        ],
      ],
    ),
    ...(brief
      ? briefSections(brief.body).flatMap((s) => [
          new Paragraph({
            text: s.heading,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240 },
          }),
          ...narrative(s.text),
        ])
      : []),
    new Paragraph({
      text: 'In figures',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240 },
    }),
    table(
      ['Most common gaps', 'Facilities', 'Share'],
      facts.topGaps.map((g) => [g.gap, g.facilities, g.share]),
    ),
    new Paragraph({ text: '' }),
    table(
      ['Investment', 'Cost'],
      [
        ['Before deployment', facts.plan.beforeDeployment],
        ['During deployment', facts.plan.duringDeployment],
        ['After deployment', facts.plan.afterDeployment],
        ['Total', facts.plan.total],
        [
          'Per facility (national)',
          `${facts.plan.perFacility} (${facts.plan.nationalPerFacility})`,
        ],
      ],
    ),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'What funding unlocks', bold: true }),
        new TextRun({
          text: ` · Ready before: ${facts.unlocks.readyBefore} · no budget limit`,
          color: '555555',
        }),
      ],
      spacing: { after: 80 },
    }),
    table(
      ['Fixes funded', 'Cost', 'Unlocked', 'Total Ready'],
      [
        ...facts.unlocks.fixes.map((u) => [u.label, u.spend, `+${u.unlocked}`, u.totalReady]),
        ...facts.unlocks.combinations.map((u) => [
          `${u.label} (${u.fixes})`,
          u.spend,
          `+${u.unlocked}`,
          u.totalReady,
        ]),
      ],
    ),
    new Paragraph({
      children: [
        new TextRun({
          text: brief
            ? `Written with AI assistance (${brief.model}) from the assessment data${
                brief.reviewedBy ? `; reviewed by ${brief.reviewedBy}` : '; not yet reviewed'
              }. Figures are computed from the dashboard's data.`
            : "Figures are computed from the dashboard's data.",
          italics: true,
          color: '777777',
          size: 18,
        }),
      ],
      spacing: { before: 360 },
    }),
  ];

  return new Document({
    creator: 'NPHCDA EMR Readiness dashboard',
    title: `${facts.state} EMR readiness brief`,
    sections: [{ children }],
  });
}

export async function exportBriefToWord(facts: BriefFacts, brief: BriefDocument | null) {
  const blob = await Packer.toBlob(briefDocx(facts, brief));
  saveAs(blob, `${exportFilename(facts.state, 'EMR readiness brief')}.docx`);
}
