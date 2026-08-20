import { StaticDataSource } from './StaticDataSource';
import type { DataSource } from './types';

export type { DataSource } from './types';
export { StaticDataSource } from './StaticDataSource';

let instance: DataSource | null = null;

/** Resolve the active data source from VITE_DATA_SOURCE. */
export function getDataSource(): DataSource {
  if (instance) return instance;
  // Only 'static' exists today; the branch is here so adding 'api' is a
  // one-line change rather than a refactor.
  instance = new StaticDataSource();
  return instance;
}
