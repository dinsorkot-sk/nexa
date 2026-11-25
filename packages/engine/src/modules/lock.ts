import { AsyncLocalStorage } from 'node:async_hooks';
import { EngineError, type SchemaLockableSqlDriver, type SqlDriver } from '../contracts/index.js';

const tails = new WeakMap<SqlDriver, Promise<unknown>>();
const held = new AsyncLocalStorage<Set<SqlDriver>>();

/**
 * Per-tenant-database mutex shared by every schema-changing service (ModuleService, MetadataStore):
 * their read-registry → build → migrate → swap sequences must not interleave. Not re-entrant:
 * calling another locked operation from inside `fn` (e.g. from a module hook) throws instead of hanging.
 *
 * In-process callers queue here; on a database shared by several processes (PgDriver) the holder also
 * takes the driver's cross-process schema lock, so two API processes never change one tenant's schema
 * at the same time. The services rebuild their registry from the database inside the lock, so the second
 * changer works from the first one's committed state.
 */
export function withDriverLock<T>(db: SqlDriver, fn: () => Promise<T>): Promise<T> {
  if (held.getStore()?.has(db)) {
    return Promise.reject(new EngineError('Nested schema change on the same tenant (e.g. from a module hook) is not allowed'));
  }
  const prev = tails.get(db) ?? Promise.resolve();
  const lockable = typeof (db as Partial<SchemaLockableSqlDriver>).withSchemaLock === 'function' ? db as SchemaLockableSqlDriver : undefined;
  const locked = lockable ? () => lockable.withSchemaLock(fn) : fn;
  const run = prev.catch(() => undefined).then(() => held.run(new Set([...(held.getStore() ?? []), db]), locked));
  tails.set(db, run.catch(() => undefined));
  return run;
}
