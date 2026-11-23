import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgliteTenantManager, compileDomain, resolveModels, type Domain, type Env, type ModelDef } from '../src/index.js';

const models: ModelDef[] = [
  { name: 'res.country', origin: 'module', fields: { code: { type: 'char' } } },
  {
    name: 'res.partner', origin: 'module',
    fields: {
      name: { type: 'char' },
      parent_id: { type: 'many2one', comodel: 'res.partner' },
      country_id: { type: 'many2one', comodel: 'res.country' },
    },
  },
  {
    name: 'sale.order', origin: 'module',
    fields: {
      name: { type: 'char' },
      partner_id: { type: 'many2one', comodel: 'res.partner' },
      line_ids: { type: 'one2many', comodel: 'sale.line', inverseName: 'order_id' },
    },
  },
  {
    name: 'sale.line', origin: 'module',
    fields: {
      order_id: { type: 'many2one', comodel: 'sale.order', ondelete: 'cascade' },
      product: { type: 'char' },
      qty: { type: 'float' },
    },
  },
];

let mgr: PgliteTenantManager;
let env: Env;
const id: Record<string, number> = {};

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  env = (await mgr.open('domain')).env({ uid: 1 });
  const C = env.model('res.country');
  const P = env.model('res.partner');
  [id.TH] = (await C.create({ code: 'TH' })).ids;
  [id.JP] = (await C.create({ code: 'JP' })).ids;
  // hierarchy: acme > (acme-bkk > desk), acme-osaka ; solo has no parent
  [id.acme] = (await P.create({ name: 'acme', country_id: id.TH })).ids;
  [id.bkk] = (await P.create({ name: 'acme-bkk', parent_id: id.acme, country_id: id.TH })).ids;
  [id.desk] = (await P.create({ name: 'desk', parent_id: id.bkk })).ids;
  [id.osaka] = (await P.create({ name: 'acme-osaka', parent_id: id.acme, country_id: id.JP })).ids;
  [id.solo] = (await P.create({ name: 'solo' })).ids;
  const O = env.model('sale.order');
  const L = env.model('sale.line');
  [id.so1] = (await O.create({ name: 'SO1', partner_id: id.bkk })).ids;
  [id.so2] = (await O.create({ name: 'SO2', partner_id: id.osaka })).ids;
  [id.so3] = (await O.create({ name: 'SO3' })).ids; // no partner, no lines
  await L.create([
    { order_id: id.so1, product: 'pen', qty: 5 },
    { order_id: id.so1, product: 'ink', qty: 1 },
    { order_id: id.so2, product: 'pen', qty: 50 },
  ]);
}, 60_000);

afterAll(() => mgr.closeAll());

const names = async (model: string, d: Domain) =>
  (await env.model(model).searchRead(d, ['name'], { order: 'id asc' })).map((r) => r.name);

describe('dotted paths (many2one chains)', () => {
  it('follows many2one twice', async () => {
    expect(await names('sale.order', [['partner_id.country_id.code', '=', 'TH']])).toEqual(['SO1']);
  });
  it('negative operator on a path keeps Odoo "any" semantics (rows without partner excluded)', async () => {
    expect(await names('sale.order', [['partner_id.name', '!=', 'acme-bkk']])).toEqual(['SO2']);
  });
  it('combines with or/not', async () => {
    expect(await names('sale.order', ['|', ['partner_id.country_id.code', '=', 'JP'], ['partner_id', '=', false]]))
      .toEqual(['SO2', 'SO3']);
  });
});

describe('one2many', () => {
  it('path through one2many uses EXISTS', async () => {
    expect(await names('sale.order', [['line_ids.qty', '>', 10]])).toEqual(['SO2']);
  });
  it('any / not any with a subdomain', async () => {
    expect(await names('sale.order', [['line_ids', 'any', [['product', '=', 'ink']]]])).toEqual(['SO1']);
    expect(await names('sale.order', [['line_ids', 'not any', [['product', '=', 'ink']]]])).toEqual(['SO2', 'SO3']);
  });
  it('= false means empty, != false means non-empty', async () => {
    expect(await names('sale.order', [['line_ids', '=', false]])).toEqual(['SO3']);
    expect(await names('sale.order', [['line_ids', '!=', false]])).toEqual(['SO1', 'SO2']);
  });
});

describe('many2one any / not any', () => {
  it('not any includes rows with no value', async () => {
    expect(await names('sale.order', [['partner_id', 'not any', [['country_id.code', '=', 'TH']]]])).toEqual(['SO2', 'SO3']);
  });
});

describe('hierarchy', () => {
  it('child_of on id includes self and all descendants', async () => {
    expect(await names('res.partner', [['id', 'child_of', id.acme]])).toEqual(['acme', 'acme-bkk', 'desk', 'acme-osaka']);
  });
  it('child_of through a many2one', async () => {
    expect(await names('sale.order', [['partner_id', 'child_of', [id.acme]]])).toEqual(['SO1', 'SO2']);
  });
  it('parent_of returns ancestors', async () => {
    expect(await names('res.partner', [['id', 'parent_of', id.desk]])).toEqual(['acme', 'acme-bkk', 'desk']);
  });
  it('survives cycles', async () => {
    await env.model('res.partner').browse(id.acme).write({ parent_id: id.desk }); // acme > bkk > desk > acme
    expect((await names('res.partner', [['id', 'child_of', id.bkk]])).sort()).toEqual(['acme', 'acme-bkk', 'acme-osaka', 'desk']);
    await env.model('res.partner').browse(id.acme).write({ parent_id: false });
  });
});

describe('compiler safety', () => {
  const all = resolveModels(models);
  const reg = { models: all, get: (n: string) => all.get(n)!, reload: async () => undefined };
  const order = all.get('sale.order')!;

  it('parameterizes every value, including ids for child_of', () => {
    const params: unknown[] = [];
    const sql = compileDomain(reg, order, [['partner_id.name', 'ilike', "x' OR 1=1 --"], ['partner_id', 'child_of', [1]]], params);
    expect(sql).not.toContain("x'");
    expect(params).toEqual(["%x' OR 1=1 --%", [1]]);
  });

  it('rejects bad paths and ids', () => {
    expect(() => compileDomain(reg, order, [['name.foo', '=', 1]], [])).toThrow(/not relational/);
    expect(() => compileDomain(reg, order, [['partner_id.nope', '=', 1]], [])).toThrow(/Unknown field/);
    expect(() => compileDomain(reg, order, [['partner_id', 'child_of', ['1; drop']]], [])).toThrow(/record ids/);
    expect(() => compileDomain(reg, order, [['name', 'child_of', [1]]], [])).toThrow(/many2one/);
    expect(() => compileDomain(reg, order, [['line_ids', 'in', ['x']]], [])).toThrow(/record ids/);
    expect(() => compileDomain(reg, order, [['name', 'bogus' as never, 1]], [])).toThrow(/Unknown domain operator/);
  });

  it('limits nesting depth', () => {
    let d: Domain = [['name', '=', 'x']];
    for (let i = 0; i < 40; i++) d = [['line_ids', 'any', [['order_id', 'any', d]]]];
    expect(() => compileDomain(reg, order, d, [])).toThrow(/too deeply/);
  });
});
