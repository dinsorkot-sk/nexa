import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModuleCatalog, baseModule, type Env, type ModuleManifest, type TenantHandle } from '../../src/index.js';
import type { PgTenantManager } from '../../src/tenant/pg.js';
import { TransitionService, transitionAccess, transitionModels } from '../../src/policy/transition.js';
import { gate, pgManager, pgUrl, settledWithin } from './helpers.js';

const pgModule: ModuleManifest = {
  name: 'pg_trn', version: '1.0.0', depends: ['base'],
  models: [
    ...transitionModels.filter((m) => !baseModule.models!.some((b) => b.name === m.name)),
    { name: 'pg.tmove', origin: 'module', fields: {
      name: { type: 'char' },
      state: { type: 'selection', selection: [['draft', 'Draft'], ['posted', 'Posted']], default: 'draft' },
      number: { type: 'char' },
    } },
  ],
  access: [
    ...(baseModule.models!.some((b) => b.name === 'ir.transition') ? [] : transitionAccess),
    { model: 'pg.tmove', group: 'base.group_system', perms: { read: true, write: true, create: true, unlink: true } },
  ],
};

describe.skipIf(!pgUrl)('real PostgreSQL: concurrent transitions', () => {
  let manager: PgTenantManager;
  let h: TenantHandle;
  let adminUid: number;
  const admin = (): Env => h.env({ uid: adminUid });

  beforeAll(async () => {
    manager = pgManager({ catalog: new ModuleCatalog([baseModule, pgModule]) });
    h = await manager.create('trn', ['pg_trn']);
    adminUid = (await h.driver.query<{ res_id: number }>({
      text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='user_admin'`, params: [],
    }))[0]!.res_id;
    await admin().model('ir.lifecycle').create({
      model: 'pg.tmove', state_field: 'state', initial_state: 'draft', locks: [{ states: ['posted'], writable: [] }], engine_fields: ['number'],
    });
    await admin().model('ir.sequence').create({ name: 'T', code: 'pg.t', prefix: 'T', padding: 2, implementation: 'no_gap' });
    await admin().model('ir.transition').create({
      model: 'pg.tmove', key: 'post', from: ['draft'], to: 'posted', already: 'skip',
      effects: [{ type: 'sequence', field: 'number', code: "'pg.t'" }],
    });
  }, 60_000);
  afterAll(async () => { await manager?.closeAll(); });

  it('two concurrent posts of the same record: one number, one skip', async () => {
    const id = (await admin().model('pg.tmove').create({ name: 'X' })).ids[0]!;
    const entered = gate(); const hold = gate();
    const e1 = admin();
    const first = e1.transaction(async () => {
      const r = await new TransitionService(e1).run('pg.tmove', [id], 'post');
      entered.open();
      await hold.wait;
      return r;
    });
    await entered.wait;
    const second = new TransitionService(admin()).run('pg.tmove', [id], 'post');
    expect(await settledWithin(second, 500)).toBe('pending'); // blocked on the row lock
    hold.open();
    const r1 = await first;
    const r2 = await settledWithin(second, 10_000);
    expect(r1).toEqual({ done: [id], skipped: [] });
    expect(r2).toMatchObject({ ok: true, value: { done: [], skipped: [id] } });
    const [row] = await admin().model('pg.tmove').browse(id).read(['number', 'state']);
    expect(row).toMatchObject({ state: 'posted', number: 'T01' });
    const [seq] = await admin().model('ir.sequence').search([['code', '=', 'pg.t']]).then((s) => s.read(['number_next']));
    expect(Number(seq!.number_next)).toBe(2);
  }, 40_000);
});
