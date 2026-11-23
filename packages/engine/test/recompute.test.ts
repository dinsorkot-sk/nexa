import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EngineError, MetadataStore, PgliteTenantManager, ValidationError, resolveModels,
  type Env, type ModelDef, type Recordset, type TenantHandle,
} from '../src/index.js';

const countOf = (field: string) => async (rs: Recordset) =>
  new Map((await rs.read([field])).map((r) => [r.id as number, (r[field] as number[]).length]));

const models: ModelDef[] = [
  {
    name: 'res.tag', origin: 'module',
    fields: {
      name: { type: 'char' },
      partner_ids: { type: 'many2many', comodel: 'res.partner', relationTable: 'res_partner_res_tag_rel', column1: 'res_tag_id', column2: 'res_partner_id' },
      partner_count: { type: 'integer', store: true, depends: ['partner_ids'], compute: countOf('partner_ids') },
    },
  },
  {
    name: 'res.partner', origin: 'module',
    fields: {
      name: { type: 'char' },
      tag_ids: { type: 'many2many', comodel: 'res.tag' },
      tag_count: { type: 'integer', store: true, depends: ['tag_ids'], compute: countOf('tag_ids') },
    },
  },
  {
    name: 'product', origin: 'module',
    fields: {
      name: { type: 'char' },
      line_ids: { type: 'one2many', comodel: 'order.line', inverseName: 'product_id' },
      qty_sold: {
        type: 'float', store: true, depends: ['line_ids.qty'],
        compute: async (rs) => {
          const out = new Map<number, number>();
          for (const p of await rs.read(['line_ids'])) {
            const lines = await rs.env.model('order.line').browse(p.line_ids as number[]).read(['qty']);
            out.set(p.id as number, lines.reduce((s, l) => s + (l.qty as number), 0));
          }
          return out;
        },
      },
    },
  },
  {
    name: 'order', origin: 'module',
    fields: {
      line_ids: { type: 'one2many', comodel: 'order.line', inverseName: 'order_id' },
      total: {
        type: 'float', store: true, depends: ['line_ids.qty'],
        compute: async (rs) => {
          const out = new Map<number, number>();
          for (const o of await rs.read(['line_ids'])) {
            const lines = await rs.env.model('order.line').browse(o.line_ids as number[]).read(['qty']);
            out.set(o.id as number, lines.reduce((s, l) => s + (l.qty as number), 0));
          }
          return out;
        },
      },
    },
    constraints: [{ name: 'total_cap', fields: ['total'], check: async (rs) => {
      for (const o of await rs.read(['total'])) if ((o.total as number) > 100) throw new ValidationError('order total over 100');
    } }],
  },
  {
    name: 'order.line', origin: 'module',
    fields: {
      order_id: { type: 'many2one', comodel: 'order', ondelete: 'cascade', required: true },
      product_id: { type: 'many2one', comodel: 'product' },
      qty: { type: 'float' },
    },
    constraints: [{ name: 'qty_pos', sql: 'CHECK (qty >= 0)' }],
  },
  {
    name: 'category', origin: 'module',
    fields: {
      name: { type: 'char' },
      parent_id: { type: 'many2one', comodel: 'category' },
      complete_name: {
        type: 'char', store: true, depends: ['name', 'parent_id.complete_name'],
        compute: async (rs) => {
          const out = new Map<number, string>();
          for (const c of await rs.read(['name', 'parent_id'])) {
            const parent = c.parent_id ? (await rs.env.model('category').browse(c.parent_id as number).read(['complete_name']))[0].complete_name : null;
            out.set(c.id as number, parent ? `${String(parent)} / ${String(c.name)}` : String(c.name));
          }
          return out;
        },
      },
    },
  },
];

let mgr: PgliteTenantManager;
let h: TenantHandle;
let env: Env;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  h = await mgr.open('recompute');
  env = h.env({ uid: 1 });
}, 60_000);
afterAll(() => mgr.closeAll());

const val = async (model: string, id: number, f: string) => (await env.model(model).browse(id).read([f]))[0][f];

describe('relation table safety (review B1)', () => {
  it('custom fields cannot choose relation tables', async () => {
    await expect(MetadataStore.for(h).addField('res.partner', 'x_hack', {
      type: 'many2many', comodel: 'res.tag', relationTable: 'nx_field', column1: 'id', column2: 'model',
    } as never)).rejects.toThrow(/cannot choose its relation table/);
  });
  it('rejects engine tables and inconsistent shared relation tables', () => {
    const base = models.slice(0, 2);
    expect(() => resolveModels([...base, { name: 'z', origin: 'module', fields: {
      t: { type: 'many2many', comodel: 'res.tag', relationTable: 'nx_field', column1: 'a', column2: 'b' },
    } }])).toThrow(/engine table/);
    expect(() => resolveModels([...base, { name: 'z', origin: 'module', fields: {
      t: { type: 'many2many', comodel: 'res.tag', relationTable: 'res_partner_res_tag_rel', column1: 'z_id', column2: 'res_tag_id' },
    } }])).toThrow(/different tables\/columns/);
  });
});

describe('custom field on a module model with SQL constraints (review B2)', () => {
  it('keeps the module origin so its SQL constraints still apply', async () => {
    await MetadataStore.for(h).addField('order.line', 'x_note', { type: 'char' });
    expect(h.registry.get('order.line').def.origin).toBe('module');
    const [o] = (await env.model('order').create({})).ids;
    await expect(env.model('order.line').create({ order_id: o, qty: -1, x_note: 'n' })).rejects.toThrow(ValidationError);
  });
});

describe('many2many recompute (review B3)', () => {
  it('recomputes the reverse side and after deleting a linked record', async () => {
    const [t1, t2] = (await env.model('res.tag').create([{ name: 'a' }, { name: 'b' }])).ids;
    const [p] = (await env.model('res.partner').create({ name: 'P', tag_ids: [t1, t2] })).ids;
    expect(await val('res.partner', p, 'tag_count')).toBe(2);
    expect(await val('res.tag', t1, 'partner_count')).toBe(1); // reverse side, same relation table

    await env.model('res.partner').browse(p).write({ tag_ids: [{ op: 'unlink', id: t1 }] });
    expect(await val('res.tag', t1, 'partner_count')).toBe(0);

    await env.model('res.tag').browse(t2).unlink(); // FK cascade removes the relation row
    expect(await val('res.partner', p, 'tag_count')).toBe(0);
  });
});

describe('cascade delete recompute (review B4)', () => {
  it('recomputes dependents of rows deleted by ON DELETE CASCADE', async () => {
    const [prod] = (await env.model('product').create({ name: 'pen' })).ids;
    const [o] = (await env.model('order').create({ line_ids: [{ op: 'create', values: { product_id: prod, qty: 7 } }] })).ids;
    expect(await val('product', prod, 'qty_sold')).toBe(7);
    await env.model('order').browse(o).unlink();
    expect(await val('product', prod, 'qty_sold')).toBe(0);
  });
});

describe('deep hierarchy (review B5)', () => {
  it('propagates through a 25-level tree', async () => {
    let parent: number | false = false;
    const ids: number[] = [];
    for (let i = 0; i < 25; i++) {
      const [id] = (await env.model('category').create({ name: `c${i}`, parent_id: parent })).ids;
      ids.push(id);
      parent = id;
    }
    await env.model('category').browse(ids[0]).write({ name: 'ROOT' });
    expect(String(await val('category', ids[24], 'complete_name'))).toMatch(/^ROOT \/ c1 \/ .* \/ c24$/);
  });
});

describe('constraints on recomputed values (review B6)', () => {
  it('rejects a change that pushes a computed field past its constraint, and rolls back', async () => {
    const [o] = (await env.model('order').create({ line_ids: [{ op: 'create', values: { qty: 60 } }] })).ids;
    await expect(env.model('order.line').create({ order_id: o, qty: 50 })).rejects.toThrow('order total over 100');
    expect(await val('order', o, 'total')).toBe(60);
    expect(await env.model('order.line').searchCount([['order_id', '=', o]])).toBe(1);
  });

  it('still reports genuine cycles instead of looping forever', async () => {
    // a and b each depend on the other and always change: a true cycle
    let n = 0;
    const bump = async (rs: Recordset) => new Map(rs.ids.map((id) => [id, ++n]));
    const cyc = new PgliteTenantManager({ models: async () => [{
      name: 'cyc', origin: 'module', fields: {
        seed: { type: 'integer' },
        a: { type: 'integer', store: true, depends: ['seed', 'b'], compute: bump },
        b: { type: 'integer', store: true, depends: ['a'], compute: bump },
      },
    }] });
    try {
      const e = (await cyc.open('cyc')).env({ uid: 1 });
      await expect(e.model('cyc').create({ seed: 1 })).rejects.toThrow(EngineError);
      expect(await e.model('cyc').searchCount([])).toBe(0);
    } finally {
      await cyc.closeAll();
    }
  });
});
