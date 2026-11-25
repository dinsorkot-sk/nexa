import { AsyncLocalStorage } from 'node:async_hooks';
import { Client, Pool, types, type ClientConfig, type PoolClient, type PoolConfig, type QueryResult } from 'pg';
import { ConcurrencyError, EngineError, type CompiledSql, type SqlDriver } from '../contracts/index.js';

interface TxScope {
  driver: PgDriver;
  client: PoolClient;
  /**
   * done: the outermost transaction has ended (late queries must not reach a recycled client);
   * broken: the connection is unusable and must be destroyed instead of returned to the pool
   */
  state: { done: boolean; broken?: Error };
  /** serializes sibling nested transactions at this level */
  lock: { tail: Promise<void> };
}

export interface PgDriverOptions {
  /** connection string, e.g. postgres://user:pass@host:5432/db */
  connectionString: string;
  /** pool size (default 10) */
  max?: number;
  /** max wait for a connection (pool checkout, LISTEN and schema-lock connections); default 30 s */
  connectTimeoutMs?: number;
  /** max wait for the cross-process schema lock (lock_timeout of its session); default 60 s */
  schemaLockTimeoutMs?: number;
  /** extra pool options (ssl, timeouts); `options` is reserved for the session time zone */
  pool?: Omit<PoolConfig, 'connectionString' | 'max' | 'options' | 'types'>;
}

interface SchemaScope { released: boolean }

// ---------- result types: mirror PGlite's parsers so both drivers return the same JS values ----------
const toDate = (v: string): Date | number => (v === 'infinity' ? Infinity : v === '-infinity' ? -Infinity : new Date(v));
const toInt8 = (v: string): number | bigint => {
  const n = BigInt(v);
  return n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER) ? n : Number(n);
};
const textArray = types.getTypeParser(1009 as never, 'text') as (v: string) => (string | null)[];
const arrayOf = (fn: (v: string) => unknown) => (v: string): unknown => mapNested(textArray(v), fn);
function mapNested(a: unknown, fn: (v: string) => unknown): unknown {
  return Array.isArray(a) ? a.map((x) => mapNested(x, fn)) : a === null ? null : fn(a as string);
}
const PARSERS: Record<number, (v: string) => unknown> = {
  20: toInt8, 1016: arrayOf(toInt8),
  1082: toDate, 1114: toDate, 1184: toDate,
  1182: arrayOf(toDate), 1115: arrayOf(toDate), 1185: arrayOf(toDate),
};
const PG_TYPES = {
  getTypeParser: (oid: number, format?: 'text' | 'binary') =>
    (format !== 'binary' && PARSERS[oid]) || types.getTypeParser(oid as never, format as 'text'),
};

/** Dates are sent as ISO-8601 UTC (as PGlite does), never as host-local wall-clock text. */
function param(v: unknown): unknown {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : v;
  if (Array.isArray(v)) return v.map(param);
  return v;
}

function rowsOf<T>(r: QueryResult | QueryResult[]): T[] {
  // a parameterless multi-statement string returns one result per statement: keep the last (as a script would)
  const last = Array.isArray(r) ? r[r.length - 1] : r;
  return (last?.rows ?? []) as T[];
}

const CHANNEL_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * SqlDriver backed by node-postgres (a connection pool against a real PostgreSQL server).
 *
 * - Every connection runs with session TimeZone UTC (startup option), like PgliteDriver.
 * - `transaction()` checks out one pooled client and pins it in the async context: every query issued
 *   from inside the callback (through any handle of this driver) runs on that client. Other async
 *   contexts get their own connections, so transactions really run concurrently (row locks, SKIP LOCKED,
 *   NOWAIT, deadlocks and advisory locks behave as on a server).
 * - Nested `transaction()` calls use SAVEPOINTs; siblings started concurrently are serialized (one
 *   savepoint stack per connection), with the same caveats as PgliteDriver.
 * - A query issued from a dangling promise after the transaction ended is rejected instead of running
 *   on a client that may already serve another transaction.
 * - Errors are the server's DatabaseError objects, so SQLSTATE `code` (23505, 55P03, 40P01, ...) is kept.
 * - A connection that fails mid-transaction (server restart, pg_terminate_backend) rejects the
 *   transaction and is destroyed, never returned to the pool; a failing ROLLBACK [TO SAVEPOINT] never
 *   masks the original error.
 * - Pool checkout waits at most `connectTimeoutMs` (default 30 s). Hazard: a query issued OUTSIDE the
 *   transaction context while transactions hold every pooled connection waits for a free one; if those
 *   transactions themselves wait on that query, the pool is exhausted until the timeout fires. Keep work
 *   inside `transaction()` callbacks (the pinned connection) and size `max` for concurrent transactions.
 * - Value parity with PGlite: timestamps/dates parse with `new Date(text)` (millisecond precision, as
 *   PGlite) and Date parameters are sent as ISO-8601 UTC (milliseconds); int8 is a number (BigInt
 *   beyond 2^53); numeric stays a string; json/jsonb are parsed; bytea is a Buffer (a Uint8Array).
 */
export class PgDriver implements SqlDriver {
  private readonly scope = new AsyncLocalStorage<TxScope>();
  private spSeq = 0;
  private readonly listeners = new Set<PgListener>();
  private readonly schemaHeld = new AsyncLocalStorage<SchemaScope>();

  private constructor(private readonly pool: Pool, private readonly clientConfig: ClientConfig, private readonly schemaLockTimeoutMs: number) {}

  static async open(opts: PgDriverOptions): Promise<PgDriver> {
    const clientConfig: ClientConfig = {
      connectionString: opts.connectionString, options: '-c TimeZone=UTC', types: PG_TYPES,
      connectionTimeoutMillis: opts.connectTimeoutMs ?? opts.pool?.connectionTimeoutMillis ?? 30_000,
    };
    const pool = new Pool({ ...opts.pool, ...clientConfig, max: opts.max ?? 10 });
    // an idle client that loses its connection emits 'error' on the pool; without a handler it would crash the process
    pool.on('error', () => undefined);
    const driver = new PgDriver(pool, clientConfig, opts.schemaLockTimeoutMs ?? 60_000);
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      await pool.end().catch(() => undefined);
      throw err;
    }
    return driver;
  }

  async query<T = Record<string, unknown>>(sql: CompiledSql): Promise<T[]> {
    const s = this.scope.getStore();
    const params = sql.params.map(param);
    if (s && s.driver === this) {
      if (s.state.done) throw new Error('Query issued after its transaction ended');
      return rowsOf<T>(await s.client.query(sql.text, params));
    }
    return rowsOf<T>(await this.pool.query(sql.text, params) as QueryResult | QueryResult[]);
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    const s = this.scope.getStore();
    if (s && s.driver === this) {
      if (s.state.done) throw new Error('Transaction already ended');
      const prev = s.lock.tail;
      let release!: () => void;
      s.lock.tail = new Promise<void>((r) => (release = r));
      await prev;
      const sp = `sp_${++this.spSeq}`;
      try {
        await s.client.query(`SAVEPOINT ${sp}`);
        try {
          const result = await this.scope.run({ ...s, lock: { tail: Promise.resolve() } }, () => fn(this));
          await s.client.query(`RELEASE SAVEPOINT ${sp}`);
          return result;
        } catch (err) {
          try {
            await s.client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          } catch (rbErr) {
            s.state.broken ??= rbErr as Error; // keep the original error; the connection is unusable
          }
          throw err;
        }
      } finally {
        release();
      }
    }
    const client = await this.pool.connect();
    const state: TxScope['state'] = { done: false };
    // a checked-out client has no pool 'error' listener: without ours, a server-side disconnect would
    // surface as an unhandled 'error' event and crash the process
    const onError = (e: Error): void => { state.broken ??= e; };
    client.on('error', onError);
    try {
      try {
        await client.query('BEGIN');
      } catch (err) {
        state.broken ??= err as Error;
        throw err;
      }
      let result: T;
      try {
        result = await this.scope.run({ driver: this, client, state, lock: { tail: Promise.resolve() } }, () => fn(this));
      } catch (err) {
        state.done = true;
        try {
          await client.query('ROLLBACK');
        } catch (rbErr) {
          state.broken ??= rbErr as Error;
        }
        throw err;
      }
      state.done = true;
      try {
        await client.query('COMMIT');
      } catch (err) {
        // a server error (e.g. 40001 at commit) ends the transaction cleanly; anything without a SQLSTATE
        // (connection loss, protocol failure) leaves the connection in an unknown state
        if (!(err as { code?: unknown }).code) state.broken ??= err as Error;
        throw err;
      }
      return result;
    } finally {
      state.done = true;
      client.removeListener('error', onError);
      client.release(state.broken);
    }
  }

  /** True when called from inside a transaction on this driver. */
  get inTransaction(): boolean {
    const s = this.scope.getStore();
    return !!s && s.driver === this && !s.state.done;
  }

  /**
   * LISTEN on `channel` over a dedicated connection (outside the pool). The connection is re-established
   * after errors with backoff; notifications sent while it is down are lost (NOTIFY is not durable).
   */
  async listen(channel: string, onPayload: (payload: string) => void, opts: { onReconnect?: () => void } = {}): Promise<() => Promise<void>> {
    if (!CHANNEL_RE.test(channel)) throw new Error(`Invalid channel name '${channel}'`);
    const l = new PgListener(this.clientConfig, channel, onPayload, opts.onReconnect);
    await l.start();
    this.listeners.add(l);
    return async () => {
      this.listeners.delete(l);
      await l.stop();
    };
  }

  /**
   * Cross-process schema mutex for this database: a session advisory lock held on a dedicated connection
   * (outside the pool, so `fn` can still use every pooled connection) for the duration of `fn`.
   * - Re-entrant within the async context of `fn` while the lock is held (tenant bootstrap -> pending
   *   module upgrades); work that outlives `fn` (background promises) takes the lock again.
   * - Waits at most `schemaLockTimeoutMs` (ConcurrencyError).
   * - If the lock connection is lost while `fn` runs, another process may have taken the lock: the call
   *   fails with EngineError once `fn` returns. What `fn` already committed stays committed (schema
   *   changes re-read the database), but the caller must not assume exclusivity and should reload.
   */
  async withSchemaLock<T>(fn: () => Promise<T>): Promise<T> {
    const outer = this.schemaHeld.getStore();
    if (outer && !outer.released) return fn();
    const scope: SchemaScope = { released: false };
    let lost: Error | undefined;
    const c = new Client(this.clientConfig);
    c.on('error', (e) => { lost ??= e; });
    c.on('end', () => { if (!scope.released) lost ??= new Error('connection ended'); });
    await c.connect();
    try {
      try {
        await c.query(`SELECT set_config('lock_timeout', $1, false)`, [`${Math.max(1, Math.trunc(this.schemaLockTimeoutMs))}ms`]);
        await c.query(`SELECT pg_advisory_lock(hashtext('nx.schema'))`);
      } catch (err) {
        if ((err as { code?: string }).code === '55P03') throw new ConcurrencyError('Another schema change is in progress on this tenant; try again');
        throw err;
      }
      const result = await this.schemaHeld.run(scope, fn);
      if (!lost) await c.query('SELECT 1').catch((e: Error) => { lost ??= e; });
      if (lost) throw new EngineError('Lost the schema lock connection during a schema change; reload the tenant and retry');
      return result;
    } finally {
      scope.released = true;
      await c.end().catch(() => undefined); // ending the session releases the lock
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.listeners].map((l) => l.stop()));
    this.listeners.clear();
    await this.pool.end();
  }
}

/** One dedicated LISTEN connection with automatic reconnection. */
class PgListener {
  private client: Client | undefined;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private delay = 100;
  private started = false;

  constructor(
    private readonly config: ClientConfig, private readonly channel: string, private readonly onPayload: (p: string) => void,
    private readonly onReconnect?: () => void,
  ) {}

  async start(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    const client = new Client(this.config);
    client.on('notification', (n) => {
      if (n.channel === this.channel) this.onPayload(n.payload ?? '');
    });
    const lost = (): void => {
      if (this.client !== client) return;
      this.client = undefined;
      client.end().catch(() => undefined);
      this.schedule();
    };
    client.on('error', lost);
    client.on('end', lost);
    try {
      await client.connect();
      await client.query(`LISTEN ${this.channel}`);
    } catch (err) {
      client.removeAllListeners('end');
      client.on('error', () => undefined);
      await client.end().catch(() => undefined);
      throw err;
    }
    if (this.stopped) {
      await client.end().catch(() => undefined);
      return;
    }
    this.client = client;
    this.delay = 100;
    if (this.started) {
      try { this.onReconnect?.(); } catch { /* a subscriber failure must not break the listener */ }
    }
    this.started = true;
  }

  private schedule(): void {
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      this.connect().catch(() => {
        this.delay = Math.min(this.delay * 2, 5_000);
        this.schedule();
      });
    }, this.delay);
    this.retry.unref?.();
  }

  /** test hook / diagnostics: whether the LISTEN connection is currently up */
  get connected(): boolean { return !!this.client; }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = undefined;
    const c = this.client;
    this.client = undefined;
    if (c) {
      c.on('error', () => undefined);
      await c.end().catch(() => undefined);
    }
  }
}
