import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModuleCatalog, baseModule, type Env, type EnvImpl, type ModuleManifest, type TenantHandle } from '../../src/index.js';
import type { PgTenantManager } from '../../src/tenant/pg.js';
import { DateLockError } from '../../src/policy/index.js';
import { withWriteToken } from '../../src/policy/token.js';
import { gate, pgManager, pgUrl, settledWithin } from './helpers.js';

const pgModule: ModuleManifest = {
  name: 'pg_date', version: '1.0.0', depends: ['base'],
  models: [{ name: 'pg.dated', origin: 'module', fields: {
    name: { type: 'char' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['posted', 'Posted']], default: 'draft' },
    event_date: { type: 'date' },
    hard_date: { type: 'date' },
    floor: { type: 'integer', ratchet: 'up' },
  } }],
};

describe.skipIf(!pgUrl)('real PostgreSQL: date locks', () => {
  let manager: PgTenantManager;
  let h: TenantHandle;
  const env = (): Env => h.env({ uid: 1 });

  beforeAll(async () => {
    manager = pgManager({ catalog: new ModuleCatalog([baseModule, pgModule]) });
    h = await manager.create('date', ['pg_date']);
    await env().model('ir.date.lock').create({
      model: 'pg.dated', date: 'event_date', when: "state == 'posted'", hard: 'hard_date',
    });
  });
  afterAll(async () => { await manager?.closeAll(); });

  it('enforces hard dates for create, both old and new write values, and unlink', async () => {
    const row = { name: 'locked', state: 'posted', event_date: '2025-12-31', hard_date: '2025-12-31' };
    await expect(env().model('pg.dated').create(row)).rejects.toBeInstanceOf(DateLockError);

    const id = (await env().model('pg.dated').create({ ...row, event_date: '2026-01-01' })).ids[0]!;
    await expect(env().model('pg.dated').browse(id).write({ name: 'changed' })).resolves.toBeUndefined();
    // The pre-state is checked, so moving a locked record forward cannot evade its period lock.
    await expect(env().model('pg.dated').browse(id).write({ event_date: '2026-01-02' })).resolves.toBeUndefined();
    const lockedId = (await env().model('pg.dated').create({ ...row, event_date: '2026-01-01' })).ids[0]!;
    await expect(env().model('pg.dated').browse(lockedId).write({ event_date: '2025-12-31' })).rejects.toBeInstanceOf(DateLockError);
    // Seed an already-locked historical row as if it predated installation of the policy.
    await h.driver.query({ text: 'UPDATE pg_dated SET event_date = $1 WHERE id = $2', params: ['2025-12-31', lockedId] });
    await expect(env().model('pg.dated').browse(lockedId).unlink()).rejects.toBeInstanceOf(DateLockError);
  });

  it('hard lock still refuses a superuser write token used by a transition', async () => {
    const id = (await env().model('pg.dated').create({
      name: 'before period lock', state: 'draft', event_date: '2025-12-31', hard_date: '2025-12-31',
    })).ids[0]!;
    const e = env();
    await expect(e.transaction(() => withWriteToken(e as EnvImpl,
      { op: 'write', model: 'pg.dated', ids: [id], fields: ['state'] },
      () => e.model('pg.dated').browse(id).write({ state: 'posted' })),
    )).rejects.toBeInstanceOf(DateLockError);
    expect((await env().model('pg.dated').browse(id).read(['state']))[0]!.state).toBe('draft');
  });

  it('serializes concurrent ratchet writes and checks against the newly committed floor', async () => {
    const id = (await env().model('pg.dated').create({ name: 'ratchet', floor: 1 })).ids[0]!;
    const entered = gate(); const hold = gate();
    const firstEnv = env();
    const first = firstEnv.transaction(async () => {
      await firstEnv.model('pg.dated').browse(id).write({ floor: 10 });
      entered.open();
      await hold.wait;
    });
    await entered.wait;

    const second = env().model('pg.dated').browse(id).write({ floor: 5 });
    expect(await settledWithin(second, 400)).toBe('pending');
    hold.open();
    await first;
    const result = await settledWithin(second, 5_000);
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: unknown }).error).toBeInstanceOf(DateLockError);
    expect((await env().model('pg.dated').browse(id).read(['floor']))[0]!.floor).toBe(10);
  }, 30_000);
});
