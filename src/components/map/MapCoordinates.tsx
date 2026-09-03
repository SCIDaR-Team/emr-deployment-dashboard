import { useCallback, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, Crosshair, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatLatLon, plainLatLon, POINTER_DP } from './coordinates';
import { zoomForRect } from './tiles';
import { MapScaleBar } from './MapScaleBar';
import type { ViewportRect } from '@/hooks/useMapViewport';

/**
 * Latitude and longitude, treated as data rather than as decoration.
 *
 * Two components, for the two questions a reader asks about position.
 *
 * `PointerCoordinates` answers *"where is this?"* — a live readout of whatever
 * is under the cursor, the status-bar fixture every desktop GIS carries. It is
 * what turns the map from a picture into an instrument: a reader can put the
 * cursor on an unlabelled cluster of buildings and read off a coordinate, with
 * no feature there to click.
 *
 * `FacilityCoordinates` answers *"where is this **facility**?"* — the surveyed
 * position of one PHC, at the precision the survey recorded it, with the two
 * things anyone actually does with a coordinate: copy it, or open it in
 * something that can navigate to it. A coordinate printed and not copyable is a
 * coordinate that gets transcribed by hand into a phone, which is where the
 * digit errors come from.
 *
 * Formatting and precision live in `coordinates.ts` — see the note there.
 */

/**
 * Live position under the cursor.
 *
 * Renders nothing at all when the pointer is off the map, rather than freezing
 * on the last position it saw — a stale coordinate presented as a live one is
 * the readout lying, and there is no way for the reader to tell.
 */
export function PointerCoordinates({
  lat,
  lon,
  className,
}: {
  lat: number | null;
  lon: number | null;
  className?: string;
}) {
  if (lat == null || lon == null) return null;
  return (
    <div
      className={cn(
        'pointer-events-none flex items-center gap-1.5 rounded border border-border bg-surface/92 px-2 py-1 backdrop-blur',
        className,
      )}
    >
      <Crosshair className="h-3 w-3 text-muted-foreground" aria-hidden />
      <span className="mono text-[10px] leading-none text-foreground">
        {formatLatLon(lat, lon, POINTER_DP)}
      </span>
    </div>
  );
}

/**
 * A selected facility's surveyed coordinate, with what to do with it.
 *
 * The external link opens OpenStreetMap rather than a proprietary maps service:
 * it needs no account, works from a ministry network without a key, and is the
 * same data the Streets base map is already drawing, so the reader lands on a
 * recognisable continuation of the view they left rather than a different
 * rendering of the same place.
 */
export function FacilityCoordinates({
  lat,
  lon,
  className,
}: {
  lat: number;
  lon: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    const text = plainLatLon(lat, lon);
    // `writeText` rejects on an insecure origin and wherever the permission is
    // refused. The fallback is not a nicety: a dashboard opened over plain HTTP
    // on an internal network hits it every time.
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(legacyCopy);
    } else {
      legacyCopy();
    }
    function legacyCopy() {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
        done();
      } finally {
        document.body.removeChild(el);
      }
    }
  }, [lat, lon]);

  const action =
    'grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      {/* `whitespace-nowrap`: the pair is one value, and a coordinate broken
          across two lines after the comma reads as two. The card is sized to
          hold it — see the caller. */}
      <span className="mono whitespace-nowrap text-[11px] leading-tight text-foreground">
        {formatLatLon(lat, lon)}
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={copy}
          className={action}
          title="Copy coordinates"
          // The label carries the outcome, not just the affordance — a screen
          // reader user gets no visual tick, so the confirmation has to be here.
          aria-label={copied ? 'Coordinates copied' : 'Copy coordinates'}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-ready-ink" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`}
          target="_blank"
          rel="noreferrer noopener"
          className={action}
          title="Open this location in OpenStreetMap"
          aria-label="Open this location in OpenStreetMap (opens in a new tab)"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </span>
    </div>
  );
}

/**
 * How far in the map is, on the scale every other mapping tool uses.
 *
 * Not a ratio against the layer's own extent — that number is meaningless
 * across levels, since "4x" is a different amount of ground in Kano and in
 * Dala. The slippy-map zoom level is absolute: z 6 is a country, z 12 is a
 * town, z 17 is a street, z 19 is a roof, in this map and in every other one
 * the reader has used. It is what makes "zoom until you can see the building"
 * a checkable instruction rather than a hope.
 *
 * One decimal place, because the camera is continuous and an integer readout
 * would sit still through a third of a gesture.
 */
export function MapZoomLevel({
  rect,
  renderPx,
  className,
}: {
  rect: ViewportRect;
  renderPx: number;
  className?: string;
}) {
  const z = zoomForRect(rect, renderPx);
  if (!Number.isFinite(z)) return null;
  return (
    <div
      className={cn(
        'pointer-events-none flex items-center gap-1.5 rounded border border-border bg-surface/92 px-2 py-1 backdrop-blur',
        className,
      )}
      title="Map zoom level — the same scale as OpenStreetMap and Google Maps"
    >
      <ZoomIn className="h-3 w-3 text-muted-foreground" aria-hidden />
      <span className="mono text-[10px] leading-none text-foreground">z {z.toFixed(1)}</span>
    </div>
  );
}

/**
 * The map's status bar: how much ground, how far in, and where the pointer is.
 *
 * One component rather than three absolutely-positioned siblings in each of the
 * three layers, because they are one thing — the strip along the bottom of the
 * frame that every desktop GIS has, and that turns a picture into an
 * instrument. Keeping them together is also what stops the coordinate readout
 * appearing and disappearing under the scale bar as the pointer crosses the
 * edge of the map: the row reserves its height whether or not there is a
 * coordinate to put in it.
 */
export function MapStatusBar({
  rect,
  renderPx,
  cursor,
  extra,
  className,
}: {
  rect: ViewportRect;
  renderPx: number;
  /** Null whenever the pointer is off the map — see `PointerCoordinates`. */
  cursor: { lat: number; lon: number } | null;
  /** Anything the layer wants in the same strip, to its right. */
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('pointer-events-none flex flex-col items-start gap-1', className)}>
      {/* The bar gets the same chip as everything else in the strip. It used to
          sit bare on the map, which was fine over a flat wash and illegible the
          moment satellite imagery went underneath it — dark text and a dark
          rule on a dark roof. Every readout on a map has to survive whatever
          the base map happens to put behind it. */}
      <span className="rounded border border-border bg-surface/92 px-1.5 py-1 backdrop-blur">
        <MapScaleBar rect={rect} renderPx={renderPx} />
      </span>
      <div className="flex min-h-[22px] items-center gap-1">
        <MapZoomLevel rect={rect} renderPx={renderPx} />
        <PointerCoordinates lat={cursor?.lat ?? null} lon={cursor?.lon ?? null} />
        {extra}
      </div>
    </div>
  );
}
