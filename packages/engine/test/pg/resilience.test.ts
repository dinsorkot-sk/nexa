import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConcurrencyError, EngineError } from '../../src/contracts/index.js';
import { PgDriver } from '../../src/driver/pg.js';
import { gate, pgUrl, settledWithin, sleep } from './helpers.js';

const pid = async (db: PgDriver): Promise<number> =>
  (await db.query<{ pid: number }>({ text: 'SELECT pg_backend_pid() AS pid', params: [] }))[0]!.pid;

describe.skipIf(!pgUrl)('PgDriver resilience', () => {
  let db: PgDriver;
  let admin: PgDriver;
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown): void => { unhandled.push(e); };

  beforeAll(async () => {
    process.on('uncaughtException', onUnhandled);
    process.on('unhandledRejection', onUnhandled);
    db = await PgDriver.open({ connectionString: pgUrl!, max: 3 });
    admin = await PgDriver.open({ connectionString: pgUrl!, max: 2 });
  });
  afterAll(async () => {
    process.off('uncaughtException', onUnhandled);
    process.off('unhandledRejection', onUnhandled);
    await db?.close();
    await admin?.close();
  });

  const kill = (p: number) => admin.query({ text: 'SELECT pg_terminate_backend($1)', params: [p] });

  it('a backend killed mid-transaction rejects the transaction, destroys the client, keeps the pool usable', async () => {
    let killed = 0;
    await expect(db.transaction(async () => {
      killed = await pid(db);
      await kill(killed);
      await sleep(100); // the 'error' event arrives while the callback awaits
      await db.query({ text: 'SELECT 1', params: [] });
    })).rejects.toThrow();
    // every later connection is a fresh backend: the dead client never went back to the pool
    const pids = await Promise.all(Array.from({ length: 3 }, () => db.transaction(async () => {
      const p = await pid(db);
      await sleep(30);
      return p;
    })));
    expect(pids).not.toContain(killed);
    expect(unhandled).toEqual([]);
  });

  it('a failing ROLLBACK TO SAVEPOINT does not mask the original error', async () => {
    const original = new Error('original failure');
    await expect(db.transaction(async () => {
      const p = await pid(db);
      await db.transaction(async () => {
        await kill(p);
        await sleep(100);
        throw original;
      });
    })).rejects.toBe(original);
    expect(await db.transaction(async () => db.query({ text: 'SELECT 1 AS one', params: [] }))).toEqual([{ one: 1 }]);
    expect(unhandled).toEqual([]);
  });

  it('pool checkout times out instead of hanging forever', async () => {
    const small = await PgDriver.open({ connectionString: pgUrl!, max: 1, connectTimeoutMs: 300 });
    try {
      const g = gate();
      const holder = small.transaction(async () => { await g.wait; });
      await sleep(50);
      const t0 = Date.now();
      await expect(small.transaction(async () => undefined)).rejects.toThrow(/timeout/i);
      expect(Date.now() - t0).toBeLessThan(5_000);
      g.open();
      await holder;
    } finally {
      await small.close();
    }
  });

  it('schema lock: lock_timeout yields ConcurrencyError', async () => {
    const other = await PgDriver.open({ connectionString: pgUrl!, max: 1, schemaLockTimeoutMs: 200 });
    try {
      const g = gate();
      const held = gate();
      const holder = db.withSchemaLock(async () => { held.open(); await g.wait; });
      await held.wait;
      await expect(other.withSchemaLock(async () => 'never')).rejects.toBeInstanceOf(ConcurrencyError);
      g.open();
      await holder;
      expect(await other.withSchemaLock(async () => 'ok')).toBe('ok');
    } finally {
      await other.close();
    }
  });

  it('schema lock: losing the lock connection fails the run', async () => {
    await expect(db.withSchemaLock(async () => {
      const [row] = await db.query<{ pid: number }>({
        text: `SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND granted AND pid <> pg_backend_pid() AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) LIMIT 1`, params: [],
      });
      await kill(row!.pid);
      await sleep(100);
      return 'done';
    })).rejects.toBeInstanceOf(EngineError);
    expect(unhandled).toEqual([]);
  });

  it('schema lock: work that outlives the holder takes the lock again', async () => {
    const advisoryHeld = async () => (await db.query<{ n: number }>({
      text: `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`, params: [],
    }))[0]!.n;
    let background!: Promise<number>;
    await db.withSchemaLock(async () => {
      expect(await advisoryHeld()).toBe(1);
      background = sleep(100).then(() => db.withSchemaLock(advisoryHeld));
    });
    expect(await background).toBe(1); // re-locked, not running under the released outer lock
    expect(await settledWithin(db.withSchemaLock(async () => 'free'), 2_000)).toMatchObject({ ok: true, value: 'free' });
  });
});
