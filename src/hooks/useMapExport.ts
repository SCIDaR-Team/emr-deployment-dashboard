import { useCallback, useRef, useState } from 'react';
import { exportElementToPNG, exportFilename } from '@/lib/export';
import { toast } from '@/store/toastStore';
import { baseMapSource, type BaseMapId } from '@/store/basemapStore';

/**
 * Save the map as a picture.
 *
 * These maps end up in ministry slide decks and funder reports, and until now
 * the only way to get one out was an operating-system screenshot — which crops
 * to a rectangle the reader drags by hand, and so routinely loses the legend,
 * the scale bar and the attribution. A map that arrives somewhere with no key
 * and no scale is a coloured shape, and one that arrives without its
 * attribution breaches the tile providers' terms.
 *
 * Capturing the **frame** rather than the `<svg>` is what fixes that, and it
 * works because the legend, scale bar, breadcrumb and attribution were all
 * moved inside the frame when the map learned to go full screen. One raster of
 * that element is a complete, self-explanatory map.
 *
 * ## The caption
 *
 * Burnt in under the image, because everything above it is pixels the moment
 * the file leaves. It carries the two things a reader of the *file* cannot
 * recover and would otherwise guess at: which geography this is, and that the
 * findings behind the colours came from. The tile attribution rides along
 * whenever a base map is on, which is the terms-of-use requirement.
 *
 * ## What does not survive
 *
 * Raster base-map tiles. `html2canvas` renders inline SVG by serialising it and
 * drawing it as an image, and a serialised SVG is not permitted to fetch the
 * external resources it references — so the `<image>` elements that carry
 * OpenStreetMap and Esri tiles come out blank. The polygons, points, labels and
 * every piece of chrome are unaffected. Rather than hand over a map with a hole
 * where the imagery was, the caller is told before the file is written; see the
 * warning below. Exporting on the default **Plain** base map is lossless.
 */
export function useMapExport(
  frameRef: React.RefObject<HTMLElement>,
  /** Filename parts and caption lines — see `exportFilename`. */
  options: {
    /** e.g. ['assessed-states', 'kano', 'sumaila'] */
    name: (string | null | undefined)[];
    /** Human-readable scope line, e.g. 'Nigeria / Kano / Sumaila'. */
    scope: string;
    /** What the colours encode, e.g. 'Investment need'. */
    encoding?: string;
    baseMap: BaseMapId;
  },
) {
  const [busy, setBusy] = useState(false);
  // Guards a double click while the dynamic `html2canvas` import is in flight —
  // the state above has not flipped yet at that point.
  const running = useRef(false);

  const { name, scope, encoding, baseMap } = options;

  const exportPng = useCallback(async () => {
    const el = frameRef.current;
    if (!el || running.current) return;
    running.current = true;
    setBusy(true);

    const tile = baseMapSource(baseMap).tile;
    if (tile) {
      toast.warning(
        'Base map will not be included',
        'Tile imagery cannot be captured. Switch the base map to Plain for a complete image.',
      );
    }

    try {
      await exportElementToPNG(el, exportFilename(...name), {
        caption: [
          scope,
          ...(encoding ? [`Coloured by: ${encoding}`] : []),
          ...(tile ? [tile.attribution] : []),
          'EMR Readiness Assessment — facility assessment data',
        ],
      });
      toast.success('Map image saved');
    } catch (error) {
      // Rasterising is the one interaction here that can genuinely fail at
      // runtime — a tainted canvas, an out-of-memory canvas on iOS — so the
      // reason is shown rather than swallowed into a silent no-op.
      toast.error(
        'Could not save the map',
        error instanceof Error ? error.message : 'The browser refused to render it.',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [frameRef, name, scope, encoding, baseMap]);

  return { exportPng, busy };
}
