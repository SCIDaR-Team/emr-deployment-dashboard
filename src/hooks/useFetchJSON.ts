/**
 * useFetchJSON — shared fetch state machine.
 *
 * Adapted from srh-dashboard/src/hooks/useFetchJSON.ts. Differences: paths are
 * static JSON under /data rather than serverless endpoints, and a module-level
 * cache means a second component asking for the same path gets the in-flight
 * promise instead of a second request.
 *
 * The hook always resolves to a value (`fallback`) so consumers never guard
 * against undefined. On failure `error` is set but `data` keeps the last good
 * value — a transient error should not blank a dashboard someone is reading.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface FetchState<T> {
  data: T;
  isLoading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  refetch: () => void;
}

/**
 * A failed fetch that got as far as a response, carrying its status.
 *
 * The status is the difference between "this facility does not exist" and "the
 * server is down", and consumers have to be able to tell those apart — a 404 on
 * a facility shard is a real answer about the UUID, anything else is a failure
 * to load and the reader should be offered a retry rather than told their id
 * was wrong. A network failure never becomes a `FetchError` at all: `fetch`
 * rejects with a TypeError before there is a status to carry, and `status`
 * being absent is exactly what "we never reached the server" means.
 */
export class FetchError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(path: string, status: number, message?: string) {
    super(message ?? `${path} responded ${status}`);
    this.name = 'FetchError';
    this.status = status;
    this.path = path;
  }
}

/** True when the resource was reached and reported as absent. */
export function isNotFound(error: Error | null): boolean {
  return error instanceof FetchError && error.status === 404;
}

interface Options<T> {
  /** Absolute path, e.g. "/data/states.json". Null skips the fetch. */
  path: string | null;
  fallback: T;
}

/** Shared across hook instances so N components cause one request. */
const inflight = new Map<string, Promise<unknown>>();
const resolved = new Map<string, unknown>();

export function clearFetchCache(path?: string): void {
  if (path) {
    inflight.delete(path);
    resolved.delete(path);
  } else {
    inflight.clear();
    resolved.clear();
  }
}

/**
 * Shared, deliberately uncancellable.
 *
 * One request is shared by every component asking for the same path, so it must
 * not carry any single caller's abort signal — otherwise the first consumer to
 * unmount kills the response for all the others. React 18 StrictMode makes that
 * immediate rather than occasional: it mounts, unmounts and remounts every
 * effect, so a signal-bound shared promise aborts on the first pass and the
 * remount inherits the failure.
 *
 * Callers still drop late results via their own AbortController — they just
 * cancel their interest in the response, not the request itself.
 */
async function fetchJSON<T>(path: string): Promise<T> {
  if (resolved.has(path)) return resolved.get(path) as T;

  let promise = inflight.get(path) as Promise<T> | undefined;
  if (!promise) {
    promise = fetch(path)
      .then(async (res) => {
        if (!res.ok) throw new FetchError(path, res.status);

        /*
         * A missing data file does not 404 here — it succeeds.
         *
         * Both the dev server and Netlify serve an SPA fallback: every
         * unmatched path returns `index.html` with a 200 (netlify.toml's
         * `from = "/*"` rule). So a data file left out of a deploy arrives as
         * HTML with an OK status, `res.json()` throws deep inside the parser,
         * and the reader is shown `Unexpected token '<'`. That is the single
         * most likely way this application fails in production and it was the
         * least legible message it could produce.
         *
         * netlify.toml now 404s /data and /geo ahead of the catch-all, which is
         * the real fix. This is the second line of it, for the dev server and
         * for any host that does not honour those rules.
         */
        if ((res.headers.get('content-type') ?? '').includes('text/html')) {
          throw new FetchError(
            path,
            res.status,
            `${path} returned the application shell instead of JSON — the file is missing from this build or deploy`,
          );
        }

        try {
          return (await res.json()) as T;
        } catch {
          throw new FetchError(path, res.status, `${path} is not valid JSON`);
        }
      })
      .then((value) => {
        resolved.set(path, value);
        return value;
      })
      .finally(() => {
        inflight.delete(path);
      });
    inflight.set(path, promise);
  }

  return promise;
}

export function useFetchJSON<T>({ path, fallback }: Options<T>): FetchState<T> {
  const [data, setData] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(path !== null);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const ctrlRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!path) {
      setIsLoading(false);
      return;
    }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setIsLoading(true);

    try {
      const body = await fetchJSON<T>(path);
      if (ctrl.signal.aborted) return;
      setData(body);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!ctrl.signal.aborted) setIsLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void run();
    return () => ctrlRef.current?.abort();
  }, [run]);

  return { data, isLoading, error, lastUpdated, refetch: run };
}
