interface MapLabelProps {
  x: number;
  y: number;
  text: string;
  /** In `uniform`, the one size the layer draws at. In `shrink`, the ceiling —
   *  a name only ever comes down from it. Either way it is viewBox units, so
   *  the caller owns the conversion from however large the map is on screen. */
  fontSize?: number;
  fontWeight?: number;
  className?: string;
  /** Room the label has, in viewBox units — normally the inscribed diameter
   *  reported by `geomLabelPoint`. */
  maxWidth?: number;
  /**
   * Which of the two layout modes to use. See the note on the component.
   *
   * `uniform` — one size for the whole layer, or no label at all.
   * `shrink`  — scale each name to whatever its own shape can take.
   */
  mode?: 'uniform' | 'shrink';
  /** `shrink` only: where that scaling stops. Below it a name is not readable
   *  at any size, so shrinking further buys nothing — the label is drawn at the
   *  floor, and dropped if even that will not fit. */
  minFontSize?: number;
  /** `uniform` only: how far below `fontSize` a label may shrink before it is
   *  dropped instead, as a fraction of it. */
  minScale?: number;
  /**
   * Draw a halo behind the glyphs, via `paint-order: stroke`.
   *
   * Keeps a name legible over any fill without the component knowing what is
   * underneath — necessary where labels sit at a size small enough to be
   * swallowed by a saturated fill, which is the LGA layer's situation and not
   * the national layer's.
   *
   * Fixed white, deliberately, rather than `--surface`. The glyphs are fixed
   * black in both schemes, so a halo that follows the theme stops being a halo
   * in the dark one: `--surface` resolves to near-black there, which is no
   * separation from the letters it is meant to back, only a fatter letter.
   */
  halo?: boolean;
}

/** Mean glyph advance for Inter, as a fraction of font size — bold runs wider
 *  than semibold. Close enough to fit text without measuring it in the DOM
 *  (which would mean a layout pass per label, ~800 of them at LGA level). */
const CHAR_W_BOLD = 0.58;
const CHAR_W_SEMIBOLD = 0.56;

const LINE_HEIGHT_UNIFORM = 1.05;
const LINE_HEIGHT_SHRINK = 1.02;

/**
 * How far a `uniform` label may spill past its shape's inscribed circle before
 * it counts as not fitting.
 *
 * The inscribed circle is a conservative measure of a polygon — a state is
 * almost never a disc, and there is usually real estate either side of the
 * widest circle you can draw inside it. A little overflow lands on the shape
 * anyway, so insisting on the circle alone hides labels that read perfectly.
 */
const OVERFLOW_TOLERANCE = 1.45;

/**
 * The same limit for `shrink`, and looser.
 *
 * `shrink` has already given a name every size its shape can take before it
 * gets here, so a label that still does not fit is one the map has no room for
 * at all, and holding it to the `uniform` figure would unlabel a tenth of a
 * state. At 2 the layer keeps 96% of its names and loses only the ones that
 * were never labels: measured over all 774 LGAs, a floored name runs up to
 * nine times the width of the shape it belongs to — Ibadan North East,
 * Ajeromi-Ifelodun, Kano Municipal — and at that ratio the text reads as
 * damage to the neighbouring LGAs rather than as a name.
 */
const SHRINK_OVERFLOW_TOLERANCE = 2;

function width(text: string, fontSize: number, charW: number): number {
  return text.length * charW * fontSize;
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
 * `uniform`: lay the name out at the layer's size, or refuse to.
 *
 * One line at full size, two lines at full size, then a bounded shrink, and
 * `null` if none of those fit. Refusing is the point: without it, a long name
 * in a narrow shape gets drawn at whatever size the arithmetic produces and
 * spills across two neighbours, where the parts over other fills read as
 * fragments of a word rather than as a label.
 */
function fitUniform(
  text: string,
  fontSize: number,
  maxWidth: number | undefined,
  minScale: number,
): { lines: string[]; size: number } | null {
  if (!maxWidth || maxWidth <= 0) return { lines: [text], size: fontSize };

  const room = maxWidth * OVERFLOW_TOLERANCE;
  const floor = fontSize * minScale;
  const wrapped = balancedSplit(text);
  const longest = (lines: string[]) => Math.max(...lines.map((l) => l.length));

  if (width(text, fontSize, CHAR_W_BOLD) <= room) return { lines: [text], size: fontSize };
  if (wrapped && longest(wrapped) * CHAR_W_BOLD * fontSize <= room) {
    return { lines: wrapped, size: fontSize };
  }

  const twoLineSize = wrapped ? room / (longest(wrapped) * CHAR_W_BOLD) : 0;
  if (wrapped && twoLineSize >= floor) {
    return { lines: wrapped, size: Math.min(fontSize, twoLineSize) };
  }

  const oneLineSize = room / (text.length * CHAR_W_BOLD);
  if (oneLineSize >= floor) return { lines: [text], size: Math.min(fontSize, oneLineSize) };

  return null;
}

/**
 * `shrink`: scale the name to the shape it sits in, and always draw something.
 *
 * The LGA layer's mode. A state's LGAs vary in area by two orders of magnitude,
 * and holding them all to one size means labelling the large ones and
 * abandoning a third of the map — so here each name takes what its own polygon
 * can give, down to `minFontSize`, and the halo does the work of keeping the
 * small ones readable against the fill.
 */
function fitShrink(
  text: string,
  fontSize: number,
  maxWidth: number | undefined,
  minFontSize: number | undefined,
): { lines: string[]; size: number } | null {
  if (!maxWidth || maxWidth <= 0 || width(text, fontSize, CHAR_W_SEMIBOLD) <= maxWidth) {
    return { lines: [text], size: fontSize };
  }

  const floor = minFontSize ?? fontSize * 0.6;

  /**
   * How far a layout spills past the inscribed circle, as a multiple of it.
   *
   * Both axes, because the circle is as tall as it is wide: a two-line stack
   * can be the narrower layout and still cross the boundary top and bottom.
   * Measuring only the width is what let a tall stack in a flat LGA through.
   */
  const spill = (lines: string[], size: number) =>
    Math.max(
      Math.max(...lines.map((l) => l.length)) * CHAR_W_SEMIBOLD * size,
      (lines.length - 1) * LINE_HEIGHT_SHRINK * size + size,
    ) / maxWidth;

  let best = { lines: [text], size: Math.max(floor, maxWidth / (text.length * CHAR_W_SEMIBOLD)) };

  const wrapped = balancedSplit(text);
  if (wrapped) {
    const longest = Math.max(...wrapped.map((l) => l.length));
    // Clamped up to the floor rather than abandoned below it. Two lines at the
    // floor are always narrower than one line at the floor, so refusing to wrap
    // once the wrapped size fell under it gave up on wrapping in exactly the
    // shapes too tight to take the name any other way.
    const size = Math.max(floor, Math.min(fontSize, maxWidth / (longest * CHAR_W_SEMIBOLD)));
    if (spill(wrapped, size) < spill(best.lines, best.size)) best = { lines: wrapped, size };
  }

  return spill(best.lines, best.size) > SHRINK_OVERFLOW_TOLERANCE ? null : best;
}

/**
 * Permanent map label.
 *
 * Two modes, because the two layers have genuinely different problems.
 *
 * The **national** layer is 37 shapes of comparable size, and its labels are
 * read as a set — an eye scanning the country should meet one typographic
 * voice, not 37 sizes. So it runs `uniform`: flat black, bold, one size, and a
 * shape that cannot hold its name at that size goes unlabelled and is named on
 * hover instead. Black rather than white because it is the better of the two
 * across all three band fills — white on the amber lands near 2.6:1. Its halo
 * is *conditional*: over the plain wash the fill is never close enough to black
 * to need one and a halo only fattens the letters, but over satellite imagery
 * or an OSM street map a name can land on anything, so the caller turns it on
 * with the base map — see `NigeriaChoropleth`.
 *
 * The **LGA** layer is up to 44 shapes inside one state, varying in area by two
 * orders of magnitude. Held to one size it would label the big ones and give up
 * on the rest, so it runs `shrink` with a halo: each name is sized to its own
 * polygon, and the halo carries the small ones over whatever fill they sit on.
 *
 * Both modes can decline. `uniform` declines when the name will not fit at the
 * layer's size; `shrink` declines only after shrinking to the floor has failed,
 * which over all 774 LGAs is 30 of them, nearly all in Lagos and metropolitan
 * Ibadan and Kano. Those are named on hover and in the pane's list. A name you
 * cannot read is worse than no name, because it looks like a rendering fault
 * rather than a decision.
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
  mode = 'uniform',
  minFontSize,
  minScale = 0.7,
  halo = false,
}: MapLabelProps) {
  const laid =
    mode === 'shrink'
      ? fitShrink(text, fontSize, maxWidth, minFontSize)
      : fitUniform(text, fontSize, maxWidth, minScale);

  if (!laid) return null;

  const { lines, size } = laid;
  const lineHeight = mode === 'shrink' ? LINE_HEIGHT_SHRINK : LINE_HEIGHT_UNIFORM;
  const offset = -((lines.length - 1) / 2) * size * lineHeight;

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
      style={
        halo
          ? {
              paintOrder: 'stroke',
              stroke: 'rgb(255 255 255 / 0.85)',
              strokeWidth: size / 4,
              strokeLinejoin: 'round',
            }
          : undefined
      }
    >
      {lines.map((line, i) => (
        <tspan key={line} x={x} dy={i === 0 ? offset : size * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
