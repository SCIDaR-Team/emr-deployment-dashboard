import { useEffect, useRef, useState } from 'react';
import { baseMapSource, type BaseMapId } from '@/store/basemapStore';
import { centreTile, requestedZoom, type ViewBoxRect } from './tiles';

/**
 * How close the imagery actually goes, here.
 *
 * ## The problem this exists for
 *
 * Satellite coverage is not uniform, and a raster tile service does not
 * advertise that in the tiles. Esri's World Imagery has metre-scale photography
 * over Kano city and stops two levels short over Rano, forty kilometres away —
 * and asking it for a level it does not have does **not** produce an error. It
 * produces `200 image/jpeg`, 2,521 bytes, a grey square reading "Map data not
 * yet available", which loads successfully and paints over anything underneath
 * it exactly as a real tile would.
 *
 * So a facility view that zoomed past the local coverage filled the frame with
 * grey placeholders — while perfectly good imagery, one level up, went
 * unrequested. Neither the tile-error counter nor the coarse fallback layer can
 * catch that: both are watching for failures, and nothing failed.
 *
 * ## What it does instead
 *
 * Esri publishes a `tilemap` endpoint that answers the question directly:
 * `{"data":[1]}` if the tile exists, `{"data":[0]}` if it does not. So before
 * requesting a deep level, ask; and if the answer is no, step down and ask
 * again. One tile at the centre of the view stands for the whole view —
 * imagery footprints are whole cities, not screenfuls — so this costs one
 * ~120-byte JSON request per view, memoised, and none at all above z16 where
 * global coverage is complete.
 *
 * The result caps what `TileLayer` asks for. The reader gets the sharpest
 * imagery that exists for where they are, enlarged past that point rather than
 * replaced by a grey grid — and told which it is, because "this is as close as
 * the photography goes" is an answer and a grey square is not.
 */

/**
 * Above this, coverage is complete for both providers worldwide and asking
 * would be a request per view for a foregone answer. Esri's own global
 * mosaic runs to z16-17 everywhere; the patchiness starts after.
 */
const PROBE_ABOVE = 16;

/** Resolved answers, keyed `z/x/y`. Coverage is a property of the imagery
 *  archive and does not change within a session. */
const answers = new Map<string, boolean>();
/** In-flight probes, so two layers asking about the same tile in the same
 *  frame make one request. */
const pending = new Map<string, Promise<boolean>>();

function probe(template: string, z: number, x: number, y: number): Promise<boolean> {
  const key = `${z}/${x}/${y}`;
  const known = answers.get(key);
  if (known !== undefined) return Promise.resolve(known);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const url = template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

  const request = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { data?: unknown[] } | null) => {
      // Anything unexpected is treated as "yes". A probe that cannot answer
      // must not be able to *lower* the imagery the reader gets — the failure
      // mode of this whole mechanism has to be the behaviour it replaced, not
      // a blurrier map.
      const ok = !body || !Array.isArray(body.data) ? true : body.data.some((v) => v === 1);
      answers.set(key, ok);
      return ok;
    })
    .catch(() => {
      // Not cached: a network blip should be retried on the next view, whereas
      // a real answer is permanent.
      return true;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

export interface ImageryDepth {
  /** The deepest level to request, or undefined for "no cap — ask for what the
   *  view wants". Passed straight to `tilesForRect`. */
  zoomCap?: number;
  /** Set when the view is closer than the imagery goes, so the caller can say
   *  so. Null the rest of the time, which is most of it. */
  notice: string | null;
}

/**
 * The imagery cap for a view, resolved in the background.
 *
 * Holds the previous answer while a new one is in flight rather than dropping
 * to uncapped: panning across a city crosses tile boundaries constantly, and
 * flashing a grid of grey placeholders between two correct answers would be
 * worse than being a moment out of date. The first view of a session is
 * uncapped until its probe lands, which is the one case with nothing better to
 * show.
 */
export function useImageryDepth(
  baseMap: BaseMapId,
  rect: ViewBoxRect,
  renderPx: number,
): ImageryDepth {
  const source = baseMapSource(baseMap);
  const coverage = source.tile?.coverage;
  const want = source.tile ? requestedZoom(rect, source, renderPx) : 0;

  const [cap, setCap] = useState<number | undefined>(undefined);
  /** Keyed on the tile being asked about, not on the viewport: a pan inside one
   *  tile is the same question and must not re-ask it. */
  const asked = useRef<string | null>(null);

  const probeKey =
    coverage && want > PROBE_ABOVE
      ? (() => {
          const { x, y } = centreTile(rect, want);
          return `${want}/${x}/${y}`;
        })()
      : null;

  useEffect(() => {
    if (!coverage || !probeKey) {
      asked.current = null;
      setCap(undefined);
      return;
    }
    if (asked.current === probeKey) return;
    asked.current = probeKey;

    let cancelled = false;
    void (async () => {
      // Walk down from the level the view wants to the first that exists.
      // Never below `PROBE_ABOVE`, which is known-good everywhere.
      for (let z = want; z > PROBE_ABOVE; z--) {
        const { x, y } = centreTile(rect, z);
        // Sequential on purpose: each answer decides whether the next question
        // is worth asking at all, and a parallel fan-out would fire four
        // requests to use one of them.
        const ok = await probe(coverage, z, x, y);
        if (cancelled) return;
        if (ok) {
          setCap(z === want ? undefined : z);
          return;
        }
      }
      if (!cancelled) setCap(PROBE_ABOVE);
    })();

    return () => {
      cancelled = true;
    };
    // `rect` changes on every pointer move; `probeKey` is the part of it this
    // depends on, and re-running on the rect itself would probe per frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage, probeKey, want]);

  return {
    zoomCap: cap,
    notice:
      cap !== undefined && cap < want
        ? `Sharpest imagery here is z ${cap}. Closer views are enlarged, not more detailed.`
        : null,
  };
}
