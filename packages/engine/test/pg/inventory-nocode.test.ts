import { describe, expect, it } from 'vitest';
import { ConcurrencyError, ModuleCatalog, baseModule } from '../../src/index.js';
import { inventoryProofSuite } from '../inventory-nocode-suite.js';
import { pgManager, pgUrl } from './helpers.js';

describe.skipIf(!pgUrl)('real PostgreSQL no-code inventory proof', () => {
  inventoryProofSuite(async () => {
    const manager = pgManager({ catalog: new ModuleCatalog([baseModule]), poolMax: 12 });
    const h = await manager.create('inventory-proof', ['base']);
    return { h, close: () => manager.closeAll() };
  }, (ctx) => {
    describe('concurrent stock operations', () => {
      it('two pickings racing to reserve the same quant never over-reserve', async () => {
        const c = ctx(); const p = await c.product('race'); const s = await c.loc('Stock'); await c.receive(p, s, 10);
        for (let round = 0; round < 3; round++) {
          const a = await c.picking([[p, s, c.customer(), 7]]); const b = await c.picking([[p, s, c.customer(), 7]]);
          await Promise.all([a, b].map((id) => c.run('confirm', [id], c.clerk())));
          await Promise.all([a, b].map((id) => c.run('reserve', [id], c.clerk())));
          const reserved = [...await c.reservedOf(a), ...await c.reservedOf(b)];
          expect(reserved.reduce((x, y) => x + y, 0)).toBe(10);
          expect((await c.quant(p, s))!.x_reserved).toBeLessThanOrEqual(10);
          expect(reserved.sort()).toEqual([3, 7]);
          await Promise.all([a, b].map((id) => c.run('cancel', [id], c.clerk())));
          expect((await c.quant(p, s))!.x_reserved).toBe(0);
        }
      });

      it('an A->B move racing a B->A move does not deadlock', async () => {
        const c = ctx(); const p = await c.product('swap'); const q = await c.product('swap');
        const a = await c.loc('A'); const b = await c.loc('B');
        for (const prod of [p, q]) { await c.receive(prod, a, 20); await c.receive(prod, b, 20); }
        const retry = async (id: number): Promise<void> => {
          for (let i = 0; ; i++) {
            try { await c.run('validate', [id], c.clerk()); return; } catch (e) {
              if (!(e instanceof ConcurrencyError) || i >= 5) throw e; // a ConcurrencyError is acceptable only when a retry succeeds
            }
          }
        };
        for (let round = 0; round < 5; round++) {
          // two products per picking, opposite orders: the lock order must still be global
          const ab = await c.picking([[p, a, b, 1], [q, a, b, 2]]); const ba = await c.picking([[q, b, a, 3], [p, b, a, 4]]);
          await Promise.all([retry(ab), retry(ba)]);
        }
        expect([await c.onHand(p, a), await c.onHand(p, b)]).toEqual([20 + 5 * 3, 20 - 5 * 3]);
        expect([await c.onHand(q, a), await c.onHand(q, b)]).toEqual([20 + 5 * 1, 20 - 5 * 1]);
      });

      it('N parallel validations from the same location sum exactly', async () => {
        const c = ctx(); const p = await c.product('sum'); const s = await c.loc('Stock'); const N = 10;
        await c.receive(p, s, 100);
        const ids = await Promise.all(Array.from({ length: N }, (_, i) => c.picking([[p, s, c.customer(), i + 1]])));
        await Promise.all(ids.map((id) => c.run('validate', [id], c.clerk())));
        expect(await c.onHand(p, s)).toBe(100 - (N * (N + 1)) / 2);
        expect(await c.onHand(p, c.customer())).toBe((N * (N + 1)) / 2);
      });

      it('parallel deliveries that together exceed stock never drive it negative', async () => {
        const c = ctx(); const p = await c.product('cap'); const s = await c.loc('Stock'); await c.receive(p, s, 10);
        const ids = await Promise.all(Array.from({ length: 6 }, () => c.picking([[p, s, c.customer(), 3]])));
        const results = await Promise.allSettled(ids.map((id) => c.run('validate', [id], c.clerk())));
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
        expect(await c.onHand(p, s)).toBe(1);
      });
    });
  });
});
