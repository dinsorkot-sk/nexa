import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EngineError, MetadataStore, PgliteTenantManager, ValidationError, resolveModels,
  type Env, type ModelDef, type Recordset,
} from '../src/index.js';

const sumLines = async (orders: Recordset) => {
  const out = new Map<number, number>();
  for (const o of await orders.read(['line_ids'])) {
    const lines = await orders.env.model('sale.line').browse(o.line_ids as number[]).read(['qty', 'price']);
    out.set(o.id as number, lines.reduce((s, l) => s + (l.qty as number) * (l.price as number), 0));
  }
  return out;
};

const models: ModelDef[] = [
  { name: 'res.country', origin: 'module', fields: { code: { type: 'char' } } },
  { name: 'res.tag', origin: 'module', fields: { name: { type: 'char' } } },
  {
    name: 'res.partner', origin: 'module',
    fields: {
      name: { type: 'char' },
      country_id: { type: 'many2one', comodel: 'res.country' },
      tag_ids: { type: 'many2many', comodel: 'res.tag' },
    },
  },
  {
    name: 'sale.order', origin: 'module',
    fields: {
      name: { type: 'char' },
      partner_id: { type: 'many2one', comodel: 'res.partner' },
      line_ids: { type: 'one2many', comodel: 'sale.line', inverseName: 'order_id' },
      amount: { type: 'float', compute: sumLines, depends: ['line_ids.qty', 'line_ids.price'], store: true },
      amount_tax: {
        type: 'float', store: true, depends: ['amount'],
        compute: async (rs) => new Map((await rs.read(['amount'])).map((r) => [r.id as number, (r.amount as number) * 0.07])),
      },
      line_count: {
        type: 'integer', depends: ['line_ids'],
        compute: async (rs) => new Map((await rs.read(['line_ids'])).map((r) => [r.id as number, (r.line_ids as number[]).length])),
      },
      partner_name: { type: 'char', related: 'partner_id.name', store: true },
      country_id: { type: 'many2one', comodel: 'res.country', related: 'partner_id.country_id' },
    },
    onchange: {
      partner_id: (d) => ({ name: d.partner_id ? `SO for ${String(d.partner_id)}` : 'SO' }),
      name: (d) => ({ note: `${String(d.name)}!` }),
    },
  },
  {
    name: 'sale.line', origin: 'module',
    fields: {
      order_id: { type: 'many2one', comodel: 'sale.order', required: true, ondelete: 'cascade' },
      qty: { type: 'float', default: 1 },
      price: { type: 'float', default: 0 },
    },
    constraints: [
      { name: 'price_positive', sql: 'CHECK (price >= 0)' },
      { name: 'qty_limit', fields: ['qty'], check: async (rs) => {
        for (const l of await rs.read(['qty'])) if ((l.qty as number) > 1000) throw new ValidationError('qty too large');
      } },
    ],
  },
  // extension adds a plain field used by onchange
  { name: 'sale.order', extends: ['sale.order'], origin: 'module', fields: { note: { type: 'char' } } },
];

let mgr: PgliteTenantManager;
let env: Env;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  env = (await mgr.open('rel')).env({ uid: 1 });
}, 60_000);
afterAll(() => mgr.closeAll());

const one = async (model: string, id: number, fields: string[]) => (await env.model(model).browse(id).read(fields))[0];

describe('many2many', () => {
  it('set / link / unlink / clear and read', async () => {
    const tags = (await env.model('res.tag').create([{ name: 'a' }, { name: 'b' }, { name: 'c' }])).ids;
    const [p] = (await env.model('res.partner').create({ name: 'P', tag_ids: [tags[0], tags[1]] })).ids;
    expect((await one('res.partner', p, ['tag_ids'])).tag_ids).toEqual([tags[0], tags[1]]);
    await env.model('res.partner').browse(p).write({ tag_ids: [{ op: 'link', id: tags[2] }, { op: 'unlink', id: tags[0] }] });
    expect((await one('res.partner', p, ['tag_ids'])).tag_ids).toEqual([tags[1], tags[2]]);
    expect(await env.model('res.partner').searchCount([['tag_ids.name', '=', 'c']])).toBe(1);
    expect(await env.model('res.partner').searchCount([['tag_ids', 'not any', [['name', '=', 'c']]]])).toBe(0);
    await env.model('res.partner').browse(p).write({ tag_ids: false });
    expect((await one('res.partner', p, ['tag_ids'])).tag_ids).toEqual([]);
  });

  it('rejects a self many2many without explicit relation columns', () => {
    expect(() => resolveModels([{ name: 'a.b', origin: 'module', fields: { x: { type: 'many2many', comodel: 'a.b' } } }]))
      .toThrow(/relationTable, column1 and column2/);
  });
});

describe('one2many commands + stored compute', () => {
  it('creates lines inline and computes the stored total chain', async () => {
    const so = await env.model('sale.order').create({
      name: 'SO1', line_ids: [{ op: 'create', values: { qty: 2, price: 10 } }, { op: 'create', values: { qty: 1, price: 5 } }],
    });
    expect(await one('sale.order', so.ids[0], ['amount', 'amount_tax', 'line_count']))
      .toMatchObject({ amount: 25, amount_tax: expect.closeTo(1.75), line_count: 2 });
  });

  it('recomputes when a line changes, is added, moved or deleted', async () => {
    const [a, b] = (await env.model('sale.order').create([{ name: 'A' }, { name: 'B' }])).ids;
    const [l1, l2] = (await env.model('sale.line').create([{ order_id: a, qty: 1, price: 100 }, { order_id: a, qty: 1, price: 1 }])).ids;
    expect((await one('sale.order', a, ['amount'])).amount).toBe(101);

    await env.model('sale.line').browse(l1).write({ qty: 3 });
    expect((await one('sale.order', a, ['amount'])).amount).toBe(301);

    await env.model('sale.line').browse(l2).write({ order_id: b }); // move: both orders change
    expect((await one('sale.order', a, ['amount'])).amount).toBe(300);
    expect((await one('sale.order', b, ['amount'])).amount).toBe(1);

    await env.model('sale.line').browse(l1).unlink();
    expect((await one('sale.order', a, ['amount', 'amount_tax'])).amount_tax).toBe(0);

    await env.model('sale.order').browse(b).write({ line_ids: [{ op: 'update', id: l2, values: { price: 4 } }] });
    expect((await one('sale.order', b, ['amount'])).amount).toBe(4);
  });

  it('refuses to edit a line through another parent', async () => {
    const [a, b] = (await env.model('sale.order').create([{ name: 'X' }, { name: 'Y' }])).ids;
    const [l] = (await env.model('sale.line').create({ order_id: a })).ids;
    await expect(env.model('sale.order').browse(b).write({ line_ids: [{ op: 'delete', id: l }] })).rejects.toThrow(/not a line of/);
  });

  it('unlink command deletes lines whose inverse is required', async () => {
    const so = await env.model('sale.order').create({ name: 'U', line_ids: [{ op: 'create', values: { qty: 1 } }] });
    const [l] = (await one('sale.order', so.ids[0], ['line_ids'])).line_ids as number[];
    await so.write({ line_ids: [{ op: 'unlink', id: l }] });
    expect(await env.model('sale.line').searchCount([['id', '=', l]])).toBe(0);
  });

  it('rejects writing computed fields and malformed commands', async () => {
    await expect(env.model('sale.order').create({ name: 'Z', amount: 5 })).rejects.toThrow(/computed/);
    await expect(env.model('sale.order').create({ name: 'Z', line_ids: [{ op: 'boom' }] })).rejects.toThrow(/Invalid command/);
  });
});

describe('related fields', () => {
  it('reads and searches a non-stored related many2one; stores a related char', async () => {
    const [th] = (await env.model('res.country').create({ code: 'TH' })).ids;
    const [p] = (await env.model('res.partner').create({ name: 'Ann', country_id: th })).ids;
    const [so] = (await env.model('sale.order').create({ name: 'R', partner_id: p })).ids;
    expect(await one('sale.order', so, ['country_id', 'partner_name'])).toMatchObject({ country_id: th, partner_name: 'Ann' });
    expect((await env.model('sale.order').search([['country_id.code', '=', 'TH']])).ids).toEqual([so]);

    await env.model('res.partner').browse(p).write({ name: 'Anna' });
    expect((await one('sale.order', so, ['partner_name'])).partner_name).toBe('Anna');
  });

  it('validates related type', () => {
    const bad: ModelDef = { name: 'q.q', origin: 'module', fields: {
      p: { type: 'many2one', comodel: 'res.partner' }, n: { type: 'integer', related: 'p.name' },
    } };
    expect(() => resolveModels([...models, bad])).toThrow(/is integer but/);
  });
});

describe('constraints', () => {
  it('maps SQL check and code constraints to ValidationError, rolling back', async () => {
    const [so] = (await env.model('sale.order').create({ name: 'C' })).ids;
    await expect(env.model('sale.line').create({ order_id: so, price: -1 })).rejects.toThrow(ValidationError);
    await expect(env.model('sale.line').create({ order_id: so, qty: 5000 })).rejects.toThrow('qty too large');
    expect(await env.model('sale.line').searchCount([['order_id', '=', so]])).toBe(0);
  });
});

describe('onchange', () => {
  it('chains handlers and returns only the patch', async () => {
    expect(await env.model('sale.order').onchange({ partner_id: 7 }, 'partner_id')).toEqual({ name: 'SO for 7', note: 'SO for 7!' });
  });
});

describe('review regressions (T3/T4)', () => {
  it("'!' includes NULL rows like Odoo", async () => {
    const t = (await env.model('res.tag').create([{ name: 'neg' }, {}])).ids;
    const ids = (await env.model('res.tag').search(['!', ['name', '=', 'neg']])).ids;
    expect(ids).toContain(t[1]);
    expect(ids).not.toContain(t[0]);
  });

  it('rejects two models mapping to one table', () => {
    expect(() => resolveModels([
      { name: 'x_foo.bar', origin: 'custom', fields: {} }, { name: 'x_foo_bar', origin: 'custom', fields: {} },
    ])).toThrow(/both map to table/);
  });

  it('unique indexes on look-alike table/column pairs do not collide; invalid order is rejected', async () => {
    const h = await mgr.open('rel');
    const store = MetadataStore.for(h);
    await store.createModel({ name: 'x_a', fields: { x_b_c: { type: 'char', unique: true } } });
    await store.createModel({ name: 'x_a_x_b', fields: { c: { type: 'char', unique: true } } as never }).catch(() => undefined);
    await store.createModel({ name: 'x_a_x_b', fields: { x_c: { type: 'char', unique: true } } });
    await store.addField('x_a_x_b', 'x_b_c', { type: 'char', unique: true });
    const e2 = h.env({ uid: 1 });
    await e2.model('x_a').create({ x_b_c: 'dup' });
    await expect(e2.model('x_a').create({ x_b_c: 'dup' })).rejects.toThrow(ValidationError);
    await e2.model('x_a_x_b').create({ x_b_c: 'dup' });
    await expect(e2.model('x_a_x_b').create({ x_b_c: 'dup' })).rejects.toThrow(ValidationError);

    await expect(store.createModel({ name: 'x_bad_order', order: 'nope desc' })).rejects.toThrow(EngineError);
    expect(h.registry.models.has('x_bad_order')).toBe(false);
  });
});
