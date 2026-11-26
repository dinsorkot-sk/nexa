import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MetadataStore, ModuleCatalog, PgliteTenantManager, ValidationError, baseModule, resolveModels,
  type Env, type ModelDef, type ModuleManifest, type Recordset, type TenantHandle,
} from '../src/index.js';
import { RECOMPUTE_BATCH, setRecomputeFanoutLimit } from '../src/orm/compute.js';

/**
 * GAP-COMP-1: stored NX-Expr computes over relational paths (Odoo @api.depends('line_ids.x')),
 * recomputed as superuser on reverse triggers.
 */
const models: ModelDef[] = [
  {
    name: 'rc.partner', origin: 'module',
    fields: {
      name: { type: 'char' },
      discount: { type: 'float' },
      secret: { type: 'float', groups: ['base.group_system'] },
      label: { type: 'char', computeExpr: "name + '!'" },
    },
  },
  {
    name: 'rc.tax', origin: 'module',
    fields: { name: { type: 'char' }, amount: { type: 'float' } },
  },
  {
    name: 'rc.order', origin: 'module',
    fields: {
      name: { type: 'char' },
      active: { type: 'boolean', default: true },
      partner_id: { type: 'many2one', comodel: 'rc.partner' },
      line_ids: { type: 'one2many', comodel: 'rc.line', inverseName: 'order_id' },
      untaxed: { type: 'float', store: true, computeExpr: "round(line_ids.sum('subtotal'), 2)" },
      tax: { type: 'float', store: true, computeExpr: "round(line_ids.sum('tax'), 2)" },
      total: { type: 'float', store: true, computeExpr: 'round(untaxed + tax, 2)' },
      line_count: { type: 'integer', store: true, computeExpr: 'line_ids.count()' },
      partner_discount: { type: 'float', store: true, computeExpr: 'partner_id.discount or 0' },
      // code compute over a dotted path: same trigger graph
      code_total: {
        type: 'float', store: true, depends: ['line_ids.subtotal'],
        compute: async (rs: Recordset) => {
          const out = new Map<number, number>();
          for (const o of await rs.read(['line_ids'])) {
            const lines = await rs.env.model('rc.line').browse(o.line_ids as number[]).read(['subtotal']);
            out.set(o.id as number, lines.reduce((s, l) => s + (l.subtotal as number), 0));
          }
          return out;
        },
      },
    },
  },
  {
    name: 'rc.line', origin: 'module',
    fields: {
      order_id: { type: 'many2one', comodel: 'rc.order', ondelete: 'cascade' },
      active: { type: 'boolean', default: true },
      qty: { type: 'float' },
      price: { type: 'float' },
      tax_ids: { type: 'many2many', comodel: 'rc.tax' },
      subtotal: { type: 'float', store: true, computeExpr: 'round((qty or 0) * (price or 0) * (1 - (order_id.partner_id.discount or 0) / 100), 2)' },
      tax: { type: 'float', store: true, computeExpr: "round((subtotal or 0) * tax_ids.sum('amount') / 100, 2)" },
    },
  },
  {
    name: 'rc.chain', origin: 'module', fields: {
      x: { type: 'float', default: 0 },
      a: { type: 'float', store: true, computeExpr: 'x * 2' },
      b: { type: 'float', store: true, computeExpr: 'a * 2' },
      c: { type: 'float', store: true, computeExpr: 'x == 0 ? 0 : x / b' },
    },
  },
  {
    name: 'rc.relay', origin: 'module', fields: {
      chain_id: { type: 'many2one', comodel: 'rc.chain' },
      c: { type: 'float', store: true, computeExpr: 'chain_id.x == 0 ? 0 : chain_id.x / chain_id.b' },
    },
  },
];

const all = { read: true, write: true, create: true, unlink: true };
const rcModule: ModuleManifest = {
  name: 'rc_test', version: '1.0.0', depends: ['base'], models,
  access: [
    { model: 'rc.order', group: 'base.group_user', perms: all },
    { model: 'rc.line', group: 'base.group_user', perms: all },
    { model: 'rc.partner', group: 'base.group_user', perms: { read: true, write: false, create: false, unlink: false } },
    // no access to rc.tax for users: the recompute still reads it (superuser)
  ],
  rules: [{
    // users do not see big lines; the order totals still include them
    name: 'rc_small_lines', model: 'rc.line', groups: ['base.group_user'],
    perms: { read: true, write: true, create: true, unlink: true }, domain: [['qty', '<', 100]],
  }],
};

let manager: PgliteTenantManager;
let h: TenantHandle;
let env: Env;
let alice: Env;
let fresh: () => Env;
beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, rcModule]) });
  h = await manager.create('relational-compute', ['rc_test']);
  env = h.env({ uid: 1 });
  fresh = () => h.env({ uid: 1 });
  const [group] = await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='group_user'`, params: [] });
  const [company] = await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='main_company'`, params: [] });
  const [uid] = (await env.model('res.users').create({
    name: 'Alice', login: 'alice', company_id: company!.res_id, company_ids: [company!.res_id], group_ids: [group!.res_id],
  })).ids;
  alice = h.env({ uid: uid! });
}, 120_000);
afterAll(() => manager.closeAll());

// a fresh env per read: another env (alice) may have changed the rows behind this env's cache
const read = async (model: string, id: number, fields: string[]) => (await fresh().model(model).browse(id).read(fields))[0]!;
const totals = (id: number) => read('rc.order', id, ['untaxed', 'tax', 'total', 'line_count', 'code_total']);

describe('stored expression computes over relational paths', () => {
  it('recomputes the order on line create, write, unlink and move', async () => {
    const [vat] = (await env.model('rc.tax').create({ name: 'VAT', amount: 10 })).ids;
    const [o1, o2] = (await env.model('rc.order').create([{ name: 'A' }, { name: 'B' }])).ids as [number, number];
    expect(await totals(o1)).toMatchObject({ untaxed: 0, tax: 0, total: 0, line_count: 0, code_total: 0 });

    const [l1, l2] = (await env.model('rc.line').create([
      { order_id: o1, qty: 2, price: 10, tax_ids: [vat] },
      { order_id: o1, qty: 1, price: 5 },
    ])).ids as [number, number];
    expect(await totals(o1)).toMatchObject({ untaxed: 25, tax: 2, total: 27, line_count: 2, code_total: 25 });

    await env.model('rc.line').browse(l2).write({ qty: 3 });
    expect(await totals(o1)).toMatchObject({ untaxed: 35, tax: 2, total: 37 });

    // many2many on the line and a tax rate change (a dependency two hops away from the order)
    await env.model('rc.line').browse(l2).write({ tax_ids: [vat] });
    expect(await totals(o1)).toMatchObject({ tax: 3.5, total: 38.5 });
    await env.model('rc.tax').browse(vat!).write({ amount: 20 });
    expect(await totals(o1)).toMatchObject({ tax: 7, total: 42 });

    // move a line to another order: both the old and the new parent recompute
    await env.model('rc.line').browse(l1).write({ order_id: o2 });
    expect(await totals(o1)).toMatchObject({ untaxed: 15, tax: 3, total: 18, line_count: 1 });
    expect(await totals(o2)).toMatchObject({ untaxed: 20, tax: 4, total: 24, line_count: 1, code_total: 20 });

    // one2many command through the parent
    await env.model('rc.order').browse(o2).write({ line_ids: [{ op: 'create', values: { qty: 1, price: 1 } }] });
    expect(await totals(o2)).toMatchObject({ untaxed: 21, line_count: 2 });

    await env.model('rc.line').browse(l2).unlink();
    expect(await totals(o1)).toMatchObject({ untaxed: 0, tax: 0, total: 0, line_count: 0, code_total: 0 });
  });

  it('follows many2one dependency changes (partner -> orders -> lines)', async () => {
    const [p] = (await env.model('rc.partner').create({ name: 'P', discount: 10 })).ids as [number];
    const [o] = (await env.model('rc.order').create({ name: 'C', partner_id: p })).ids as [number];
    await env.model('rc.line').create({ order_id: o, qty: 1, price: 100 });
    expect(await read('rc.order', o, ['partner_discount', 'untaxed'])).toMatchObject({ partner_discount: 10, untaxed: 90 });
    await env.model('rc.partner').browse(p).write({ discount: 50 });
    expect(await read('rc.order', o, ['partner_discount', 'untaxed'])).toMatchObject({ partner_discount: 50, untaxed: 50 });
    const [p2] = (await env.model('rc.partner').create({ name: 'Q' })).ids as [number];
    await env.model('rc.order').browse(o).write({ partner_id: p2 });
    expect(await read('rc.order', o, ['partner_discount', 'untaxed'])).toMatchObject({ partner_discount: 0, untaxed: 100 });
    // deleting the partner clears the many2one (set null) and recomputes
    await env.model('rc.order').browse(o).write({ partner_id: p });
    await env.model('rc.partner').browse(p).unlink();
    expect(await read('rc.order', o, ['partner_discount', 'untaxed'])).toMatchObject({ partner_discount: 0, untaxed: 100 });
  });

  it('processes a large many2one fan-out in batches', async () => {
    const [p] = (await env.model('rc.partner').create({ name: 'Big', discount: 1 })).ids as [number];
    const n = RECOMPUTE_BATCH + 5;
    const ids = (await env.model('rc.order').create(Array.from({ length: n }, (_, i) => ({ name: `F${i}`, partner_id: p })))).ids;
    await env.model('rc.partner').browse(p).write({ discount: 7 });
    const rows = await env.model('rc.order').browse([...ids]).read(['partner_discount']);
    expect(rows.every((r) => r.partner_discount === 7)).toBe(true);
  }, 60_000);

  it('stores the same value whoever triggers the recompute (superuser reads)', async () => {
    const [vat] = (await env.model('rc.tax').create({ name: 'V', amount: 10 })).ids;
    const [o] = (await env.model('rc.order').create({ name: 'S' })).ids as [number];
    const [visible] = (await env.model('rc.line').create({ order_id: o, qty: 1, price: 10, tax_ids: [vat] })).ids as [number];
    await env.model('rc.line').create({ order_id: o, qty: 100, price: 1, tax_ids: [vat] }); // hidden from alice by a rule
    expect(await read('rc.order', o, ['untaxed', 'tax', 'total'])).toMatchObject({ untaxed: 110, tax: 11, total: 121 });
    // alice cannot read the tax nor the big line, yet her edit stores the full totals
    await expect(alice.model('rc.tax').browse(vat!).read(['amount'])).rejects.toThrow();
    expect((await alice.model('rc.order').browse(o).read(['line_ids']))[0]!.line_ids).toEqual([visible]);
    await alice.model('rc.line').browse(visible).write({ qty: 2 });
    const byAlice = await read('rc.order', o, ['untaxed', 'tax', 'total']);
    expect(byAlice).toMatchObject({ untaxed: 120, tax: 12, total: 132 });
    expect((await alice.model('rc.order').browse(o).read(['total']))[0]!.total).toBe(132);
  });
});

describe('review follow-ups', () => {
  it('waits for transitive computed dependencies that enter a later recompute wave', async () => {
    const [id] = (await env.model('rc.chain').create({ x: 0 })).ids as [number];
    const [relay] = (await env.model('rc.relay').create({ chain_id: id })).ids as [number];
    expect(await read('rc.chain', id, ['a', 'b', 'c'])).toMatchObject({ a: 0, b: 0, c: 0 });
    // x directly dirties a and both c fields. b enters the queue only after a is stored.
    // Evaluating either c in that first wave would divide by b's stale zero value.
    await env.model('rc.chain').browse(id).write({ x: 1 });
    expect(await read('rc.chain', id, ['a', 'b', 'c'])).toMatchObject({ a: 2, b: 4, c: 0.25 });
    expect(await read('rc.relay', relay, ['c'])).toMatchObject({ c: 0.25 });
    await env.model('rc.chain').browse(id).write({ x: 2 });
    expect(await read('rc.chain', id, ['a', 'b', 'c'])).toMatchObject({ a: 4, b: 8, c: 0.25 });
    expect(await read('rc.relay', relay, ['c'])).toMatchObject({ c: 0.25 });
  });

  it('archiving a line recomputes the totals (active rows only, implicit active dependency)', async () => {
    const [o] = (await env.model('rc.order').create({ name: 'Arch' })).ids as [number];
    const [l1] = (await env.model('rc.line').create([{ order_id: o, qty: 1, price: 10 }, { order_id: o, qty: 1, price: 5 }])).ids as [number];
    expect(await read('rc.order', o, ['untaxed', 'line_count'])).toMatchObject({ untaxed: 15, line_count: 2 });
    await env.model('rc.line').browse(l1).write({ active: false });
    expect(await read('rc.order', o, ['untaxed', 'line_count'])).toMatchObject({ untaxed: 5, line_count: 1 });
    await env.withContext({ activeTest: false }).model('rc.line').browse(l1).write({ active: true });
    expect(await read('rc.order', o, ['untaxed', 'line_count'])).toMatchObject({ untaxed: 15, line_count: 2 });
  });

  it('recomputes through an archived middle record of a 2-hop path', async () => {
    const [p] = (await env.model('rc.partner').create({ name: 'Mid', discount: 0 })).ids as [number];
    const [o] = (await env.model('rc.order').create({ name: 'Archived order', partner_id: p })).ids as [number];
    const [l] = (await env.model('rc.line').create({ order_id: o, qty: 1, price: 100 })).ids as [number];
    await env.model('rc.order').browse(o).write({ active: false });
    // line.subtotal depends on order_id.partner_id.discount; the order in the middle is archived
    await env.model('rc.partner').browse(p).write({ discount: 25 });
    expect(await read('rc.line', l, ['subtotal'])).toMatchObject({ subtotal: 75 });
  });

  it('fails a change whose recompute fan-out exceeds the ceiling, leaving data unchanged', async () => {
    const [p] = (await env.model('rc.partner').create({ name: 'Wide', discount: 1 })).ids as [number];
    const ids = (await env.model('rc.order').create(Array.from({ length: 30 }, (_, i) => ({ name: `W${i}`, partner_id: p })))).ids;
    const previous = setRecomputeFanoutLimit(20);
    try {
      await expect(fresh().model('rc.partner').browse(p).write({ discount: 9 })).rejects.toBeInstanceOf(ValidationError);
    } finally {
      setRecomputeFanoutLimit(previous);
    }
    const rows = await fresh().model('rc.order').browse([...ids]).read(['partner_discount']);
    expect(rows.every((r) => r.partner_discount === 1)).toBe(true);
    expect((await fresh().model('rc.partner').browse(p).read(['discount']))[0]!.discount).toBe(1);
  });

  it('lets an administrator restrict a custom computed field to groups', async () => {
    const store = MetadataStore.for(h);
    await expect(store.addField('rc.order', 'x_plain', { type: 'float', groups: ['base.group_system'] })).rejects.toThrow(/Only a computed/);
    await expect(store.addField('rc.order', 'x_bad', { type: 'float', computeExpr: 'untaxed', groups: ['nope'] })).rejects.toThrow(/Invalid groups/);
    await store.addField('rc.order', 'x_margin', { type: 'float', store: true, computeExpr: "line_ids.sum('subtotal')", groups: ['base.group_system'] });
    expect(h.registry.get('rc.order').fields.get('x_margin')!.groups).toEqual(['base.group_system']);
    const [o] = (await fresh().model('rc.order').create({ name: 'G', line_ids: [{ op: 'create', values: { qty: 2, price: 3 } }] })).ids as [number];
    expect((await fresh().model('rc.order').browse(o).read(['x_margin']))[0]!.x_margin).toBe(6);
    await expect(h.env({ uid: alice.uid }).model('rc.order').browse(o).read(['x_margin'])).rejects.toThrow();
  });
});

describe('registry validation', () => {
  const order = models[2]!;
  const line = models[3]!;
  const withOrderField = (field: Record<string, unknown>) => resolveModels([
    models[0]!, models[1]!, { ...order, fields: { ...order.fields, probe: field as never } }, line,
  ]);

  it('accepts relational paths and rejects restricted or untriggerable ones', () => {
    expect(withOrderField({ type: 'float', store: true, computeExpr: "line_ids.sum('qty')" }).get('rc.order')!.fields.get('probe')!.depends)
      .toEqual(['line_ids', 'line_ids.qty']);
    expect(() => withOrderField({ type: 'float', store: true, computeExpr: 'partner_id.secret' })).toThrow(/unrestricted/);
    // a non-stored compute fires no trigger
    expect(() => withOrderField({ type: 'char', store: true, computeExpr: 'partner_id.label' })).toThrow(/stored fields/);
    expect(() => withOrderField({ type: 'float', store: true, computeExpr: "partner_id.write_date or ''" })).toThrow(/unrestricted/);
    // impure helpers stay refused
    expect(() => withOrderField({ type: 'float', store: true, computeExpr: "line_ids.sum('qty') + user.id" })).toThrow(/identity, context, time, or helper/);
  });

  it('propagates related-field groups before validating stored expressions, in any order', () => {
    const secretModel: ModelDef = { name: 'rc.s', origin: 'module', fields: { v: { type: 'float', groups: ['base.group_system'] } } };
    const hopModel: ModelDef = { name: 'rc.h', origin: 'module', fields: {
      s_id: { type: 'many2one', comodel: 'rc.s', groups: ['base.group_system'] }, w: { type: 'float' },
    } };
    const holder: ModelDef = { name: 'rc.r', origin: 'module', fields: {
      s_id: { type: 'many2one', comodel: 'rc.s' },
      h_id: { type: 'many2one', comodel: 'rc.h' },
      rel_v: { type: 'float', related: 's_id.v', store: true },
      rel_rel: { type: 'float', related: 'rel_h_v', store: true },
      rel_h_v: { type: 'float', related: 'h_id.s_id.v', store: true },
      rel_hop: { type: 'float', related: 'h_id.w', store: true },
    } };
    const withProbe = (dep: string, probeFirst: boolean): ModelDef => {
      const probe = { probe: { type: 'float' as const, store: true, computeExpr: `${dep} or 0` } };
      return { ...holder, fields: probeFirst ? { ...probe, ...holder.fields } : { ...holder.fields, ...probe } };
    };
    for (const probeFirst of [true, false]) {
      for (const order of [(r: ModelDef) => [r, secretModel, hopModel], (r: ModelDef) => [secretModel, hopModel, r]]) {
        for (const dep of ['rel_v', 'rel_rel', 'rel_h_v']) {
          expect(() => resolveModels(order(withProbe(dep, probeFirst)))).toThrow(/unrestricted/);
        }
        expect(() => resolveModels(order(withProbe('rel_hop', probeFirst)))).not.toThrow();
      }
    }
    const resolved = resolveModels([holder, secretModel, hopModel]).get('rc.r')!;
    expect(resolved.fields.get('rel_rel')!.groups).toEqual(['base.group_system']);
    expect(resolved.fields.get('rel_h_v')!.groups).toEqual(['base.group_system']);
  });

  it('bounds the path depth', () => {
    const chain: ModelDef[] = Array.from({ length: 7 }, (_, i) => ({
      name: `rc.c${i}`, origin: 'module' as const,
      fields: { v: { type: 'float' as const }, ...(i < 6 ? { next_id: { type: 'many2one' as const, comodel: `rc.c${i + 1}` } } : {}) },
    }));
    const deep = (hops: number) => resolveModels([...chain.slice(1), {
      ...chain[0]!, fields: { ...chain[0]!.fields, probe: { type: 'float', store: true, computeExpr: `${'next_id.'.repeat(hops)}v` } },
    }]);
    expect(() => deep(4)).not.toThrow();
    expect(() => deep(5)).toThrow(/deeper than 4/);
  });

  it('detects cycles across records at build', () => {
    expect(() => resolveModels([
      { name: 'rc.a', origin: 'module', fields: { b_id: { type: 'many2one', comodel: 'rc.b' }, x: { type: 'float', store: true, computeExpr: 'b_id.y' } } },
      { name: 'rc.b', origin: 'module', fields: { a_id: { type: 'many2one', comodel: 'rc.a' }, y: { type: 'float', store: true, computeExpr: 'a_id.x' } } },
    ])).toThrow(/dependency cycle/);
  });
});
