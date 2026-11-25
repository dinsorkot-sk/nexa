import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConcurrencyError, ModuleCatalog, PgliteTenantManager, baseModule, type ModuleManifest } from '../src/index.js';

// Vitest runs each test file in its own forked process, so changing the process time zone here
// cannot leak into other files. Node re-reads process.env.TZ on assignment (also on Windows).
const ORIGINAL_TZ = process.env.TZ;

const tsModule: ModuleManifest = {
  name: 'ts_test', version: '1.0.0', depends: ['base'],
  models: [{ name: 'ts.event', origin: 'module', fields: { name: { type: 'char' }, at: { type: 'datetime' }, day: { type: 'date' } } }],
};

const catalog = () => new ModuleCatalog([baseModule, tsModule]);

async function columnTypes(manager: PgliteTenantManager, tenant: string): Promise<Map<string, string>> {
  const h = await manager.open(tenant);
  const rows = await h.driver.query<{ k: string; data_type: string }>({
    text: `SELECT table_name || '.' || column_name AS k, data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND data_type LIKE 'timestamp%'`, params: [],
  });
  return new Map(rows.map((r) => [r.k, r.data_type]));
}

for (const zone of ['Asia/Bangkok', 'America/New_York']) {
  describe(`timestamps with host TZ=${zone}`, () => {
    let manager: PgliteTenantManager;
    beforeAll(async () => {
      process.env.TZ = zone;
      manager = new PgliteTenantManager({ catalog: catalog() });
      await manager.create('tz', ['ts_test']);
    }, 120_000);
    afterAll(async () => {
      await manager?.closeAll();
      if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ;
    });

    it('really runs in a non-UTC host zone', () => {
      expect(new Date('2026-06-01T00:00:00Z').getTimezoneOffset()).not.toBe(0);
    });

    it('pins the session TimeZone to UTC and stores every timestamp column as timestamptz', async () => {
      const h = await manager.open('tz');
      expect((await h.driver.query<{ TimeZone: string }>({ text: 'SHOW TimeZone', params: [] }))[0]!.TimeZone).toBe('UTC');
      const types = await columnTypes(manager, 'tz');
      for (const k of ['ts_event.create_date', 'ts_event.write_date', 'ts_event.at', 'res_partner.write_date', 'nx_model.create_date', 'nx_field.create_date', 'nx_model_mixin.create_date', 'nx_module.install_date']) {
        expect(types.get(k), k).toBe('timestamp with time zone');
      }
      expect([...types].filter(([, t]) => t !== 'timestamp with time zone')).toEqual([]);
    });

    it('round-trips datetimes and magic dates as the same UTC instants', async () => {
      const h = await manager.open('tz');
      const env = h.env({ uid: 1 });
      const before = Date.now();
      const [id] = (await env.model('ts.event').create({ name: 'e', at: '2026-01-02T03:04:05.678Z' })).ids;
      const after = Date.now();
      const [row] = await env.model('ts.event').browse(id!).read(['at', 'create_date', 'write_date']);
      expect((row!.at as Date).toISOString()).toBe('2026-01-02T03:04:05.678Z');
      // magic dates are now(): within the create call, not shifted by the host offset
      for (const k of ['create_date', 'write_date'] as const) {
        const t = (row![k] as Date).getTime();
        expect(t).toBeGreaterThanOrEqual(before - 1000);
        expect(t).toBeLessThanOrEqual(after + 1000);
      }
      // API serialization (JSON) is UTC ISO with Z
      expect(JSON.parse(JSON.stringify(row)).at).toBe('2026-01-02T03:04:05.678Z');
      // naive input strings are UTC (session zone), offsets are honoured
      await env.model('ts.event').browse(id!).write({ at: '2026-01-02 10:00:00' });
      expect(((await env.model('ts.event').browse(id!).read(['at']))[0]!.at as Date).toISOString()).toBe('2026-01-02T10:00:00.000Z');
      await env.model('ts.event').browse(id!).write({ at: '2026-01-02T10:00:00+07:00' });
      expect(((await env.model('ts.event').browse(id!).read(['at']))[0]!.at as Date).toISOString()).toBe('2026-01-02T03:00:00.000Z');
      expect((await env.model('ts.event').search([['at', '=', '2026-01-02T03:00:00Z']])).ids).toEqual([id]);
    });

    it('accepts write_date from read() for the optimistic check (no host offset)', async () => {
      const env = (await manager.open('tz')).env({ uid: 1 });
      const [id] = (await env.model('ts.event').create({ name: 'occ' })).ids;
      const E = env.model('ts.event').browse(id!);
      const [r] = await E.read(['write_date']);
      const stamp = r!.write_date as Date;
      await E.write({ name: 'mine' }, { checkWriteDate: { [id!]: stamp } });
      await expect(E.write({ name: 'stale' }, { checkWriteDate: { [id!]: stamp.toISOString() } })).rejects.toThrow(ConcurrencyError);
      const [r2] = await E.read(['write_date']);
      // the same instant expressed with a non-UTC offset matches too
      const iso = (r2!.write_date as Date).toISOString();
      const shifted = new Date((r2!.write_date as Date).getTime() + 7 * 3600_000).toISOString().replace('Z', '+07:00');
      await E.write({ name: 'offset' }, { checkWriteDate: { [id!]: shifted } });
      await expect(E.write({ name: 'x' }, { checkWriteDate: { [id!]: iso } })).rejects.toThrow(ConcurrencyError);
    });

    it('groups dates and datetimes into UTC buckets returned as instants', async () => {
      const env = (await manager.open('tz')).env({ uid: 1 });
      const events = env.model('ts.event');
      await events.create([
        { name: 'g', at: '2026-03-31T23:30:00Z', day: '2026-03-31' },
        { name: 'g', at: '2026-04-01T00:30:00Z', day: '2026-04-01' },
      ]);
      for (const bucket of ['at:month', 'day:month']) {
        const groups = await events.readGroup([['name', '=', 'g']], [bucket], []);
        expect(groups.map((g) => (g[bucket] as Date).toISOString())).toEqual(['2026-03-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z']);
      }
    });
  });
}

describe('upgrade from naive timestamp columns', () => {
  let dir: string;
  beforeAll(async () => { process.env.TZ = 'Asia/Bangkok'; dir = await mkdtemp(join(tmpdir(), 'nx-ts-')); });
  afterAll(async () => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ;
    await rm(dir, { recursive: true, force: true });
  });

  it('converts naive (UTC wall clock) columns to timestamptz keeping the same instants', async () => {
    const v1 = new PgliteTenantManager({ rootDir: dir, catalog: catalog() });
    const h = await v1.create('old', ['ts_test']);
    const [id] = (await h.env({ uid: 1 }).model('ts.event').create({ name: 'old', at: '2026-01-02T03:04:05.123456Z' })).ids;
    // recreate the pre-T26b layout: magic dates and nx_* dates as naive TIMESTAMP holding UTC wall clock
    const naive: [string, string][] = [
      ['ts_event', 'create_date'], ['ts_event', 'write_date'], ['ts_event', 'at'], ['res_partner', 'write_date'],
      ['nx_model', 'create_date'], ['nx_field', 'create_date'], ['nx_model_mixin', 'create_date'], ['nx_module', 'install_date'],
    ];
    for (const [t, c] of naive) {
      await h.driver.query({ text: `ALTER TABLE ${t} ALTER COLUMN ${c} TYPE TIMESTAMP WITHOUT TIME ZONE USING ${c} AT TIME ZONE 'UTC'`, params: [] });
    }
    await h.driver.query({ text: `UPDATE ts_event SET write_date = '2026-05-06 07:08:09.654321', create_date = '2026-05-06 07:00:00' WHERE id = $1`, params: [id] });
    const [installed] = await h.driver.query<{ v: string }>({ text: `SELECT install_date::text AS v FROM nx_module WHERE name = 'ts_test'`, params: [] });
    await v1.closeAll();

    const v2 = new PgliteTenantManager({ rootDir: dir, catalog: catalog() });
    try {
      const types = await columnTypes(v2, 'old');
      for (const [t, c] of naive) expect(types.get(`${t}.${c}`), `${t}.${c}`).toBe('timestamp with time zone');
      const h2 = await v2.open('old');
      const [raw] = await h2.driver.query<{ w: string; a: string; c: string }>({
        text: `SELECT write_date::text AS w, at::text AS a, create_date::text AS c FROM ts_event WHERE id = $1`, params: [id],
      });
      expect(raw).toEqual({ w: '2026-05-06 07:08:09.654321+00', a: '2026-01-02 03:04:05.123456+00', c: '2026-05-06 07:00:00+00' });
      const [mod] = await h2.driver.query<{ v: string }>({ text: `SELECT (install_date AT TIME ZONE 'UTC')::text AS v FROM nx_module WHERE name = 'ts_test'`, params: [] });
      expect(mod!.v).toBe(installed!.v);
      const env = h2.env({ uid: 1 });
      const [row] = await env.model('ts.event').browse(id!).read(['write_date', 'at']);
      expect((row!.write_date as Date).toISOString()).toBe('2026-05-06T07:08:09.654Z');
      expect((row!.at as Date).toISOString()).toBe('2026-01-02T03:04:05.123Z');
      await env.model('ts.event').browse(id!).write({ name: 'new' }, { checkWriteDate: { [id!]: '2026-05-06T07:08:09.654321Z' } });
    } finally {
      await v2.closeAll();
    }
  }, 120_000);
});
