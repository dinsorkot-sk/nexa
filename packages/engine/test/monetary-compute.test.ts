import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MetadataStore, ModuleCatalog, PgliteTenantManager, baseModule, resolveModels,
  type Env, type ModelDef, type ModuleManifest, type TenantHandle,
} from '../src/index.js';
import { createExpressionHelpers, evaluateExpression } from '../src/expr/index.js';

const models: ModelDef[] = [
  { name: 'mc.currency', origin: 'module', fields: { rounding: { type: 'float', required: true } } },
  {
    name: 'mc.order', origin: 'module', fields: {
      currency_id: { type: 'many2one', comodel: 'mc.currency', required: true },
      line_ids: { type: 'one2many', comodel: 'mc.line', inverseName: 'order_id' },
      total: { type: 'monetary', currencyField: 'currency_id', store: true, computeExpr: "line_ids.sum('amount')" },
    },
  },
  {
    name: 'mc.line', origin: 'module', fields: {
      order_id: { type: 'many2one', comodel: 'mc.order' },
      currency_id: { type: 'many2one', comodel: 'mc.currency', required: true },
      qty: { type: 'float', default: 1 }, price: { type: 'float', default: 0 },
      precision_name: { type: 'char' },
      amount: { type: 'monetary', currencyField: 'currency_id', store: true, computeExpr: 'qty * price' },
      preview: { type: 'monetary', currencyField: 'currency_id', computeExpr: 'qty * price' },
      code_amount: {
        type: 'monetary', currencyField: 'currency_id', store: true, depends: ['qty', 'price'],
        compute: async (rs) => new Map((await rs.read(['qty', 'price'])).map((r) => [r.id as number, Number(r.qty) * Number(r.price)])),
      },
      rounded: { type: 'float', store: true, computeExpr: 'float_round(qty * price, currency_id.rounding)' },
      zero: { type: 'boolean', store: true, computeExpr: 'float_is_zero(price, currency_id.rounding)' },
      comparison: { type: 'integer', store: true, computeExpr: 'float_compare(price, 0, null, currency_id.rounding)' },
      // Trigger-only currency rounding must preserve this expression's raw many2one id.
      currency_label: { type: 'monetary', currencyField: 'currency_id', store: true, computeExpr: 'currency_id' },
    },
  },
];
const module: ModuleManifest = { name: 'mc_test', version: '1.0.0', depends: ['base'], models };
let manager: PgliteTenantManager;
let h: TenantHandle;
let env: Env;
beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, module]) });
  h = await manager.create('monetary-compute', ['mc_test']);
  env = h.env({ uid: 1 });
}, 120_000);
afterAll(() => manager.closeAll());

describe('computed monetary fields', () => {
  it('rounds expression, code and preview values and propagates rounded line totals', async () => {
    const [currency] = (await env.model('mc.currency').create({ rounding: 0.05 })).ids as [number];
    const [order] = (await env.model('mc.order').create({ currency_id: currency })).ids as [number];
    const [positive, negative] = (await env.model('mc.line').create([
      { order_id: order, currency_id: currency, price: 1.025 },
      { order_id: order, currency_id: currency, price: -1.025 },
    ])).ids as [number, number];
    expect((await env.model('mc.line').browse(positive).read(['amount', 'code_amount', 'preview', 'rounded']))[0])
      .toMatchObject({ amount: 1.05, code_amount: 1.05, preview: 1.05, rounded: 1.05 });
    expect((await env.model('mc.line').browse(negative).read(['amount', 'code_amount', 'preview']))[0])
      .toMatchObject({ amount: -1.05, code_amount: -1.05, preview: -1.05 });
    expect((await env.model('mc.order').browse(order).read(['total']))[0]!.total).toBe(0);
    await env.model('mc.line').browse(negative).write({ price: 2.025 });
    expect((await env.model('mc.order').browse(order).read(['total']))[0]!.total).toBe(3.1);
  });

  it('recomputes when the currency or its rounding changes, including code computes', async () => {
    const [cent, nickel] = (await env.model('mc.currency').create([{ rounding: 0.01 }, { rounding: 0.05 }])).ids as [number, number];
    const [id] = (await env.model('mc.line').create({ currency_id: cent, price: 1.025 })).ids as [number];
    const read = () => h.env({ uid: 1 }).model('mc.line').browse(id).read(['amount', 'code_amount', 'preview', 'rounded', 'currency_label']);
    expect((await read())[0]).toMatchObject({ amount: 1.03, code_amount: 1.03, preview: 1.03, rounded: 1.03, currency_label: cent });
    await env.model('mc.line').browse(id).write({ currency_id: nickel });
    expect((await read())[0]).toMatchObject({ amount: 1.05, code_amount: 1.05, preview: 1.05, rounded: 1.05, currency_label: nickel });
    await env.model('mc.currency').browse(nickel).write({ rounding: 0.1 });
    expect((await read())[0]).toMatchObject({ amount: 1, code_amount: 1, preview: 1, rounded: 1 });
  });

  it('evaluates zero and comparison with value rounding, and initializes metadata monetary computes', async () => {
    const [currency] = (await env.model('mc.currency').create({ rounding: 0.01 })).ids as [number];
    const [id] = (await env.model('mc.line').create({ currency_id: currency, price: 0.004 })).ids as [number];
    expect((await env.model('mc.line').browse(id).read(['zero', 'comparison']))[0]).toMatchObject({ zero: true, comparison: 0 });
    await MetadataStore.for(h).addField('mc.line', 'x_amount', { type: 'monetary', currencyField: 'currency_id', computeExpr: 'price + 1.021', store: true });
    expect((await h.env({ uid: 1 }).model('mc.line').browse(id).read(['x_amount']))[0]!.x_amount).toBe(1.03);
    await h.env({ uid: 1 }).model('mc.currency').browse(currency).write({ rounding: 0.05 });
    expect((await h.env({ uid: 1 }).model('mc.line').browse(id).read(['x_amount']))[0]!.x_amount).toBe(1.05);
  });

  it('rolls back invalid rounding configuration and computed values', async () => {
    const [currency] = (await env.model('mc.currency').create({ rounding: 0.01 })).ids as [number];
    await h.env({ uid: 1 }).model('mc.line').create({ currency_id: currency, price: 1.025 });
    await expect(h.env({ uid: 1 }).model('mc.currency').browse(currency).write({ rounding: 0 })).rejects.toThrow(/Invalid monetary|Rounding increment/);
    expect((await h.env({ uid: 1 }).model('mc.currency').browse(currency).read(['rounding']))[0]!.rounding).toBe(0.01);
  });
});

describe('pure float helper forms', () => {
  it('preserves digits and supports fractional and explicit integer increments', () => {
    const scope = createExpressionHelpers();
    expect(evaluateExpression('float_round(1.005, 2)', scope)).toBe(1.01);
    expect(evaluateExpression('float_round(-1.025, 0.05)', scope)).toBe(-1.05);
    expect(evaluateExpression('float_round(12.5, null, 5)', scope)).toBe(15);
    expect(evaluateExpression('float_compare(12, 10, null, 5)', scope)).toBe(0);
    expect(evaluateExpression('float_is_zero(0.004, 0.01)', scope)).toBe(true);
  });

  it('accepts numeric stored precision expressions and refuses names or string-valued paths', () => {
    const probe = (computeExpr: string) => resolveModels(models.map((m) => m.name === 'mc.line'
      ? { ...m, fields: { ...m.fields, probe: { type: 'float', store: true, computeExpr } } } : m));
    for (const expr of ['float_round(price, 2)', 'float_round(price, currency_id.rounding)', 'float_round(price, null, 5)', 'float_round(price, 1 + 1)', 'float_round(price)']) {
      expect(() => probe(expr), expr).not.toThrow();
    }
    for (const expr of ["float_round(price, 'Product Price')", 'float_round(price, precision_name)', "float_round(price, 'Product Price', null)", "float_round(price, [precision_name].min())", 'float_round(price, user.id)']) {
      expect(() => probe(expr), expr).toThrow(/stored expression/);
    }
  });
});
