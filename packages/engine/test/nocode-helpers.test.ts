/**
 * T34b: NX-Expr helpers for no-code apps: sequence_next (GAP-SEQ-1), pricelist_price / uom_convert /
 * tax_compute (GAP-PRIM-1) and relational paths in server-action expressions (GAP-REL-1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, ButtonService, ModuleCatalog, PgliteTenantManager, ServerActionService, baseModule, evaluateEnvExpression, isImpureHelper,
  type Env, type ModuleManifest, type TenantHandle,
} from '../src/index.js';
import { accountCoreModule } from '../src/account-core/manifest.js';
import { productModule } from '../src/product/index.js';
import { uomModule } from '../src/uom/index.js';

const all = { read: true, write: true, create: true, unlink: true };
const testModule: ModuleManifest = {
  name: 'ncs_helpers', version: '1.0.0', summary: 'helper tests', depends: ['product', 'account_core'],
  models: [{
    name: 'ncs.order', origin: 'module', fields: {
      name: { type: 'char', defaultExpr: "sequence_next('ncs.order')" },
      partner_id: { type: 'many2one', comodel: 'res.partner' },
      product_id: { type: 'many2one', comodel: 'product.product' },
      sequence_id: { type: 'many2one', comodel: 'ir.sequence' },
      note: { type: 'char' },
      price: { type: 'float' },
      // a read-only evaluation must not draw numbers
      peek: { type: 'char', computeExpr: "sequence_next('ncs.order')" },
      line_ids: { type: 'one2many', comodel: 'ncs.line', inverseName: 'order_id' },
      main_line_id: { type: 'many2one', comodel: 'ncs.line' },
    },
    onchange: { note: "[['name', sequence_next('ncs.order')]]" },
  }, {
    name: 'ncs.line', origin: 'module', fields: {
      order_id: { type: 'many2one', comodel: 'ncs.order', required: true },
      amount: { type: 'float' },
      secret: { type: 'boolean' },
    },
  }, {
    name: 'ncs.locked', origin: 'module', fields: { name: { type: 'char' }, note: { type: 'char' } },
    onchange: { name: "[['note', name]]" },
  }],
  access: [
    { model: 'ncs.order', group: 'base.group_user', perms: all },
    { model: 'ncs.line', group: 'base.group_user', perms: all },
    { model: 'ncs.locked', group: 'base.group_system', perms: all },
  ],
  rules: [{ name: 'ncs_line_public', model: 'ncs.line', groups: ['base.group_user'], perms: all, domain: [['secret', '=', false]] }],
};

let manager: PgliteTenantManager;
let handle: TenantHandle;
let root: Env;
let user: Env;
const ids: Record<string, number> = {};

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, uomModule, productModule, accountCoreModule, testModule]) });
  handle = await manager.create('nocode-helpers', ['ncs_helpers']);
  root = handle.env({ uid: 1 });
  const add = async (model: string, values: Record<string, unknown>) => (await root.model(model).create(values)).ids[0]!;
  ids.usd = (await root.withContext({ activeTest: false }).model('res.currency').search([['name', '=', 'USD']])).ids[0]!;
  await root.model('res.currency').browse(ids.usd).write({ active: true });
  const [company] = await root.model('res.company').searchRead([], ['id'], { limit: 1 });
  ids.company = company!.id as number;
  await root.model('res.company').browse(ids.company).write({ currency_id: ids.usd });
  ids.companyB = await add('res.company', { name: 'B', currency_id: ids.usd });
  const [group] = await root.model('res.groups').searchRead([['code', '=', 'base.group_user']], ['id']);
  ids.user = await add('res.users', {
    name: 'Seller', login: 'seller', company_id: ids.company, company_ids: [{ op: 'set', ids: [ids.company] }], group_ids: [{ op: 'set', ids: [group!.id] }],
  });
  user = handle.env({ uid: ids.user });
  ids.seqGlobal = await add('ir.sequence', { name: 'Orders', code: 'ncs.order', prefix: 'SO/%(year)s/', padding: 5, use_date_range: true, date_range_period: 'year' });
  ids.seqB = await add('ir.sequence', { name: 'Orders B', code: 'ncs.order', prefix: 'B/', padding: 3, company_id: ids.companyB });

  const cat = await add('uom.category', { name: 'Unit' });
  ids.unit = await add('uom.uom', { name: 'Units', category_id: cat, factor: 1, rounding: 1 });
  ids.dozen = await add('uom.uom', { name: 'Dozens', category_id: cat, factor: 12, rounding: 0.01 });
  const tmpl = await add('product.template', { name: 'Chair', uom_id: ids.unit, currency_id: ids.usd, list_price: 120 });
  ids.chair = await add('product.product', { name: 'Chair', product_tmpl_id: tmpl, default_code: 'CHAIR' });
  ids.vip = await add('product.pricelist', { name: 'VIP', currency_id: ids.usd });
  await add('product.pricelist.item', { name: 'VIP chair', pricelist_id: ids.vip, product_id: ids.chair, compute_price: 'fixed', amount: 100 });
  ids.promo = await add('product.pricelist', { name: 'Promo', currency_id: ids.usd });
  await add('product.pricelist.item', { name: '10% off', pricelist_id: ids.promo, compute_price: 'percentage', amount: 10 });
  ids.vat7 = await add('account.tax', { name: 'VAT 7%', amount_type: 'percent', amount: 7 });
  ids.eco = await add('account.tax', { name: 'Eco', amount_type: 'fixed', amount: 0.5 });
  ids.partner = await add('res.partner', { name: 'Acme', email: 'a@acme.example' });
}, 120_000);
afterAll(() => manager.closeAll());

const year = String(new Date().getUTCFullYear());

describe('sequence_next (GAP-SEQ-1)', () => {
  it('numbers a record from its default on create, for a user without ir.sequence rights', async () => {
    await expect(user.model('ir.sequence').search([])).rejects.toThrow();
    const first = (await user.model('ncs.order').create({ partner_id: ids.partner })).ids[0]!;
    const second = (await user.model('ncs.order').create({ partner_id: ids.partner })).ids[0]!;
    const rows = await root.model('ncs.order').browse([first, second]).read(['name']);
    expect(rows.map((r) => r.name)).toEqual([`SO/${year}/00001`, `SO/${year}/00002`]);
    // an explicit value wins over the default and draws nothing
    const third = (await user.model('ncs.order').create({ name: 'MANUAL' })).ids[0]!;
    expect((await root.model('ncs.order').browse(third).read(['name']))[0]!.name).toBe('MANUAL');
    expect(await evaluateEnvExpression(user, "sequence_next('ncs.order')")).toBe(`SO/${year}/00003`);
  });

  it('selects the per-company sequence and checks the company against the caller', async () => {
    const companyB = handle.env({ uid: 1, companyIds: [ids.companyB!] });
    expect(await evaluateEnvExpression(companyB, "sequence_next('ncs.order')")).toBe('B/001');
    expect(await evaluateEnvExpression(root, `sequence_next('ncs.order', ${ids.companyB})`)).toBe('B/002');
    await expect(evaluateEnvExpression(user, `sequence_next('ncs.order', ${ids.companyB})`)).rejects.toThrow(/Company is not allowed/);
    expect(await evaluateEnvExpression(user, "sequence_next('no.such.code')")).toBeNull();
    await expect(evaluateEnvExpression(user, 'sequence_next(42)')).rejects.toThrow(/sequence code/);
  });

  it('is impure and refused in read-only (computed field) evaluation', async () => {
    expect(isImpureHelper('sequence_next')).toBe(true);
    const id = (await root.model('ncs.order').create({ name: 'X' })).ids[0]!;
    await expect(root.model('ncs.order').browse(id).read(['peek'])).rejects.toThrow(/changes data/);
    await expect(evaluateEnvExpression(root, "sequence_next('ncs.order')", {}, { readOnly: true })).rejects.toThrow(/changes data/);
  });

  it('assigns numbers from a server action', async () => {
    const id = (await user.model('ncs.order').create({ name: 'DRAFT' })).ids[0]!;
    await new ServerActionService(root).define({ key: 'ncs.number', model: 'ncs.order', type: 'update_record', values: { name: "sequence_next('ncs.order')" } });
    await new ServerActionService(user).run('ncs.number', { model: 'ncs.order', ids: [id] });
    expect((await root.model('ncs.order').browse(id).read(['name']))[0]!.name).toMatch(new RegExp(`^SO/${year}/\\d{5}$`));
  });
});

describe('pricing, unit and tax primitives (GAP-PRIM-1)', () => {
  it('pricelist_price quotes fixed and percentage rules, per unit of measure, with the caller access', async () => {
    expect(await evaluateEnvExpression(user, `pricelist_price(${ids.vip}, ${ids.chair}, 2)`)).toBe(100);
    expect(await evaluateEnvExpression(user, `pricelist_price(${ids.promo}, ${ids.chair}, 1)`)).toBe(108);
    expect(await evaluateEnvExpression(user, `pricelist_price(${ids.vip}, ${ids.chair}, 1, null, ${ids.dozen})`)).toBe(1200);
    expect(await evaluateEnvExpression(user, `pricelist_price(null, ${ids.chair}, 1)`)).toBe(120);
    expect(await evaluateEnvExpression(user, `pricelist_price(false, ${ids.chair}, 1, null, ${ids.dozen})`)).toBe(1440);
    await expect(evaluateEnvExpression(user, `pricelist_price(${ids.vip}, 999999, 1)`)).rejects.toThrow();
    expect(isImpureHelper('pricelist_price')).toBe(true);
  });

  it('uom_convert converts within a category and rounds to the target unit', async () => {
    expect(await evaluateEnvExpression(user, `uom_convert(2, ${ids.dozen}, ${ids.unit})`)).toBe(24);
    expect(await evaluateEnvExpression(user, `uom_convert(7, ${ids.unit}, ${ids.dozen})`)).toBe(0.58);
    const other = (await root.model('uom.category').create({ name: 'Weight' })).ids[0]!;
    const kg = (await root.model('uom.uom').create({ name: 'kg', category_id: other })).ids[0]!;
    await expect(evaluateEnvExpression(user, `uom_convert(1, ${ids.unit}, ${kg})`)).rejects.toThrow(/different categories/);
    expect(isImpureHelper('uom_convert')).toBe(true);
  });

  it('tax_compute returns currency-rounded untaxed / tax / total', async () => {
    expect(await evaluateEnvExpression(user, `tax_compute([${ids.vat7}], 100, 2)`)).toEqual({ untaxed: 200, tax: 14, total: 214 });
    expect(await evaluateEnvExpression(user, `tax_compute([${ids.vat7}, ${ids.eco}], 33.333, 3, ${ids.chair}, ${ids.partner}, ${ids.usd})`))
      .toEqual({ untaxed: 100, tax: 8.5, total: 108.5 });
    expect(await evaluateEnvExpression(user, 'tax_compute([], 10, 1)')).toEqual({ untaxed: 10, tax: 0, total: 10 });
    expect(await evaluateEnvExpression(user, `tax_compute([${ids.vat7}], 10, 0)`)).toEqual({ untaxed: 0, tax: 0, total: 0 });
    expect(await evaluateEnvExpression(user, `tax_compute([${ids.vat7}], 405, 1)`)).toMatchObject({ tax: 28.35 });
    await expect(evaluateEnvExpression(user, "tax_compute('x', 1, 1)")).rejects.toThrow(/tax ids/);
    await expect(evaluateEnvExpression(user, 'tax_compute([999999], 1, 1)')).rejects.toThrow();
    expect(isImpureHelper('tax_compute')).toBe(true);
  });
});

describe('relational paths in action expressions (GAP-REL-1)', () => {
  it('follows many2one fields with the caller access in update_record values and button guards', async () => {
    const id = (await user.model('ncs.order').create({ partner_id: ids.partner, product_id: ids.chair, name: 'R' })).ids[0]!;
    const actions = new ServerActionService(root);
    await actions.define({
      key: 'ncs.describe', model: 'ncs.order', type: 'update_record',
      values: {
        note: "partner_id.name + ' / ' + product_id.default_code + ' #' + partner_id.id",
        // a bare many2one in another value expression stays the raw id
        price: `pricelist_price(${ids.vip}, product_id, 1)`,
      },
    });
    await new ServerActionService(user).run('ncs.describe', { model: 'ncs.order', ids: [id] });
    expect((await root.model('ncs.order').browse(id).read(['note', 'price']))[0]).toMatchObject({ note: `Acme / CHAIR #${ids.partner}`, price: 100 });

    await actions.define({ key: 'ncs.guarded', model: 'ncs.order', type: 'update_record', values: { note: "'guarded'" } });
    await new ButtonService(root).define({ model: 'ncs.order', action: 'ncs.guarded', guard: "partner_id.name == 'Acme' and record.product_id.name == 'Chair'" });
    await new ButtonService(user).execute('ncs.order', [id], { action: 'ncs.guarded' });
    expect((await handle.env({ uid: 1 }).model('ncs.order').browse(id).read(['note']))[0]!.note).toBe('guarded');
  });

  it('reads related records with the caller rights: an unreadable comodel fails the action', async () => {
    const id = (await user.model('ncs.order').create({ name: 'S' })).ids[0]!;
    await root.model('ncs.order').browse(id).write({ sequence_id: ids.seqGlobal });
    await new ServerActionService(root).define({ key: 'ncs.peek_seq', model: 'ncs.order', type: 'update_record', values: { note: 'sequence_id.prefix' } });
    await expect(new ServerActionService(user).run('ncs.peek_seq', { model: 'ncs.order', ids: [id] })).rejects.toThrow();
    await new ServerActionService(root).run('ncs.peek_seq', { model: 'ncs.order', ids: [id] });
    expect((await root.model('ncs.order').browse(id).read(['note']))[0]!.note).toBe('SO/%(year)s/');
  });
});

describe('side effects only where a record is really created or changed (review)', () => {
  const seqName = async () => (await handle.env({ uid: 1 }).model('ncs.order').create({ note: 'probe' })).ids[0]!;
  const nameOf = async (id: number) => (await handle.env({ uid: 1 }).model('ncs.order').browse(id).read(['name']))[0]!.name as string;
  const number = (name: string) => Number(name.split('/').pop());

  it('default_get omits a sequence default and draws nothing; create draws', async () => {
    const before = number(await nameOf(await seqName()));
    const defaults = await user.model('ncs.order').defaultGet(['name', 'note']);
    expect(defaults).not.toHaveProperty('name');
    expect(number(await nameOf(await seqName()))).toBe(before + 1);
  });

  it('onchange cannot draw numbers and requires the model access', async () => {
    await expect(user.model('ncs.order').onchange({ note: 'x' }, 'note')).rejects.toThrow(/changes data/);
    await expect(user.model('ncs.locked').onchange({ name: 'x' }, 'name')).rejects.toThrow(AccessError);
    expect(await root.model('ncs.locked').onchange({ name: 'x' }, 'name')).toEqual({ note: 'x' });
  });

  it('button guards and action messages are read-only', async () => {
    const id = (await user.model('ncs.order').create({ name: 'G' })).ids[0]!;
    const actions = new ServerActionService(root);
    await actions.define({ key: 'ncs.touch', model: 'ncs.order', type: 'update_record', values: { note: "'touched'" } });
    await new ButtonService(root).define({ model: 'ncs.order', action: 'ncs.touch', guard: "sequence_next('ncs.order') != ''" });
    await expect(new ButtonService(user).execute('ncs.order', [id], { action: 'ncs.touch' })).rejects.toThrow(/changes data/);
    await actions.define({ key: 'ncs.say_seq', model: 'ncs.order', type: 'post_message', message: "sequence_next('ncs.order')" });
    await expect(new ServerActionService(user).run('ncs.say_seq', { model: 'ncs.order', ids: [id] })).rejects.toThrow(/changes data/);
  });
});

describe('relational scope hardening (review)', () => {
  let orderId: number;
  let visibleLine: number;
  let secretLine: number;
  beforeAll(async () => {
    orderId = (await root.model('ncs.order').create({ name: 'L', partner_id: ids.partner })).ids[0]!;
    visibleLine = (await root.model('ncs.line').create({ order_id: orderId, amount: 10 })).ids[0]!;
    secretLine = (await root.model('ncs.line').create({ order_id: orderId, amount: 99, secret: true })).ids[0]!;
  });

  it('one2many ids honour record rules on the comodel', async () => {
    expect((await user.model('ncs.order').browse(orderId).read(['line_ids']))[0]!.line_ids).toEqual([visibleLine]);
    expect((await root.model('ncs.order').browse(orderId).read(['line_ids']))[0]!.line_ids).toEqual([visibleLine, secretLine]);
    await new ServerActionService(root).define({ key: 'ncs.sum', model: 'ncs.order', type: 'update_record', values: { price: "line_ids.sum('amount')" } });
    await new ServerActionService(user).run('ncs.sum', { model: 'ncs.order', ids: [orderId] });
    expect((await handle.env({ uid: 1 }).model('ncs.order').browse(orderId).read(['price']))[0]!.price).toBe(10);
  });

  it('a many2one hidden by a record rule fails closed', async () => {
    await root.model('ncs.order').browse(orderId).write({ main_line_id: secretLine });
    await new ServerActionService(root).define({ key: 'ncs.main', model: 'ncs.order', type: 'update_record', values: { price: 'main_line_id.amount' } });
    await expect(new ServerActionService(user).run('ncs.main', { model: 'ncs.order', ids: [orderId] })).rejects.toThrow(AccessError);
  });

  it('keeps raw-id comparisons and refuses mixing id and record use of one many2one', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'ncs.cmp', model: 'ncs.order', type: 'update_record', values: { note: `partner_id == ${ids.partner} and 'same' or 'other'` } });
    await new ServerActionService(user).run('ncs.cmp', { model: 'ncs.order', ids: [orderId] });
    expect((await handle.env({ uid: 1 }).model('ncs.order').browse(orderId).read(['note']))[0]!.note).toBe('same');
    await actions.define({ key: 'ncs.both', model: 'ncs.order', type: 'update_record', values: { note: `partner_id == ${ids.partner} and partner_id.name or ''` } });
    await expect(new ServerActionService(user).run('ncs.both', { model: 'ncs.order', ids: [orderId] })).rejects.toThrow(/write 'partner_id.id'/);
    await actions.define({ key: 'ncs.byid', model: 'ncs.order', type: 'update_record', values: { note: `partner_id.id == ${ids.partner} and partner_id.name or ''` } });
    await new ServerActionService(user).run('ncs.byid', { model: 'ncs.order', ids: [orderId] });
    expect((await handle.env({ uid: 1 }).model('ncs.order').browse(orderId).read(['note']))[0]!.note).toBe('Acme');
  });

  it('charges related rows to the action row budget', async () => {
    await new ServerActionService(root).define({ key: 'ncs.rel_budget', model: 'ncs.order', type: 'update_record', values: { note: "partner_id.name + product_id.name" } });
    const id = (await root.model('ncs.order').create({ name: 'B', partner_id: ids.partner, product_id: ids.chair })).ids[0]!;
    // 1 row for the record itself + 1 own row + 2 related reads exceed a budget of 2
    await expect(new ServerActionService(user, { maxRows: 2 }).run('ncs.rel_budget', { model: 'ncs.order', ids: [id] })).rejects.toThrow(/row quota/);
    await new ServerActionService(user, { maxRows: 10 }).run('ncs.rel_budget', { model: 'ncs.order', ids: [id] });
  });
});
