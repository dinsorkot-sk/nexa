import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConcurrencyError, ModuleCatalog, baseModule, type Env, type ModuleManifest, type TenantHandle } from '../../src/index.js';
import type { PgTenantManager } from '../../src/tenant/pg.js';
import { gate, pgManager, pgUrl, settledWithin, sleep } from './helpers.js';

/** GAP-COMP-1 on a real server: concurrent line edits of one order leave consistent stored totals. */
const rcModule: ModuleManifest = {
  name: 'pg_rc', version: '1.0.0', depends: ['base'],
  models: [
    {
      name: 'pgrc.order', origin: 'module',
      fields: {
        name: { type: 'char' },
        line_ids: { type: 'one2many', comodel: 'pgrc.line', inverseName: 'order_id' },
        untaxed: { type: 'float', store: true, computeExpr: "round(line_ids.sum('subtotal'), 2)" },
        total: { type: 'float', store: true, computeExpr: 'round(untaxed * 1.1, 2)' },
      },
    },
    {
      name: 'pgrc.line', origin: 'module',
      fields: {
        order_id: { type: 'many2one', comodel: 'pgrc.order', ondelete: 'cascade' },
        qty: { type: 'float' },
        price: { type: 'float' },
        subtotal: { type: 'float', store: true, computeExpr: 'round((qty or 0) * (price or 0), 2)' },
      },
    },
  ],
};

describe.skipIf(!pgUrl)('real PostgreSQL: relational stored computes', () => {
  let manager: PgTenantManager;
  let h: TenantHandle;
  const env = (): Env => h.env({ uid: 1 });

  beforeAll(async () => {
    manager = pgManager({ catalog: new ModuleCatalog([baseModule, rcModule]), poolMax: 10 });
    h = await manager.create('rc', ['pg_rc']);
  });
  afterAll(async () => { await manager?.closeAll(); });

  it('concurrent edits of different lines of one order converge to consistent totals', async () => {
    const [order] = (await env().model('pgrc.order').create({ name: 'O' })).ids as [number];
    const lineIds = (await env().model('pgrc.line').create(
      Array.from({ length: 6 }, () => ({ order_id: order, qty: 1, price: 10 })),
    )).ids;
    // each worker edits its own line several times, in parallel transactions
    await Promise.all(lineIds.map((id, i) => (async () => {
      for (let round = 1; round <= 3; round++) {
        await env().transaction(async (tx) => {
          await tx.model('pgrc.line').browse(id).write({ qty: i + round });
          await sleep(5); // widen the window between the line write and the order recompute commit
        });
      }
    })()));
    const lines = await env().model('pgrc.line').browse([...lineIds]).read(['subtotal']);
    const expected = Math.round(lines.reduce((s, l) => s + (l.subtotal as number), 0) * 100) / 100;
    expect(expected).toBe(lineIds.reduce((s, _id, i) => s + (i + 3) * 10, 0));
    const [row] = await env().model('pgrc.order').browse(order).read(['untaxed', 'total']);
    expect(row).toMatchObject({ untaxed: expected, total: Math.round(expected * 1.1 * 100) / 100 });
  });

  it('a lock-order conflict with the order recompute is a ConcurrencyError, not a raw driver error', async () => {
    const [order] = (await env().model('pgrc.order').create({ name: 'D' })).ids as [number];
    const [line] = (await env().model('pgrc.line').create({ order_id: order, qty: 1, price: 10 })).ids as [number];
    const bHoldsOrder = gate();
    const aBlocked = gate();
    // B: locks the order (header write), then updates the line through the one2many
    const b = env().transaction(async (tx) => {
      // B detects the deadlock late, so A (blocked in the recompute lock) is the victim: covers that path
      await (tx as unknown as { db: { query(q: { text: string; params: unknown[] }): Promise<unknown> } }).db.query({ text: "SET LOCAL deadlock_timeout = '10s'", params: [] });
      await tx.model('pgrc.order').browse(order).write({ name: 'D-b' });
      bHoldsOrder.open();
      await aBlocked.wait;
      await tx.model('pgrc.order').browse(order).write({ line_ids: [{ op: 'update', id: line, values: { qty: 5 } }] });
    });
    await bHoldsOrder.wait;
    // A: writes the line (row lock), then its recompute locks the order -> waits for B
    const a = env().transaction((tx) => tx.model('pgrc.line').browse(line).write({ qty: 2 }));
    expect(await settledWithin(a, 300)).toBe('pending');
    aBlocked.open();
    const results = await Promise.allSettled([a, b]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(results[0]!.status).toBe('rejected'); // A, the recompute lock
    expect(rejected[0]!.reason).toBeInstanceOf(ConcurrencyError);
    // the committed side left consistent totals
    const [l] = await env().model('pgrc.line').browse(line).read(['subtotal']);
    const [o] = await env().model('pgrc.order').browse(order).read(['untaxed']);
    expect(o!.untaxed).toBe(l!.subtotal);
  });

  it('concurrent line creation and deletion keep the totals consistent', async () => {
    const [order] = (await env().model('pgrc.order').create({ name: 'P' })).ids as [number];
    const [doomed] = (await env().model('pgrc.line').create({ order_id: order, qty: 1, price: 1000 })).ids as [number];
    await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => env().transaction((tx) => tx.model('pgrc.line').create({ order_id: order, qty: 1, price: i + 1 }))),
      env().transaction((tx) => tx.model('pgrc.line').browse(doomed).unlink()),
    ]);
    const [row] = await env().model('pgrc.order').browse(order).read(['untaxed']);
    expect(row!.untaxed).toBe(15);
  });
});
