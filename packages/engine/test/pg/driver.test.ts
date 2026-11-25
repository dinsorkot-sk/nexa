import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgDriver } from '../../src/driver/pg.js';
import { PgliteDriver } from '../../src/driver/pglite.js';
import { PgTenantManager } from '../../src/tenant/pg.js';
import { gate, pgUrl, settledWithin, uniquePrefix } from './helpers.js';

describe.skipIf(!pgUrl)('PgDriver', () => {
  let db: PgDriver;
  let lite: PgliteDriver;

  beforeAll(async () => {
    db = await PgDriver.open({ connectionString: pgUrl!, max: 6 });
    lite = await PgliteDriver.open();
    await db.query({ text: `DROP TABLE IF EXISTS drv_t; CREATE TABLE drv_t (id serial PRIMARY KEY, name text UNIQUE, n int)`, params: [] });
  });
  afterAll(async () => {
    await db?.close();
    await lite?.close();
  });

  it('pins session TimeZone UTC on every pooled connection', async () => {
    // hold several connections at once so the pool really opens distinct sessions
    const zones = await Promise.all(Array.from({ length: 5 }, () => db.transaction(async () => {
      const [r] = await db.query<{ tz: string; pid: number }>({ text: `SELECT current_setting('TimeZone') AS tz, pg_backend_pid() AS pid, pg_sleep(0.05)`, params: [] });
      return r!;
    })));
    expect(new Set(zones.map((z) => z.pid)).size).toBe(5);
    expect(zones.every((z) => z.tz === 'UTC')).toBe(true);
  });

  it('round-trips timestamps in UTC and returns the same JS values as PGlite', async () => {
    const at = new Date('2026-03-29T01:30:00.123Z');
    const sql = {
      text: `SELECT $1::timestamptz AS tz, $1::timestamptz::timestamp AS naive, $1::timestamptz::text AS txt, '2026-01-02'::date AS d,
        9007199254740993::int8 AS big, 42::int8 AS small, 1.50::numeric AS num, ARRAY[1,2]::int8[] AS ids, '{"a":1}'::jsonb AS j,
        true AS b, ARRAY['2026-01-02T03:04:05Z'::timestamptz] AS tzs, now()::text AS nowtxt`,
      params: [at],
    };
    const [p] = await db.query<Record<string, unknown>>(sql);
    const [l] = await lite.query<Record<string, unknown>>(sql);
    expect(p!.tz).toEqual(at);
    expect(p!.txt).toBe('2026-03-29 01:30:00.123+00');
    expect(String(p!.nowtxt)).toMatch(/\+00$/);
    delete p!.nowtxt;
    delete l!.nowtxt;
    expect(p).toEqual(l);
  });

  it('commits, rolls back and scopes nested savepoints', async () => {
    await db.query({ text: `TRUNCATE drv_t`, params: [] });
    await db.transaction(async () => {
      await db.query({ text: `INSERT INTO drv_t(name) VALUES ('a')`, params: [] });
      expect(db.inTransaction).toBe(true);
      await expect(db.transaction(async () => {
        await db.query({ text: `INSERT INTO drv_t(name) VALUES ('b')`, params: [] });
        throw new Error('inner');
      })).rejects.toThrow('inner');
      await db.transaction(async () => { await db.query({ text: `INSERT INTO drv_t(name) VALUES ('c')`, params: [] }); });
    });
    expect(db.inTransaction).toBe(false);
    await expect(db.transaction(async () => {
      await db.query({ text: `INSERT INTO drv_t(name) VALUES ('d')`, params: [] });
      throw new Error('outer');
    })).rejects.toThrow('outer');
    const rows = await db.query<{ name: string }>({ text: `SELECT name FROM drv_t ORDER BY name`, params: [] });
    expect(rows.map((r) => r.name)).toEqual(['a', 'c']);
  });

  it('keeps uncommitted writes invisible to other connections', async () => {
    await db.query({ text: `TRUNCATE drv_t`, params: [] });
    const g = gate();
    const tx = db.transaction(async () => {
      await db.query({ text: `INSERT INTO drv_t(name) VALUES ('x')`, params: [] });
      await g.wait;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.query({ text: `SELECT * FROM drv_t`, params: [] })).toHaveLength(0);
    g.open();
    await tx;
    expect(await db.query({ text: `SELECT * FROM drv_t`, params: [] })).toHaveLength(1);
  });

  it('preserves SQLSTATE codes', async () => {
    await db.query({ text: `TRUNCATE drv_t`, params: [] });
    await db.query({ text: `INSERT INTO drv_t(name) VALUES ('u')`, params: [] });
    await expect(db.query({ text: `INSERT INTO drv_t(name) VALUES ($1)`, params: ['u'] })).rejects.toMatchObject({ code: '23505' });
    await expect(db.query({ text: `SELECT * FROM no_such_table`, params: [] })).rejects.toMatchObject({ code: '42P01' });
  });

  it('rejects a query from a dangling promise after its transaction ended', async () => {
    // a promise started inside the transaction that only queries after the commit (still in its async context)
    let late!: Promise<unknown>;
    await db.transaction(async () => {
      late = new Promise((r) => setTimeout(r, 50)).then(() => db.query({ text: 'SELECT 1', params: [] }));
      late.catch(() => undefined);
    });
    await expect(late).rejects.toThrow(/after its transaction ended/);
  });

  it('returns pool clients after failures (no leak)', async () => {
    for (let i = 0; i < 20; i++) {
      await expect(db.transaction(async () => { await db.query({ text: 'SELECT 1/0', params: [] }); })).rejects.toMatchObject({ code: '22012' });
    }
    const outcome = await settledWithin(db.transaction(async () => db.query({ text: 'SELECT 1 AS one', params: [] })), 2_000);
    expect(outcome).toMatchObject({ ok: true });
  });

  it('LISTEN reconnects after its connection is killed', async () => {
    const got: string[] = [];
    const stop = await db.listen('drv_chan', (p) => got.push(p));
    try {
      await db.query({ text: `SELECT pg_notify('drv_chan', 'one')`, params: [] });
      await expect.poll(() => got).toEqual(['one']);
      await db.query({
        text: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query = 'LISTEN drv_chan' AND pid <> pg_backend_pid()`, params: [],
      });
      await expect.poll(async () => {
        await db.query({ text: `SELECT pg_notify('drv_chan', 'two')`, params: [] });
        return got.includes('two');
      }, { timeout: 10_000, interval: 200 }).toBe(true);
    } finally {
      await stop();
    }
  });
});

describe.skipIf(!pgUrl)('PgTenantManager', () => {
  it('creates one database per tenant, lists them and rejects unsafe names', async () => {
    const prefix = uniquePrefix();
    const m = new PgTenantManager({ url: pgUrl!, dbPrefix: prefix, poolMax: 2 });
    try {
      const a = await m.open('acme-1');
      await m.open('beta');
      expect(await m.list()).toEqual(['acme-1', 'beta']);
      const [r] = await a.driver.query<{ db: string }>({ text: 'SELECT current_database() AS db', params: [] });
      expect(r!.db).toBe(`${prefix}acme-1`);
      await expect(m.open('Bad"Name')).rejects.toThrow(/Invalid tenant/);
      await expect(m.open('x'.repeat(60))).rejects.toThrow(/too long/);
      expect(() => new PgTenantManager({ url: pgUrl!, dbPrefix: 'bad-prefix' })).toThrow(/prefix/);
      // concurrent first opens from two managers both succeed on one database
      const m2 = new PgTenantManager({ url: pgUrl!, dbPrefix: prefix, poolMax: 2 });
      const m3 = new PgTenantManager({ url: pgUrl!, dbPrefix: prefix, poolMax: 2 });
      try {
        await Promise.all([m2.open('gamma'), m3.open('gamma')]);
      } finally {
        await m2.closeAll();
        await m3.closeAll();
      }
    } finally {
      await m.closeAll();
    }
  });
});
