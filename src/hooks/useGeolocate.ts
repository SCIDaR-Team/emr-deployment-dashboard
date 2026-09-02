import { useCallback, useRef, useState } from 'react';

/**
 * "Where am I?" — the browser's own fix, handed to the map.
 *
 * The one control on a GIS toolbar that cannot be derived from the data: every
 * other button moves the camera relative to things the dashboard already knows
 * about, and this one relates the map to the person reading it. It matters most
 * for exactly the reader this dashboard is built for — a supervisor standing in
 * an LGA office deciding which of six facilities to visit — for whom "which of
 * these is nearest to me" is a real question the map can answer and a list
 * cannot.
 *
 * ## Permission is the caller's, not ours
 *
 * `getCurrentPosition` is what raises the browser's permission prompt, and it
 * is only ever called from a click. Nothing here runs on mount: a dashboard
 * that asks for a reader's location the moment a map appears has asked for
 * something it had no reason to want yet, and the honest version of this
 * control is one that only fires when someone presses it.
 *
 * A refusal is a normal outcome rather than a fault. `error` carries a line the
 * caller can show and then forget; there is no retry loop and no second prompt.
 */

export type GeolocateStatus = 'idle' | 'locating' | 'denied' | 'unavailable';

export function useGeolocate(onFix: (lat: number, lon: number, accuracyM: number) => void) {
  const [status, setStatus] = useState<GeolocateStatus>('idle');
  /** The latest callback, so a fix arriving after a re-render is delivered to
   *  the current viewport rather than to a stale closure over an old one. */
  const handler = useRef(onFix);
  handler.current = onFix;

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const locate = useCallback(() => {
    if (!supported) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus('idle');
        handler.current(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy,
        );
      },
      (error) => {
        // PERMISSION_DENIED is a decision; the other two (position unavailable,
        // timeout) are the device failing to get a fix. The reader can act on
        // the first and not on the others, so they are worded differently.
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      // A rough fix now beats a precise one in fifteen seconds: this control
      // pans a map, it does not navigate a vehicle. `maximumAge` lets a second
      // press inside a minute reuse the fix rather than wake the radio again.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }, [supported]);

  const clear = useCallback(() => setStatus('idle'), []);

  return { supported, status, locate, clear };
}

/** What to tell the reader when a fix did not arrive. Null while nothing has
 *  gone wrong, which is the usual case. */
export function geolocateMessage(status: GeolocateStatus): string | null {
  if (status === 'denied') return 'Location access was declined in the browser.';
  if (status === 'unavailable') return 'Your location could not be determined.';
  return null;
}
