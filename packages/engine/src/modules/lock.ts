import type { SqlDriver } from '../contracts/index.js';

const tails = new WeakMap<SqlDriver, Promise<unknown>>();

/**
 * Per-tenant-database mutex shared by every schema-changing service (ModuleService, MetadataStore):
 * their read-registry → build → migrate → swap sequences must not interleave. Not re-entrant:
 * never call another locked operation from inside `fn` (e.g. from a module hook).
 */
export function withDriverLock<T>(db: SqlDriver, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(db) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  tails.set(db, run.catch(() => undefined));
  return run;
}
