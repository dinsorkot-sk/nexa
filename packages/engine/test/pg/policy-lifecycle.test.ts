import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModuleCatalog, baseModule, type Env, type EnvImpl, type ModuleManifest, type TenantHandle } from '../../src/index.js';
import type { PgTenantManager } from '../../src/tenant/pg.js';
import { LifecycleError } from '../../src/policy/index.js';
import { withWriteToken } from '../../src/policy/token.js';
import { gate, pgManager, pgUrl, settledWithin, uniquePrefix } from './helpers.js';

const pgModule: ModuleManifest = {
  name: 'pg_pol', version: '1.0.0', depends: ['base'],
  models: [
    { name: 'pg.pdoc', origin: 'module', fields: {
      name: { type: 'char' },
      state: { type: 'selection', selection: [['draft', 'Draft'], ['posted', 'Posted']], default: 'draft' },
      line_ids: { type: 'one2many', comodel: 'pg.pline', inverseName: 'doc_id' },
      total: {
        type: 'integer', store: true, depends: ['line_ids.qty'],
        compute: async (records) => {
          const out = new Map<number, number>();
          for (const r of await records.read(['line_ids'])) {
            const ids = r.line_ids as number[];
            const lines = ids.length ? await records.env.model('pg.pline').browse(ids).read(['qty']) : [];
            out.set(r.id as number, lines.reduce((a, l) => a + (l.qty as number), 0));
          }
          return out;
        },
      },
    } },
    { name: 'pg.pnote', origin: 'module', fields: {
      name: { type: 'char' },
      state: { type: 'selection', selection: [['open', 'Open'], ['closed', 'Closed']], default: 'open' },
    } },
    { name: 'pg.pline', origin: 'module', fields: {
      doc_id: { type: 'many2one', comodel: 'pg.pdoc', ondelete: 'cascade' },
      qty: { type: 'integer', default: 1 },
    } },
  ],
};

describe.skipIf(!pgUrl)('real PostgreSQL: frozen children vs a concurrent parent lock', () => {
  const prefix = uniquePrefix();
  let manager: PgTenantManager;
  let manager2: PgTenantManager;
  let h: TenantHandle;
  let adminUid: number;
  const admin = (): Env => h.env({ uid: adminUid });
  const env = (): Env => h.env({ uid: 1 });

  beforeAll(async () => {
    manager = pgManager({ catalog: new ModuleCatalog([baseModule, pgModule]), dbPrefix: prefix });
    manager2 = pgManager({ catalog: new ModuleCatalog([baseModule, pgModule]), dbPrefix: prefix });
    h = await manager.create('pol', ['pg_pol']);
    adminUid = (await h.driver.query<{ res_id: number }>({
      text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='user_admin'`, params: [],
    }))[0]!.res_id;
    await admin().model('ir.lifecycle').create({
      model: 'pg.pdoc', state_field: 'state', initial_state: 'draft',
      locks: [{ states: ['posted'], writable: [], frozen_children: ['line_ids'] }],
    });
  });
  afterAll(async () => { await manager2?.closeAll(); await manager?.closeAll(); });

  async function fixture(): Promise<{ doc: number; line: number }> {
    const doc = (await env().model('pg.pdoc').create({ name: 'D', line_ids: [{ op: 'create', values: { qty: 1 } }] })).ids[0]!;
    const line = (await env().model('pg.pline').search([['doc_id', '=', doc]])).ids[0]!;
    return { doc, line };
  }
  /** A transition: state change under a token, left uncommitted until `hold` opens. */
  function transition(doc: number, entered: ReturnType<typeof gate>, hold: ReturnType<typeof gate>): Promise<void> {
    const e = env();
    return e.transaction(async () => {
      await withWriteToken(e as EnvImpl, { op: 'write', model: 'pg.pdoc', ids: [doc], fields: ['state'] },
        () => e.model('pg.pdoc').browse(doc).write({ state: 'posted' }));
      entered.open();
      await hold.wait;
    });
  }
  const qty = async (line: number) => (await env().model('pg.pline').browse(line).read(['qty']))[0]!.qty;

  it('a child write waits for the parent lock transition and is then refused', async () => {
    const { doc, line } = await fixture();
    const entered = gate(); const hold = gate();
    const tx = transition(doc, entered, hold);
    await entered.wait;
    const child = env().model('pg.pline').browse(line).write({ qty: 9 });
    expect(await settledWithin(child, 400)).toBe('pending'); // blocked on the parent's row lock, not slipping through
    hold.open();
    await tx;
    const result = await settledWithin(child, 5_000);
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: unknown }).error).toBeInstanceOf(LifecycleError);
    expect(await qty(line)).toBe(1);
  }, 30_000);

  it('a child create and unlink also wait and are refused', async () => {
    const { doc, line } = await fixture();
    const entered = gate(); const hold = gate();
    const tx = transition(doc, entered, hold);
    await entered.wait;
    const create = env().model('pg.pline').create({ doc_id: doc, qty: 5 });
    const unlink = env().model('pg.pline').browse(line).unlink();
    expect(await settledWithin(create, 400)).toBe('pending');
    expect(await settledWithin(unlink, 50)).toBe('pending');
    hold.open();
    await tx;
    for (const op of [create, unlink]) {
      const r = await settledWithin(op, 5_000);
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: unknown }).error).toBeInstanceOf(LifecycleError);
    }
    expect(await env().model('pg.pline').search([['doc_id', '=', doc]])).toHaveProperty('ids', [line]);
  }, 30_000);

  it('a child write in flight makes the parent lock transition wait, then both complete consistently', async () => {
    const { doc, line } = await fixture();
    const entered = gate(); const hold = gate();
    const e = env();
    const childTx = e.transaction(async () => {
      await e.model('pg.pline').browse(line).write({ qty: 7 });
      entered.open();
      await hold.wait;
    });
    await entered.wait;
    const t2 = gate(); const t2hold = gate(); t2hold.open();
    const parent = transition(doc, t2, t2hold);
    expect(await settledWithin(parent, 400)).toBe('pending'); // transition waits for the child's FOR SHARE
    hold.open();
    await childTx;
    expect(await settledWithin(parent, 5_000)).toMatchObject({ ok: true });
    expect(await qty(line)).toBe(7);
    expect((await env().model('pg.pdoc').browse(doc).read(['state']))[0]!.state).toBe('posted');
    await expect(env().model('pg.pline').browse(line).write({ qty: 8 })).rejects.toBeInstanceOf(LifecycleError);
  }, 30_000);

  it('no write slips into a locked parent when many children race a transition', async () => {
    const { doc, line } = await fixture();
    const entered = gate(); const hold = gate();
    const tx = transition(doc, entered, hold);
    await entered.wait;
    const writers = Array.from({ length: 4 }, (_, i) => env().model('pg.pline').browse(line).write({ qty: 100 + i }));
    const settled = writers.map((w) => settledWithin(w, 10_000));
    hold.open();
    await tx;
    const results = await Promise.all(settled);
    for (const r of results) expect(r).toMatchObject({ ok: false });
    expect(await qty(line)).toBe(1);
  }, 30_000);

  it('two concurrent line edits of one document with a stored total never deadlock', async () => {
    for (let round = 0; round < 5; round++) {
      const doc = (await env().model('pg.pdoc').create({ name: 'T', line_ids: [
        { op: 'create', values: { qty: 1 } }, { op: 'create', values: { qty: 1 } },
      ] })).ids[0]!;
      const [l1, l2] = (await env().model('pg.pline').search([['doc_id', '=', doc]], { order: 'id' })).ids as [number, number];
      const results = await Promise.all([
        settledWithin(env().model('pg.pline').browse(l1).write({ qty: 10 + round }), 15_000),
        settledWithin(env().model('pg.pline').browse(l2).write({ qty: 20 + round }), 15_000),
      ]);
      for (const r of results) expect(r).toMatchObject({ ok: true });
      expect((await env().model('pg.pdoc').browse(doc).read(['total']))[0]!.total).toBe(30 + 2 * round);
    }
  }, 60_000);

  describe('policy cache across connections and processes', () => {
    const note = async (): Promise<number> => (await env().model('pg.pnote').create({ name: 'n' })).ids[0]!;
    const policy = { model: 'pg.pnote', state_field: 'state', initial_state: 'open', locks: [{ states: ['closed'], writable: [] }] };
    const close = async (id: number): Promise<void> => {
      const e = env();
      await e.transaction(() => withWriteToken(e as EnvImpl, { op: 'write', model: 'pg.pnote', ids: [id], fields: ['state'] },
        () => e.model('pg.pnote').browse(id).write({ state: 'closed' })));
    };

    it('an uncommitted policy is not cached by other connections; its commit applies at once', async () => {
      const id = await note();
      const entered = gate(); const hold = gate();
      const a = admin();
      const tx = a.transaction(async () => {
        await a.model('ir.lifecycle').create(policy);
        entered.open();
        await hold.wait;
      });
      await entered.wait;
      // other connection: sees the committed (policy-free) state, builds an index and must not cache it
      await env().model('pg.pnote').browse(id).write({ name: 'before commit' });
      await env().model('pg.pnote').browse(id).write({ name: 'still before commit' });
      hold.open();
      await tx;
      await close(id);
      await expect(env().model('pg.pnote').browse(id).write({ name: 'after commit' })).rejects.toBeInstanceOf(LifecycleError);
      await admin().model('ir.lifecycle').browse((await admin().model('ir.lifecycle').search([['model', '=', 'pg.pnote']])).ids).unlink();
    }, 30_000);

    it('a rolled-back policy never lingers on other connections', async () => {
      const id = await note();
      const entered = gate(); const hold = gate();
      const a = admin();
      const tx = a.transaction(async () => {
        await a.model('ir.lifecycle').create(policy);
        entered.open();
        await hold.wait;
        throw new Error('rollback');
      });
      const settled = settledWithin(tx, 15_000);
      await entered.wait;
      await env().model('pg.pnote').browse(id).write({ name: 'x' });
      hold.open();
      expect(await settled).toMatchObject({ ok: false });
      await close(id).catch(() => undefined);
      await env().model('pg.pnote').browse(id).write({ state: 'open', name: 'free, nothing locked' });
    }, 30_000);

    it('another process (separate manager and registry) editing ir.lifecycle is noticed', async () => {
      const id = await note();
      const h2 = await manager2.open('pol');
      const e2 = h2.env({ uid: 1 });
      await e2.model('pg.pnote').browse(id).write({ name: 'warms the second process cache' });
      await close(id).catch(() => undefined);
      await e2.model('pg.pnote').browse(id).write({ name: 'no policy yet' });
      await admin().model('ir.lifecycle').create(policy); // first process
      await close(id);
      await expect(e2.model('pg.pnote').browse(id).write({ name: 'second process must now refuse' })).rejects.toBeInstanceOf(LifecycleError);
      await admin().model('ir.lifecycle').browse((await admin().model('ir.lifecycle').search([['model', '=', 'pg.pnote']])).ids).unlink();
      await e2.model('pg.pnote').browse(id).write({ name: 'and free again' });
    }, 60_000);
  });
});
