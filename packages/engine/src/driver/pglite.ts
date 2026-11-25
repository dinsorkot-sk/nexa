import { AsyncLocalStorage } from 'node:async_hooks';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { CompiledSql, SqlDriver } from '../contracts/index.js';

interface TxScope {
  db: PGlite;
  tx: Transaction;
  depth: number;
  /** serializes sibling nested transactions at this level */
  lock: { tail: Promise<void> };
}

/**
 * SqlDriver backed by PGlite (single connection, transactions serialized by PGlite).
 *
 * - The active transaction is tracked per async context: any query issued from inside
 *   `transaction()` — even through a handle obtained outside it — joins that transaction
 *   instead of deadlocking on PGlite's mutex.
 * - Nested `transaction()` calls use SAVEPOINTs, so an inner failure rolls back only its own writes.
 * - Promises started inside a transaction must be awaited before it ends; a query issued after
 *   commit from such a dangling promise would hit a closed transaction handle.
 * - Sibling nested transactions are serialized. Do not run raw parent-level queries concurrently
 *   with a nested transaction (they would land inside its savepoint), and never make a nested
 *   transaction await a sibling started after it (deadlock).
 */
export class PgliteDriver implements SqlDriver {
  private readonly scope = new AsyncLocalStorage<TxScope>();
  private spSeq = 0;

  private constructor(private readonly db: PGlite) {}

  /** dataDir: filesystem path for a tenant, or undefined for in-memory */
  static async open(dataDir?: string): Promise<PgliteDriver> {
    const db = dataDir ? new PGlite(dataDir) : new PGlite();
    await db.waitReady;
    // Pin the session zone: now()/timestamptz text and naive<->tz casts must never depend on the host.
    await db.exec(`SET TimeZone TO 'UTC'`);
    return new PgliteDriver(db);
  }

  async query<T = Record<string, unknown>>(sql: CompiledSql): Promise<T[]> {
    const s = this.scope.getStore();
    const conn = s && s.db === this.db ? s.tx : this.db;
    return (await conn.query<T>(sql.text, sql.params)).rows;
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    const s = this.scope.getStore();
    if (s && s.db === this.db) {
      // Savepoints form a stack on the single connection, so sibling nested transactions
      // started concurrently (e.g. Promise.all) must run one after another.
      const prev = s.lock.tail;
      let release!: () => void;
      s.lock.tail = new Promise<void>((r) => (release = r));
      await prev;
      const sp = `sp_${++this.spSeq}`;
      try {
        await s.tx.query(`SAVEPOINT ${sp}`);
        try {
          const result = await this.scope.run({ ...s, depth: s.depth + 1, lock: { tail: Promise.resolve() } }, () => fn(this));
          await s.tx.query(`RELEASE SAVEPOINT ${sp}`);
          return result;
        } catch (err) {
          await s.tx.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          throw err;
        }
      } finally {
        release();
      }
    }
    return this.db.transaction((tx) =>
      this.scope.run({ db: this.db, tx, depth: 0, lock: { tail: Promise.resolve() } }, () => fn(this)));
  }

  /** True when called from inside a transaction on this driver. */
  get inTransaction(): boolean {
    return this.scope.getStore()?.db === this.db;
  }

  /** LISTEN on `channel` (in-process: PGlite delivers NOTIFYs of committed transactions on its single connection). */
  async listen(channel: string, onPayload: (payload: string) => void): Promise<() => Promise<void>> {
    const unlisten = await this.db.listen(channel, onPayload);
    return () => unlisten();
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
