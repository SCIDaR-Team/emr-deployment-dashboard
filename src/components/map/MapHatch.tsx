/**
 * SVG counterpart to the `.hatch-secondary` CSS class in globals.css.
 *
 * The 25 secondary-evidence states have no facility-level detail — colouring
 * them the same as an assessed state would silently overstate the evidence.
 * Guide §8.3: "render them with a distinct hatch... Silently showing them as
 * 'no data' would be wrong — there *is* state-level data, just not
 * facility-level."
 */
export function MapHatchDefs({ id, solid = true }: { id: string; solid?: boolean }) {
  return (
    <defs>
      <pattern id={id} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        {/* Over a raster base map the backing rect has to go: it is opaque, so
            all 25 secondary states rendered as one flat grey slab and the
            imagery the reader had just switched on was visible nowhere except
            the 12 assessed states. The diagonals alone carry the same "this is
            desk review, not measurement" signal. */}
        {solid && <rect width={7} height={7} className="fill-muted" />}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={7}
          className="stroke-muted-foreground"
          strokeWidth={2.5}
          strokeOpacity={solid ? 0.35 : 0.55}
        />
      </pattern>
    </defs>
  );
}
