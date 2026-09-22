/**
 * File export — PNG.
 *
 * Adapted from `../NPHCDA_dashboard_int/src/lib/export.ts`. The port also
 * carried CSV, Excel and two PDF paths; none of them was ever wired to a
 * control, so they have been removed rather than left to rot against a design
 * that has moved on. The scripts in `scripts/` keep their own `xlsx` and
 * `papaparse` usage and are unaffected.
 *
 * **Everything heavy is behind `await import()`.** `html2canvas` is larger than
 * most of the application and the majority of sessions never export anything,
 * so the rule is that opening the dashboard must not pay for a capture the
 * reader did not ask for: nothing in this file may import it at the top level.
 * `file-saver` is the exception and is already in the initial chunk, because
 * the download itself is synchronous and small.
 *
 * The second rule running through this file is **provenance**. Every figure in
 * this dashboard appears with the population it was computed from — that is the
 * discipline the context panel and the scope banner enforce. An export leaves
 * the app, so it has to carry that context itself: a filtered map pasted into a
 * slide with no note that filters were active is the same misquote the
 * ScopeBanner exists to prevent, and by then nobody can tell. So the PNG burns
 * its notes into a caption strip under the image, where they cannot be cropped
 * off by accident.
 */


import { saveAs } from 'file-saver';

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

// ---------------------------------------------------------------------------
// Raster capture
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

/**
 * Marks the element being captured so `onclone` can find it again — the clone
 * is a different document, so a node reference is no use there.
 */
const EXPORT_MARK = 'data-export-target';

async function rasterise(
  el: HTMLElement,
): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const { default: html2canvas } = await import('html2canvas');

  /**
   * Measured, and then **imposed on the clone**.
   *
   * `html2canvas` renders by copying the node into an offscreen iframe, and a
   * height that comes from the layout rather than from the element itself does
   * not survive the trip: the map frame is `h-full` inside a `flex-1 min-h-0`
   * column, so in the clone — where those ancestors have no resolved height —
   * it collapses to zero and the capture comes back as a 0×0 canvas. That then
   * fails deep inside the caption compositor with a `drawImage` error naming
   * neither the cause nor the element.
   *
   * So the on-screen box is measured here and written onto the clone as
   * explicit pixels. Elements that size themselves are unaffected; the ones
   * that inherit their size are the only ones that were ever broken.
   */
  const rect = el.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_CANVAS_PIXELS / (width * height))));

  el.setAttribute(EXPORT_MARK, '');
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, {
      // Captured in whatever colour scheme is on screen. Forcing light would
      // recolour the readiness scale between the click and the file, and an
      // export that does not match what was exported is its own bug report.
      backgroundColor: tokenColor('--page', '#ffffff'),
      scale,
      useCORS: true,
      logging: false,
      width,
      height,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      onclone: (doc) => {
        const clone = doc.querySelector(`[${EXPORT_MARK}]`);
        if (clone instanceof HTMLElement) {
          clone.style.width = `${width}px`;
          clone.style.height = `${height}px`;
        }
      },
    });
  } finally {
    el.removeAttribute(EXPORT_MARK);
  }

  // Belt and braces: if a browser still hands back an empty canvas, say so
  // here rather than letting it fail later as an opaque `drawImage` error.
  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error('The browser rendered an empty image.');
  }

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
  ctx.font = `${fontPx}px Nunito, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, source.height + pad + i * lineH, out.width - pad * 2);
  });

  return out;
}
