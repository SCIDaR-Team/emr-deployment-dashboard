/**
 * File export — CSV, Excel, PNG and PDF.
 *
 * Adapted from `../NPHCDA_dashboard_int/src/lib/export.ts`. CSV landed early in
 * Phase 5, which needed an exportable ranked table; the other three arrive here
 * in Phase 7.
 *
 * **Everything heavy is behind `await import()`.** `xlsx`, `html2canvas` and
 * `jspdf` are ~1 MB between them — more than the rest of the application — and
 * most sessions never export anything. The rule is that opening the dashboard
 * must not pay for a format the reader did not ask for, so nothing in this file
 * may import them at the top level. `papaparse` and `file-saver` are the two
 * exceptions and are already in the initial chunk, because the CSV path is
 * synchronous and small.
 *
 * The second rule running through this file is **provenance**. Every figure in
 * this dashboard appears with the population it was computed from — that is the
 * discipline the context panel, the scope banner and the CSV's `Sorted by`
 * column all enforce. An export leaves the app, so it has to carry that context
 * itself: a filtered map pasted into a slide with no note that filters were
 * active is the same misquote the ScopeBanner exists to prevent, and by then
 * nobody can tell. So each format carries its notes in whatever way that format
 * allows — CSV in columns, Excel on a second sheet, PDF in a header block, PNG
 * in a caption strip burnt into the image.
 */

import Papa from 'papaparse';
import { saveAs } from 'file-saver';

/** Rows are passed already shaped: object keys are the columns, in order. */
export type ExportRow = Record<string, unknown>;

/** One line of the provenance block. */
export type ExportNote = readonly [label: string, value: string];

function ensureExtension(name: string, ext: string): string {
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
}

/**
 * A filename-safe slug. Keeps the reader's own words where it can, because the
 * point of an export is that the file is still identifiable a week later in a
 * downloads folder.
 */
export function exportFilename(...parts: (string | null | undefined)[]): string {
  return (
    parts
      .filter((p): p is string => !!p && p.trim() !== '')
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'export'
  );
}

/** Local date/time, for the "exported on" line every format carries. */
function stamp(): string {
  return new Date().toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Write rows to CSV and hand them to the browser's download.
 *
 * The rows are passed already shaped — headers come from the object keys, in
 * insertion order — so the exported columns are the columns the caller decided
 * on rather than whatever the underlying record happens to hold.
 */
export function exportCSV(filename: string, rows: ExportRow[]): void {
  const csv = Papa.unparse(rows, { newline: '\r\n' });
  // The BOM is what makes Excel open a UTF-8 CSV as UTF-8. Without it the
  // naira sign and the ≤ in the consultation bands arrive as mojibake, which
  // is exactly the class of bug the ETL already sweeps for upstream.
  const BOM = '\uFEFF';
  const blob = new Blob([`${BOM}${csv}`], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, ensureExtension(filename, 'csv'));
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

export interface ExcelOptions {
  /** Name of the data sheet. */
  sheet?: string;
  /** Provenance, written to a second sheet. */
  notes?: ExportNote[];
}

/**
 * Write rows to a `.xlsx` workbook.
 *
 * Two things this does that the source port did not, both because a CSV opened
 * in Excel already does them badly enough to be the reason someone asks for
 * Excel in the first place:
 *
 * - **Blanks stay blank.** `''` and `null` become an absent cell rather than an
 *   empty string, so `AVERAGE` over a column of scores skips the unmeasured
 *   units instead of reading them as zero. Half this dataset's honesty is in
 *   the difference between "not ready" and "not measured", and a zero in a
 *   spreadsheet erases it.
 * - **Columns are wide enough to read.** The default 8 characters truncates
 *   every header this app produces ("Moderately ready (n)"), and a reader who
 *   has to widen sixteen columns before they can check a figure will not.
 */
export async function exportExcel(
  filename: string,
  rows: ExportRow[],
  options: ExcelOptions = {},
): Promise<void> {
  const XLSX = await import('xlsx');
  const { sheet = 'Data', notes = [] } = options;

  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const blanked = rows.map((row) => {
    const out: ExportRow = {};
    for (const key of keys) {
      const value = row[key];
      out[key] = value === '' || value == null ? null : value;
    }
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(blanked, { header: keys });

  ws['!cols'] = keys.map((key) => {
    const widest = blanked.reduce(
      (max, row) => Math.max(max, String(row[key] ?? '').length),
      key.length,
    );
    return { wch: Math.min(44, widest + 2) };
  });

  if (rows.length && keys.length) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: keys.length - 1 },
      }),
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));

  // The About sheet is the workbook's equivalent of the CSV's provenance
  // columns — cheaper here, because it does not have to repeat itself on every
  // one of 2,804 rows.
  const about = XLSX.utils.aoa_to_sheet([
    ['EMR Readiness Assessment Dashboard'],
    [],
    ...notes.map(([label, value]) => [label, value]),
    ['Rows exported', String(rows.length)],
    ['Exported', stamp()],
  ]);
  about['!cols'] = [{ wch: 24 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, about, 'About');

  // Written through file-saver rather than `XLSX.writeFile`, so all four
  // formats leave the app by one download path.
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    ensureExtension(filename, 'xlsx'),
  );
}

// ---------------------------------------------------------------------------
// Raster capture — shared by PNG and PDF
// ---------------------------------------------------------------------------

/**
 * Resolve a design token to a concrete colour.
 *
 * Note the difference from the source port: NPHCDA's tokens are RGB triples
 * (`--c-bg: 15 23 42`), ours are HSL triples (`--page: 150 14% 97%`). Wrapping
 * one in the other's function silently yields black, which on a PNG export is
 * indistinguishable from "the capture failed".
 */
function tokenColor(token: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return raw ? `hsl(${raw})` : fallback;
}

/**
 * iOS Safari refuses to allocate a canvas above roughly 16.7M pixels and
 * returns a blank one rather than throwing, so a tall page exported at 2× would
 * come out empty with no error to show the reader. Scale down to fit instead.
 */
const MAX_CANVAS_PIXELS = 16e6;

async function rasterise(
  el: HTMLElement,
): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const { default: html2canvas } = await import('html2canvas');

  const area = Math.max(1, el.scrollWidth * el.scrollHeight);
  const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_CANVAS_PIXELS / area)));

  const canvas = await html2canvas(el, {
    // Captured in whatever colour scheme is on screen. Forcing light would
    // recolour the readiness scale between the click and the file, and an
    // export that does not match what was exported is its own bug report.
    backgroundColor: tokenColor('--page', '#ffffff'),
    scale,
    useCORS: true,
    logging: false,
  });

  return { canvas, scale };
}

export interface PngOptions {
  /** Lines burnt in under the image — provenance a screenshot otherwise loses. */
  caption?: string[];
}

/** Rasterise a DOM element to a PNG. */
export async function exportElementToPNG(
  el: HTMLElement,
  filename: string,
  options: PngOptions = {},
): Promise<void> {
  const { canvas: source, scale } = await rasterise(el);
  const canvas = withCaption(source, options.caption ?? [], scale);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('The browser could not encode the image.');
  saveAs(blob, ensureExtension(filename, 'png'));
}

/** Stamp the provenance lines along the bottom of a captured canvas. */
function withCaption(
  source: HTMLCanvasElement,
  lines: string[],
  scale: number,
): HTMLCanvasElement {
  if (!lines.length) return source;

  // Sized off the capture's own scale, so the caption reads at the same size as
  // the interface above it whether the capture ran at 1× or 2×.
  const fontPx = Math.max(9, Math.round(12 * scale));
  const lineH = Math.round(fontPx * 1.5);
  const pad = Math.round(fontPx * 1.2);
  const stripH = pad * 2 + lineH * lines.length;

  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height + stripH;
  const ctx = out.getContext('2d');
  if (!ctx) return source;

  ctx.fillStyle = tokenColor('--page', '#ffffff');
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);

  ctx.fillStyle = tokenColor('--border', '#e2e8f0');
  ctx.fillRect(pad, source.height, out.width - pad * 2, Math.max(1, fontPx / 12));

  ctx.fillStyle = tokenColor('--muted-foreground', '#64748b');
  ctx.font = `${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, source.height + pad + i * lineH, out.width - pad * 2);
  });

  return out;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export interface PdfOptions {
  title: string;
  subtitle?: string;
  notes?: ExportNote[];
}

const PT_MARGIN = 36; // half an inch at 72dpi
const PT_FOOTER = 26;

/**
 * PDF furniture is always dark-on-white, whatever scheme the app is in.
 *
 * The page is a printed artefact rather than a screenshot of one: a dark-mode
 * capture sits on a white page as a dark panel, which prints and reads fine,
 * whereas a dark page with dark-mode furniture is
 * an A4 sheet of solid ink.
 */
const PDF_INK: [number, number, number] = [17, 34, 26];
const PDF_MUTED: [number, number, number] = [110, 122, 115];
const PDF_BRAND: [number, number, number] = [45, 108, 79]; // --brand-500, light
const PDF_PAGE: [number, number, number] = [255, 255, 255];

type Doc = import('jspdf').jsPDF;

/**
 * Title, subtitle and notes at the top of page one. Returns the y content
 * should start at.
 *
 * Callable with `draw: false` to measure without marking the page. The image
 * path needs the height *before* it paints, but must not paint the header until
 * after — the slice masks below cover the top of the page, so a header drawn
 * first is a header painted over. (It was, once. Hence the flag.)
 */
function drawHeader(
  pdf: Doc,
  options: PdfOptions,
  width: number,
  draw = true,
): number {
  let y = PT_MARGIN;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  if (draw) {
    pdf.setTextColor(...PDF_BRAND);
    pdf.text(options.title, PT_MARGIN, y + 12);
  }
  y += 22;

  if (options.subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    const wrapped = pdf.splitTextToSize(options.subtitle, width) as string[];
    if (draw) {
      pdf.setTextColor(...PDF_INK);
      pdf.text(wrapped, PT_MARGIN, y + 8);
    }
    y += wrapped.length * 12 + 4;
  }

  for (const [label, value] of options.notes ?? []) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    const indent = Math.max(64, pdf.getTextWidth(`${label}: `) + 4);
    if (draw) {
      pdf.setTextColor(...PDF_MUTED);
      pdf.text(`${label}:`, PT_MARGIN, y + 8);
    }
    pdf.setFont('helvetica', 'normal');
    const wrapped = pdf.splitTextToSize(value, width - indent) as string[];
    if (draw) pdf.text(wrapped, PT_MARGIN + indent, y + 8);
    y += wrapped.length * 10 + 2;
  }

  y += 6;
  if (draw) {
    pdf.setDrawColor(...PDF_MUTED);
    pdf.setLineWidth(0.5);
    pdf.line(PT_MARGIN, y, PT_MARGIN + width, y);
  }

  return y + 12;
}

function drawFooter(pdf: Doc, page: number, pages: number, title: string): void {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const y = pageH - PT_MARGIN + 8;

  pdf.setFillColor(...PDF_PAGE);
  pdf.rect(0, pageH - PT_MARGIN - PT_FOOTER + 12, pageW, PT_MARGIN + PT_FOOTER, 'F');

  pdf.setDrawColor(...PDF_MUTED);
  pdf.setLineWidth(0.4);
  pdf.line(PT_MARGIN, y - 10, pageW - PT_MARGIN, y - 10);

  pdf.setTextColor(...PDF_MUTED);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.text(`${title} · EMR Readiness Assessment · exported ${stamp()}`, PT_MARGIN, y);
  pdf.text(`Page ${page} of ${pages}`, pageW - PT_MARGIN, y, { align: 'right' });
}

/**
 * Render a DOM element into a PDF, across as many pages as it takes.
 *
 * The source port fitted the whole element onto a single A4 page, which is fine
 * for one chart and useless for anything taller: a facility scorecard squashed
 * to a third of a page is a picture of a document rather than the document. So
 * the capture is scaled to the page *width* and sliced down the page instead,
 * with the header and footer painted over the slice edges.
 */
export async function exportElementToPDF(
  el: HTMLElement,
  filename: string,
  options: PdfOptions,
): Promise<void> {
  const [{ canvas }, { jsPDF }] = await Promise.all([rasterise(el), import('jspdf')]);

  const landscape = canvas.width > canvas.height * 1.15;
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - PT_MARGIN * 2;

  const image = canvas.toDataURL('image/png');
  const imageH = (canvas.height * contentW) / canvas.width;

  // Measured now, drawn once the masks are down — see drawHeader.
  const firstTop = drawHeader(pdf, options, contentW, false);
  let printed = 0;
  let page = 0;

  // A guard, not a policy: 60 A4 pages is far past anything this app renders,
  // and a mis-measured element would otherwise loop until the tab dies.
  const MAX_PAGES = 60;

  while (printed < imageH - 1 && page < MAX_PAGES) {
    if (page > 0) pdf.addPage();
    const top = page === 0 ? firstTop : PT_MARGIN;
    const band = pageH - top - PT_MARGIN - PT_FOOTER;

    pdf.addImage(image, 'PNG', PT_MARGIN, top - printed, contentW, imageH, '', 'FAST');

    // The image is drawn whole and overflows its band in both directions; these
    // two rects are what cut it back to the page's printable area.
    pdf.setFillColor(...PDF_PAGE);
    if (top > 0) pdf.rect(0, 0, pageW, top, 'F');
    pdf.rect(0, top + band, pageW, pageH - top - band, 'F');

    printed += band;
    page += 1;
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    if (i === 1) drawHeader(pdf, options, contentW);
    drawFooter(pdf, i, pages, options.title);
  }

  pdf.save(ensureExtension(filename, 'pdf'));
}

/**
 * Render rows into a PDF as a real table.
 *
 * Deliberately *not* a screenshot of the table on screen. A 305-row LGA ranking
 * rasterised is a several-megabyte image whose figures cannot be searched,
 * selected or copied, and which breaks across pages mid-row with no repeated
 * header. `jspdf-autotable` — already a dependency, and unused until now —
 * gives vector text, a header on every page and honest page breaks.
 */
export async function exportTablePDF(
  filename: string,
  rows: ExportRow[],
  options: PdfOptions,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const pdf = new jsPDF({
    // Anything past six columns will not fit A4 portrait at a legible size, and
    // autotable's answer to that is to shrink the text rather than the table.
    orientation: keys.length > 6 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const contentW = pdf.internal.pageSize.getWidth() - PT_MARGIN * 2;
  const firstTop = drawHeader(pdf, options, contentW);

  autoTable(pdf, {
    head: [keys],
    body: rows.map((row) => keys.map((key) => cellText(row[key]))),
    startY: firstTop,
    margin: {
      top: PT_MARGIN,
      left: PT_MARGIN,
      right: PT_MARGIN,
      bottom: PT_MARGIN + PT_FOOTER,
    },
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 3, textColor: PDF_INK, lineWidth: 0 },
    headStyles: {
      fillColor: PDF_BRAND,
      textColor: PDF_PAGE,
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [245, 248, 246] },
  });

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    drawFooter(pdf, i, pages, options.title);
  }

  pdf.save(ensureExtension(filename, 'pdf'));
}

/** Cell values as autotable wants them: a string, with blanks staying blank. */
function cellText(value: unknown): string {
  if (value == null || value === '') return '';
  return String(value);
}
