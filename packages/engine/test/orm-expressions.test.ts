import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgliteTenantManager, resolveModels, type Env, type ModelDef } from '../src/index.js';

const models: ModelDef[] = [{ name: 'expr.partner', origin: 'module', fields: { name: { type: 'char' } } }, {
  name: 'expr.line', origin: 'module', fields: { item_id: { type: 'many2one', comodel: 'expr.item' }, amount: { type: 'integer' } },
}, {
  name: 'expr.item', origin: 'module',
  fields: {
    name: { type: 'char', defaultExpr: "context.default_name or 'Untitled'" },
    amount: { type: 'integer', default: 2 },
    doubled: { type: 'integer', computeExpr: 'amount * 2', store: true },
    label: { type: 'char', computeExpr: "record.name + '!'" },
    note: { type: 'char' },
    partner_id: { type: 'many2one', comodel: 'expr.partner' },
    lines: { type: 'one2many', comodel: 'expr.line', inverseName: 'item_id' },
    partner_name: { type: 'char', computeExpr: "record.partner_id.name or 'n/a'" },
    line_total: { type: 'integer', computeExpr: "record.lines.sum('amount')" },
  },
  onchange: { name: "[['note', record.name + '!']]" },
  constraints: [{ name: 'nonnegative', expression: 'amount >= 0', fields: ['name'], message: 'amount must be nonnegative' }],
}];

let manager: PgliteTenantManager;
let env: Env;
beforeAll(async () => {
  manager = new PgliteTenantManager({ models: async () => models });
  env = (await manager.open('expr-orm')).env({ uid: 1 });
}, 60_000);
afterAll(() => manager.closeAll());

describe('ORM NX-Expr hooks', () => {
  it('derives stored dependencies, computes on writes, and evaluates nonstored fields', async () => {
    expect(resolveModels(models).get('expr.item')!.fields.get('doubled')!.depends).toEqual(['amount']);
    const [id] = (await env.model('expr.item').create({ name: 'A', amount: 3 })).ids;
    expect((await env.model('expr.item').browse(id).read(['doubled', 'label', 'partner_name', 'line_total']))[0])
      .toMatchObject({ doubled: 6, label: 'A!', partner_name: 'n/a', line_total: 0 });
    await env.model('expr.line').create([{ item_id: id, amount: 3 }, { item_id: id, amount: 4 }]);
    expect((await env.model('expr.item').browse(id).read(['line_total']))[0].line_total).toBe(7);
    await env.model('expr.item').browse(id).write({ amount: 5 });
    expect((await env.model('expr.item').browse(id).read(['doubled']))[0].doubled).toBe(10);
  });

  it('evaluates defaults, onchange patches, and expression constraints', async () => {
    const defaults = await env.withContext({ default_name: 'From context' }).model('expr.item').defaultGet(['name']);
    expect(defaults.name).toBe('From context');
    expect(await env.model('expr.item').onchange({ name: 'Draft' }, 'name')).toEqual({ note: 'Draft!' });
    await expect(env.model('expr.item').create({ amount: -1 })).rejects.toThrow('amount must be nonnegative');
  });

  it('fails closed for stored expressions with identity or restricted dependencies', () => {
    expect(() => resolveModels([{ ...models[0]!, onchange: {}, constraints: [], fields: { amount: { type: 'integer' }, total: { type: 'integer', store: true, computeExpr: 'record.amount + user.id' } } }]))
      .toThrow(/identity, context, time, or helper/);
    expect(() => resolveModels([{ ...models[0]!, onchange: {}, constraints: [], fields: { secret: { type: 'integer', groups: ['private'] }, total: { type: 'integer', store: true, computeExpr: 'record.secret + 1' } } }]))
      .toThrow(/unrestricted local scalar column/);
    expect(() => resolveModels([{ ...models[0]!, onchange: {}, constraints: [], fields: { a: { type: 'integer', computeExpr: 'record.b' }, b: { type: 'integer', computeExpr: 'record.a' } } }]))
      .toThrow(/dependency cycle/);
    expect(() => resolveModels([{ name: 'expr.default', origin: 'module', fields: { amount: { type: 'integer' }, bad: { type: 'integer', defaultExpr: 'amount + 1' } } }]))
      .toThrow(/cannot depend on record fields/);
  });

  it('rejects cross-record expression constraint dependencies atomically', () => {
    const withConstraint = (constraint: NonNullable<ModelDef['constraints']>[number]) => resolveModels([
      ...models.slice(0, 2), { ...models[2]!, constraints: [constraint] },
    ]);
    expect(() => withConstraint({ name: 'partner_name', expression: "record.partner_id.name == 'ok'" }))
      .toThrow(/must be a local/);
    expect(() => withConstraint({ name: 'partner_set', expression: 'record.partner_id != null' }))
      .toThrow(/must be a local stored scalar column/);
    expect(() => withConstraint({ name: 'whole_record', expression: 'record' }))
      .toThrow(/explicit local fields/);
    expect(() => withConstraint({ name: 'audit_derived', expression: 'write_date == null' }))
      .toThrow(/must be a local stored scalar column/);
    expect(() => withConstraint({ name: 'stored_expr', expression: 'doubled >= 0' }))
      .not.toThrow();
  });
});
