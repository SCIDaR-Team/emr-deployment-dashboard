interface MapLabelProps {
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fontWeight?: number;
  className?: string;
  /** Room the label has, in viewBox units — normally the inscribed diameter
   *  reported by `geomLabelPoint`. Given this, the label wraps and shrinks to
   *  stay inside its own shape instead of spilling across the boundary. */
  maxWidth?: number;
  /** Floor for that shrinking. Below it a label is unreadable anyway, so it is
   *  better to render at the floor than to keep scaling into noise. */
  minFontSize?: number;
}

/** Mean glyph advance for Inter at semibold, as a fraction of font size. Close
 *  enough to fit text without measuring it in the DOM (which would mean a
 *  layout pass per label, ~800 of them at the LGA level). */
const CHAR_W = 0.56;

const LINE_HEIGHT = 1.02;

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

function fit(text: string, fontSize: number, maxWidth?: number, minFontSize?: number) {
  if (!maxWidth || maxWidth <= 0 || width(text, fontSize) <= maxWidth) {
    return { lines: [text], size: fontSize };
  }

  const floor = minFontSize ?? fontSize * 0.6;
  const wrapped = balancedSplit(text);
  if (wrapped) {
    const longest = Math.max(...wrapped.map((l) => l.length));
    const size = maxWidth / (longest * CHAR_W);
    // Two lines are only an improvement while they still fit vertically —
    // a tall stack in a wide flat LGA spills across the boundary the same way.
    if (size >= floor && size * 2 * LINE_HEIGHT <= maxWidth) {
      return { lines: wrapped, size: Math.min(fontSize, size) };
    }
  }

  return { lines: [text], size: Math.max(floor, maxWidth / (text.length * CHAR_W)) };
}

/**
 * Permanent map label — a halo behind the glyphs (via `paint-order: stroke`)
 * so a name stays legible over any of the three readiness fills, the
 * secondary-evidence hatch, or satellite imagery, in either theme, without
 * needing to know what's underneath it. Same technique
 * `NPHCDA_dashboard_int`'s map uses.
 *
 * `x`/`y` should be a `geomLabelPoint`, not a centroid — see the note there.
 */
export function MapLabel({
  x,
  y,
  text,
  fontSize = 10,
  fontWeight = 600,
  className,
  maxWidth,
  minFontSize,
}: MapLabelProps) {
  const { lines, size } = fit(text, fontSize, maxWidth, minFontSize);
  const offset = -((lines.length - 1) / 2) * size * LINE_HEIGHT;

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={size}
      fontWeight={fontWeight}
      className={className ?? 'fill-foreground'}
      pointerEvents="none"
      style={{
        paintOrder: 'stroke',
        stroke: 'hsl(var(--surface) / 0.85)',
        strokeWidth: size / 4,
        strokeLinejoin: 'round',
      }}
    >
      {lines.map((line, i) => (
        <tspan key={line} x={x} dy={i === 0 ? offset : size * LINE_HEIGHT}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
