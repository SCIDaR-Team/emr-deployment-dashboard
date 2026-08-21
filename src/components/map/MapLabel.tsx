interface MapLabelProps {
  x: number;
  y: number;
  text: string;
  /** The one size this label wants to be. It is not a starting point for
   *  shrink-to-fit — see the note on the component. */
  fontSize?: number;
  fontWeight?: number;
  className?: string;
  /** Room the label has, in viewBox units — normally the inscribed diameter
   *  reported by `geomLabelPoint`. */
  maxWidth?: number;
  /** How far below `fontSize` a label may shrink before it is dropped instead.
   *  As a fraction: 0.82 means "no smaller than 82% of the intended size". */
  minScale?: number;
}

/** Mean glyph advance for Inter at bold, as a fraction of font size. Close
 *  enough to fit text without measuring it in the DOM (which would mean a
 *  layout pass per label, ~800 of them at the LGA level). */
const CHAR_W = 0.58;

const LINE_HEIGHT = 1.05;

/**
 * How far a label may spill past its shape's inscribed circle before it counts
 * as not fitting.
 *
 * The inscribed circle is a conservative measure of a polygon — an LGA is
 * almost never a disc, and there is usually real estate either side of the
 * widest circle you can draw inside it. A little overflow lands on the shape
 * anyway, so insisting on the circle alone would hide labels that read
 * perfectly well.
 */
const OVERFLOW_TOLERANCE = 1.45;

function width(text: string, fontSize: number): number {
  return text.length * CHAR_W * fontSize;
}

/** Split on the space that leaves the two halves closest in length — "Ifelodun
 *  North East" reads better balanced than broken after the first word. */
function balancedSplit(text: string): string[] | null {
  const words = text.split(/\s+/);
  if (words.length < 2) return null;
  let best: string[] | null = null;
  let bestDelta = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const delta = Math.abs(a.length - b.length);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Lay the name out, or refuse to.
 *
 * Four attempts in order of preference — one line at full size, two lines at
 * full size, one or two lines shrunk as far as `minScale` allows — and `null`
 * if none of them fit. Refusing is the important part: the previous version had
 * no way to say no, so a long name in a narrow LGA was drawn at whatever size
 * the arithmetic produced and spilled across two neighbours, where the parts
 * over other fills read as fragments of a word. A name you cannot read is worse
 * than no name, because it looks like a rendering fault rather than a decision.
 */
function fit(
  text: string,
  fontSize: number,
  maxWidth: number | undefined,
  minScale: number,
): { lines: string[]; size: number } | null {
  // No constraint given: draw it and trust the caller.
  if (!maxWidth || maxWidth <= 0) return { lines: [text], size: fontSize };

  const room = maxWidth * OVERFLOW_TOLERANCE;
  const floor = fontSize * minScale;
  const wrapped = balancedSplit(text);

  const longest = (lines: string[]) => Math.max(...lines.map((l) => l.length));

  // 1 & 2 — full size, one line then two.
  if (width(text, fontSize) <= room) return { lines: [text], size: fontSize };
  if (wrapped && longest(wrapped) * CHAR_W * fontSize <= room) {
    return { lines: wrapped, size: fontSize };
  }

  // 3 & 4 — the largest size that fits, if that is still legible.
  const twoLineSize = wrapped ? room / (longest(wrapped) * CHAR_W) : 0;
  if (wrapped && twoLineSize >= floor) {
    return { lines: wrapped, size: Math.min(fontSize, twoLineSize) };
  }

  const oneLineSize = room / (text.length * CHAR_W);
  if (oneLineSize >= floor) return { lines: [text], size: Math.min(fontSize, oneLineSize) };

  return null;
}

/**
 * Permanent map label.
 *
 * Flat black at a bold weight, no halo. The white outline this used to carry
 * (via `paint-order: stroke`) was meant to keep a name legible over any fill
 * without knowing what was underneath — sound in principle, and at 9px on
 * saturated fills it read as a smear around every letter rather than a backing.
 *
 * Black rather than white because it is the better of the two across all three
 * bands: white on the amber fill lands around 2.6:1, which is unreadable, while
 * black is comfortable on amber and red and merely tight on the darkest green.
 * A photographic base map would defeat it — this page ships the plain wash and
 * no base-map switcher, so that case does not arise; restore the halo before
 * adding one.
 *
 * **One size, or nothing.** Every label on a layer is drawn at the size that
 * layer chose, and a shape too small to hold its name at that size gets no
 * label rather than a shrunken one. The hover tooltip and the pane's list both
 * still name it. This is the opposite of the previous behaviour, which scaled
 * each name to whatever its shape could take and produced a map with six
 * legible names and thirty smears.
 *
 * `x`/`y` should be a `geomLabelPoint`, not a centroid — see the note there.
 */
export function MapLabel({
  x,
  y,
  text,
  fontSize = 10,
  fontWeight = 700,
  className,
  maxWidth,
  minScale = 0.7,
}: MapLabelProps) {
  const laid = fit(text, fontSize, maxWidth, minScale);
  if (!laid) return null;

  const { lines, size } = laid;
  const offset = -((lines.length - 1) / 2) * size * LINE_HEIGHT;

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={size}
      fontWeight={fontWeight}
      className={className ?? 'fill-black'}
      pointerEvents="none"
    >
      {lines.map((line, i) => (
        <tspan key={line} x={x} dy={i === 0 ? offset : size * LINE_HEIGHT}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
