import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModuleCatalog, baseModule, type Env, type ModuleManifest, type TenantHandle } from '../../src/index.js';
import type { PgTenantManager } from '../../src/tenant/pg.js';
import { RECORDS_MODULE } from '../../src/security/records.js';
import { gate, pgManager, pgUrl, settledWithin } from './helpers.js';

const pgModule: ModuleManifest = {
  name: 'pg_secr', version: '1.0.0', depends: ['base'],
  models: [
    { name: 'pg.secr.a', origin: 'module', fields: { name: { type: 'char' } } },
    { name: 'pg.secr.b', origin: 'module', fields: { name: { type: 'char' } } },
  ],
};

describe.skipIf(!pgUrl)('real PostgreSQL: ir.model.access / ir.rule resync under concurrency', () => {
  let manager: PgTenantManager;
  let h: TenantHandle;
  let adminUid: number;
  let userGroup: number;
  const admin = (): Env => h.env({ uid: adminUid });

  beforeAll(async () => {
    manager = pgManager({ catalog: new ModuleCatalog([baseModule, pgModule]) });
    h = await manager.create('secr', ['pg_secr']);
    const ref = async (name: string) => (await h.driver.query<{ res_id: number }>({
      text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name=$1`, params: [name],
    }))[0]!.res_id;
    adminUid = await ref('user_admin');
    userGroup = await ref('group_user');
  });
  afterAll(async () => { await manager?.closeAll(); });

  async function expectRuntimeMatchesRecords(): Promise<void> {
    const access = await h.driver.query<{ model: string; perm_read: boolean; perm_write: boolean }>({
      text: `SELECT model, perm_read, perm_write FROM nx_access WHERE module = $1 ORDER BY model`, params: [RECORDS_MODULE],
    });
    const activeAccess = await h.driver.query<{ model: string; perm_read: boolean; perm_write: boolean }>({
      text: `SELECT model_name AS model, perm_read, perm_write FROM ir_model_access WHERE active ORDER BY model_name`, params: [],
    });
    expect(access).toEqual(activeAccess);
    const rules = await h.driver.query<{ name: string }>({ text: `SELECT name FROM nx_rule WHERE module = $1 ORDER BY name`, params: [RECORDS_MODULE] });
    const activeRules = await h.driver.query<{ name: string }>({ text: `SELECT 'ir.rule.' || id AS name FROM ir_rule WHERE active ORDER BY 1`, params: [] });
    expect(rules).toEqual(activeRules);
  }

  it('a revoke and a concurrent edit by two admins leave exactly the active rows', async () => {
    const [a] = (await admin().model('ir.model.access').create({ name: 'a', model_name: 'pg.secr.a', group_id: userGroup, perm_read: true })).ids;
    const [b] = (await admin().model('ir.model.access').create({ name: 'b', model_name: 'pg.secr.b', group_id: userGroup, perm_read: true })).ids;
    const [r1] = (await admin().model('ir.rule').create({ name: 'r1', model_name: 'pg.secr.a', domain_force: '[]' })).ids;
    await expectRuntimeMatchesRecords();

    const hold = gate();
    const revoked = gate();
    const txA = admin().transaction(async (tx) => {
      await tx.model('ir.model.access').browse([a!]).write({ active: false });
      await tx.model('ir.rule').browse([r1!]).unlink();
      revoked.open();
      await hold.wait; // A holds the sync lock, uncommitted
    });
    await revoked.wait;
    const txB = admin().transaction(async (tx) => {
      await tx.model('ir.model.access').browse([b!]).write({ perm_write: true });
      await tx.model('ir.rule').create({ name: 'r2', model_name: 'pg.secr.b', domain_force: '[]' });
    });
    expect(await settledWithin(txB, 300)).toBe('pending'); // B's resync waits for A
    hold.open();
    await Promise.all([txA, txB]);
    await expectRuntimeMatchesRecords();
    const rows = await h.driver.query<{ model: string }>({ text: `SELECT model FROM nx_access WHERE module = $1`, params: [RECORDS_MODULE] });
    expect(rows.map((r) => r.model)).toEqual(['pg.secr.b']);
  });
});
