import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ButtonService, type Env, type TenantHandle } from '../src/index.js';
import { installInventoryProof } from './inventory-nocode-fixture.js';

export interface InventoryCtx {
  h: TenantHandle;
  /** a fresh clerk env (own cache) per concurrent worker */
  clerk: () => Env;
  loc: (name: string, usage?: string, allowNegative?: boolean) => Promise<number>;
  product: (name: string) => Promise<number>;
  /** moves are [product, src, dest, qty] */
  picking: (moves: [number, number, number, number][]) => Promise<number>;
  run: (action: string, ids: number[], env?: Env) => Promise<unknown>;
  quant: (product: number, location: number) => Promise<{ x_quantity: number; x_reserved: number } | undefined>;
  onHand: (product: number, location: number) => Promise<number>;
  reservedOf: (picking: number) => Promise<number[]>;
  receive: (product: number, location: number, qty: number) => Promise<number>;
  supplier: () => number;
  customer: () => number;
}

/** Shared by the PGlite and real-PostgreSQL runs. */
export function inventoryProofSuite(
  open: () => Promise<{ h: TenantHandle; close: () => Promise<void> }>,
  extra?: (ctx: () => InventoryCtx) => void,
): void {
  let h: TenantHandle; let close: () => Promise<void>; let root: Env; let alice: Env; let admin: Env;
  let supplier: number; let customer: number; let loss: number; let stock: number; let stockB: number;
  let seq = 0;
  const ref = async (name: string) => (await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name=$1`, params: [name] }))[0]!.res_id;
  const loc = async (name: string, usage = 'internal', allowNegative = false) =>
    (await alice.model('x_stock_location').create({ x_name: `${name}-${++seq}`, x_usage: usage, x_allow_negative: allowNegative })).ids[0]!;
  const product = async (name: string) => (await alice.model('x_stock_product').create({ x_name: `${name}-${++seq}` })).ids[0]!;
  const picking = async (moves: [number, number, number, number][]) => (await alice.model('x_stock_picking').create({
    x_move_ids: moves.map(([p, s, d, q]) => ({ op: 'create', values: { x_product_id: p, x_src_id: s, x_dest_id: d, x_qty: q } })),
  })).ids[0]!;
  const run = (action: string, ids: number[], env = alice) => new ButtonService(env).execute('x_stock_picking', ids, { action: `stock.${action}` });
  const fresh = (): Env => h.env({ uid: 1 }); // reads are cached per env, so read through a new one
  const quant = async (p: number, l: number) => (await (await fresh().model('x_stock_quant').search([['x_product_id', '=', p], ['x_location_id', '=', l]])).read())[0] as { x_quantity: number; x_reserved: number } | undefined;
  const onHand = async (p: number, l: number) => (await quant(p, l))?.x_quantity ?? 0;
  const reservedOf = async (id: number) => (await (await fresh().model('x_stock_move').search([['x_picking_id', '=', id]], { order: 'id' })).read()).map((m) => Number(m.x_reserved_qty));
  const pickingState = async (id: number) => (await fresh().model('x_stock_picking').browse(id).read())[0]!.x_state;
  const move = (p: number, s: number, d: number, q: number) => picking([[p, s, d, q]]);
  const receive = async (p: number, l: number, q: number) => { const id = await move(p, supplier, l, q); await run('validate', [id]); return id; };

  beforeAll(async () => {
    ({ h, close } = await open()); root = h.env({ uid: 1 });
    admin = h.env({ uid: await ref('user_admin') });
    const company = await ref('main_company');
    const uid = (await root.model('res.users').create({ name: 'Stock clerk', login: 'stock-proof', company_id: company, company_ids: [company], group_ids: [await ref('group_user')] })).ids[0]!;
    await installInventoryProof(h, admin);
    alice = h.env({ uid }); root = h.env({ uid: 1 });
    supplier = await loc('Vendors', 'supplier'); customer = await loc('Customers', 'customer');
    loss = await loc('Inventory loss', 'inventory'); stock = await loc('Stock'); stockB = await loc('Stock B');
  }, 180_000);
  afterAll(async () => { await close?.(); });

  describe('inventory assembled from metadata, transitions and balance effects', () => {
    it('a receipt increases on-hand and a delivery decreases it', async () => {
      const p = await product('widget');
      const r = await receive(p, stock, 10);
      expect(await onHand(p, stock)).toBe(10);
      expect(await onHand(p, supplier)).toBe(-10);
      expect(await pickingState(r)).toBe('done');
      await run('validate', [await move(p, stock, customer, 4)]);
      expect(await onHand(p, stock)).toBe(6);
      expect(await onHand(p, customer)).toBe(4);
    });

    it('blocks a negative stock attempt, then allows it on an allow_negative location', async () => {
      const p = await product('gadget'); await receive(p, stock, 2);
      const bad = await move(p, stock, customer, 5);
      await expect(run('validate', [bad])).rejects.toThrow('Negative stock');
      expect(await onHand(p, stock)).toBe(2);
      expect(await onHand(p, customer)).toBe(0);
      expect(await pickingState(bad)).toBe('draft');
      const flexible = await loc('Flexible', 'internal', true);
      await run('validate', [await move(p, flexible, customer, 3)]);
      expect(await onHand(p, flexible)).toBe(-3);
    });

    it('reserves partially (7 of 10, then 3, then 0) and tops up later', async () => {
      const p = await product('bolt'); await receive(p, stock, 10);
      const a = await move(p, stock, customer, 7); const b = await move(p, stock, customer, 7); const c = await move(p, stock, customer, 2);
      for (const id of [a, b, c]) await run('confirm', [id]);
      await run('reserve', [a]); await run('reserve', [b]); await run('reserve', [c]);
      expect([await reservedOf(a), await reservedOf(b), await reservedOf(c)]).toEqual([[7], [3], [0]]);
      expect(await quant(p, stock)).toMatchObject({ x_quantity: 10, x_reserved: 10 });
      // a later reserve only adds what is still missing
      await run('cancel', [a]);
      await run('reserve', [b]); await run('reserve', [c]);
      expect([await reservedOf(b), await reservedOf(c)]).toEqual([[7], [2]]);
      expect(await quant(p, stock)).toMatchObject({ x_reserved: 9 });
      await run('validate', [b]);
      expect(await quant(p, stock)).toMatchObject({ x_quantity: 3, x_reserved: 2 });
    });

    it('cancel frees the reservation', async () => {
      const p = await product('nut'); await receive(p, stock, 5);
      const a = await move(p, stock, customer, 5);
      await run('confirm', [a]); await run('reserve', [a]);
      expect((await quant(p, stock))!.x_reserved).toBe(5);
      await run('cancel', [a]);
      expect((await quant(p, stock))!.x_reserved).toBe(0);
      expect(await reservedOf(a)).toEqual([0]);
      expect(await pickingState(a)).toBe('cancel');
      await expect(run('validate', [a])).rejects.toThrow(/Cannot validate/);
    });

    it('a second validate is skipped and moves stock only once', async () => {
      const p = await product('washer'); await receive(p, stock, 6);
      const d = await move(p, stock, customer, 2);
      expect(await run('validate', [d])).toEqual({ done: [d], skipped: [] });
      expect(await run('validate', [d])).toEqual({ done: [], skipped: [d] });
      expect(await onHand(p, stock)).toBe(4);
    });

    it('refuses direct writes to quant quantities, in any role', async () => {
      const p = await product('screw'); await receive(p, stock, 3);
      const q = await root.model('x_stock_quant').search([['x_product_id', '=', p], ['x_location_id', '=', stock]]);
      for (const env of [alice, root]) {
        await expect(env.model('x_stock_quant').browse(q.ids[0]!).write({ x_quantity: 99 })).rejects.toThrow();
        await expect(env.model('x_stock_quant').browse(q.ids[0]!).write({ x_reserved: 1 })).rejects.toThrow();
        await expect(env.model('x_stock_quant').create({ x_product_id: p, x_location_id: stockB, x_quantity: 5 })).rejects.toThrow();
      }
      expect(await onHand(p, stock)).toBe(3);
    });

    it('an inventory adjustment moves stock from and to the inventory-loss location', async () => {
      const p = await product('pipe'); await receive(p, stock, 10);
      await run('validate', [await move(p, loss, stock, 3)]); // count found 3 extra
      expect(await onHand(p, stock)).toBe(13);
      await run('validate', [await move(p, stock, loss, 5)]); // count found 5 missing
      expect(await onHand(p, stock)).toBe(8);
      expect(await onHand(p, loss)).toBe(2);
    });

    it('a multi-move picking is atomic', async () => {
      const p = await product('cable'); const q = await product('plug'); await receive(p, stock, 5); await receive(q, stock, 1);
      const bad = await picking([[p, stock, stockB, 5], [q, stock, stockB, 2]]);
      await expect(run('validate', [bad])).rejects.toThrow('Negative stock');
      expect(await onHand(p, stock)).toBe(5);
      expect(await onHand(p, stockB)).toBe(0);
      await run('validate', [await picking([[p, stock, stockB, 5], [q, stock, stockB, 1]])]);
      expect([await onHand(p, stock), await onHand(p, stockB), await onHand(q, stockB)]).toEqual([0, 5, 1]);
    });
  });

  extra?.(() => ({ h, clerk: () => h.env({ uid: alice.uid }), loc, product, picking, run, quant, onHand, reservedOf, receive, supplier: () => supplier, customer: () => customer }));
}
