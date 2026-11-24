import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, MetadataStore, ModuleCatalog, PgliteTenantManager, ServerActionService, ValidationError, baseModule,
  createExpressionHelpers, evaluateExpression, evaluateExpressionAsync, extractDependencies, resolveModels,
  type Env, type ModelDef, type ModuleManifest, type TenantHandle,
} from '../src/index.js';
import { ActivityService, MailThreadService, mailModule } from '../src/mail/index.js';
import { evaluateEnvExpression, registerExpressionHelper } from '../src/orm/expr-helpers.js';
import { localClock } from '../src/orm/clock.js';

const all = { read: true, write: true, create: true, unlink: true };

const testModule: ModuleManifest = {
  name: 'nc_test', version: '1.0.0', depends: ['mail'],
  models: [
    {
      name: 'nc.mixin.stored', abstract: true, origin: 'module',
      fields: { nc_stamp: { type: 'char', store: true, compute: async (records) => new Map(records.ids.map((id) => [id, `S${id}`])) } },
    },
    { name: 'nc.mixin.req', abstract: true, origin: 'module', fields: { nc_code: { type: 'char', required: true } } },
    { name: 'nc.plain', origin: 'module', fields: { name: { type: 'char' } } },
    {
      name: 'nc.line', origin: 'module',
      fields: {
        name: { type: 'char', tracking: true, string: 'Label' },
        qty: { type: 'float', digits: 'Product Unit of Measure' },
        price: { type: 'float', digits: 'Product Price' },
        ratio: { type: 'float', digits: 'Missing Precision' },
        fixed: { type: 'float', digits: [10, 3] },
        amount: { type: 'float' },
        currency_id: { type: 'many2one', comodel: 'res.currency' },
        rounded: { type: 'float', computeExpr: 'currency_round(amount, currency_id)' },
        in_eur: { type: 'float', computeExpr: "currency_convert(amount, currency_id, context.eur_id, '2026-01-15')" },
        due: { type: 'date', defaultExpr: 'date_add_days(today, 3)' },
        next_month: { type: 'date', computeExpr: 'date_add_months(due, 1)', store: true },
        note: { type: 'char' },
        third: { type: 'float', digits: 'Product Price', computeExpr: "amount == null ? null : amount / 3", store: true },
      },
      constraints: [{ name: 'nc_qty_positive', expression: "float_compare(qty, 0, 'Product Unit of Measure') >= 0", message: 'Quantity must not be negative' }],
      onchange: { amount: "[['note', 'r=' + float_round(amount, 'Product Price')]]" },
    },
  ],
  access: [{ model: 'nc.line', group: 'base.group_user', perms: all }],
};

let manager: PgliteTenantManager;
let h: TenantHandle;
let root: Env;
let alice: Env;
let usd: number;
let eur: number;

const ref = async (xmlId: string): Promise<number> => {
  const [mod, name] = xmlId.split('.');
  const [row] = await h.driver.query<{ res_id: number }>({ text: 'SELECT res_id FROM nx_model_data WHERE module = $1 AND name = $2', params: [mod, name] });
  return Number(row!.res_id);
};

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, mailModule, testModule]) });
  h = await manager.create('nocode', ['nc_test']);
  root = h.env({ uid: 1 });
  const company = await ref('base.main_company');
  const user = await ref('base.group_user');
  const [aliceUid] = (await root.model('res.users').create({ name: 'Alice', login: 'alice', company_id: company, company_ids: [company], group_ids: [user] })).ids;
  alice = h.env({ uid: aliceUid! });
  usd = await ref('base.USD');
  eur = await ref('base.EUR');
  await root.model('res.currency.rate').create([
    { currency_id: eur, name: '2026-01-01', rate: 0.5 },
    { currency_id: eur, name: '2026-02-01', rate: 0.25 },
  ]);
}, 120_000);

afterAll(async () => { await manager?.closeAll(); });

describe('NX-Expr async helper extension point', () => {
  it('resolves async helpers by bounded replay with memoized plain results', async () => {
    let calls = 0;
    const lookup = { resolve: async ([x]: unknown[]) => { calls += 1; return { value: Number(x) * 10, at: new Date(0) } as never; } };
    const value = await evaluateExpressionAsync('[lookup(a), lookup(a), lookup(b)]', { a: 1, b: 2 }, { asyncHelpers: { lookup } });
    expect(value).toEqual([1, 1, 2].map((x) => ({ value: x * 10, at: '1970-01-01T00:00:00.000Z' })));
    expect(calls).toBe(2); // memoized per (name, args); Date results are reduced to JSON data
    const sum = { resolve: ([x]: unknown[]) => Number(x) + 1 };
    expect(await evaluateExpressionAsync('sum1(1) + sum1(sum1(1))', {}, { asyncHelpers: { sum1: sum } })).toBe(5);
    await expect(evaluateExpressionAsync('sum1(1) + sum1(2) + sum1(3)', {}, { asyncHelpers: { sum1: { resolve: ([x]) => Number(x) } }, maxHelperCalls: 2 }))
      .rejects.toThrow(/helper call quota/);
    await expect(evaluateExpressionAsync('k(x)', { x: Number.NaN }, { asyncHelpers: { k: { resolve: () => 1 } } })).rejects.toThrow(/finite/);
    await expect(evaluateExpressionAsync('nope(1)', { nope: () => 1 })).rejects.toThrow(/not allowed/);
    await expect(evaluateExpressionAsync('x', {}, { asyncHelpers: { constructor: lookup } })).rejects.toThrow(/Invalid expression helper/);
    // sync helpers keep working synchronously, named precisions need the ORM
    expect(evaluateExpression('float_round(1.005, 2)', createExpressionHelpers())).toBe(1.01);
    expect(evaluateExpression("date_add_months('2026-01-31', 1)", createExpressionHelpers())).toBe('2026-02-28');
    expect(evaluateExpression("date_add_days('2026-12-31T10:00:00Z', 1)", createExpressionHelpers())).toBe('2027-01-01T10:00:00Z');
    expect(() => evaluateExpression("float_round(1.5, 'Product Price')", createExpressionHelpers())).toThrow(/Named precision/);
  });

  it('keeps helper names out of extracted dependencies', () => {
    expect(extractDependencies("currency_convert(amount, currency_id, 3) + float_round(qty, 'Product Price') + date_add_days(today, 1)"))
      .toEqual(['amount', 'currency_id', 'qty']);
    expect(extractDependencies('custom_helper(x)', { helpers: ['custom_helper'] })).toEqual(['x']);
  });

  it('rejects data/time helpers in stored expressions and accepts pure date arithmetic', () => {
    const base = (expr: string): ModelDef[] => [{ name: 'x.s', origin: 'module', fields: { a: { type: 'float' }, d: { type: 'date' }, c: { type: 'float', computeExpr: expr, store: true } } }];
    expect(() => resolveModels(base('currency_round(a, 1)'))).toThrow(/stored expression/);
    expect(() => resolveModels(base("float_round(a, 'Product Price')"))).toThrow(/stored expression/);
    expect(() => resolveModels(base('local_now'))).toThrow(/stored expression/);
    expect(() => resolveModels([{ name: 'x.t', origin: 'module', fields: { d: { type: 'date' }, c: { type: 'date', computeExpr: 'date_add_days(d, 1)', store: true } } }])).not.toThrow();
  });

  it('accepts registered and call-local helpers and runs async ones with the caller env', async () => {
    registerExpressionHelper('nc_double', { pure: true, sync: (x) => Number(x) * 2 });
    registerExpressionHelper('nc_partner_count', { resolve: async (env) => env.model('res.partner').searchCount([]) });
    expect(() => registerExpressionHelper('float_round', { sync: () => 1 })).toThrow(/built in/);
    expect(() => registerExpressionHelper('nc_bad', { sync: () => 1, resolve: async () => 1 })).toThrow(/exactly one/);
    expect(await evaluateEnvExpression(root, 'nc_double(21)')).toBe(42);
    expect(await evaluateEnvExpression(root, 'nc_partner_count() > 0')).toBe(true);
    const seen: number[] = [];
    expect(await evaluateEnvExpression(alice, 'who()', {}, { helpers: { who: { resolve: (env) => { seen.push(env.uid); return env.uid; } } } })).toBe(alice.uid);
    expect(seen).toEqual([alice.uid]);
    await expect(evaluateEnvExpression(root, 'x', {}, { helpers: { today: { sync: () => 1 } } })).rejects.toThrow(/already defined/);
    expect(extractDependencies('nc_double(x)')).toEqual(['x']);
  });

  it('exposes today and local_now in the user time zone', async () => {
    const at = new Date('2026-06-30T20:00:00Z');
    expect(localClock(root.withContext({ tz: 'Pacific/Kiritimati' }), at)).toEqual({ today: '2026-07-01', localNow: '2026-07-01 10:00:00' });
    expect(localClock(root.withContext({ tz: 'Not/AZone' }), at).today).toBe('2026-06-30');
    const tz = root.withContext({ tz: 'Pacific/Kiritimati' });
    expect(await evaluateEnvExpression(tz, 'today')).toBe(localClock(tz).today);
    expect(await evaluateEnvExpression(tz, 'local_now')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('ORM helpers in compute / default / constraint / onchange / server actions', () => {
  it('uses currency, precision and date helpers', async () => {
    const env = alice.withContext({ eur_id: eur });
    const [id] = (await env.model('nc.line').create({ name: 'L', amount: 10.005, currency_id: usd, qty: 1 })).ids;
    const [row] = await env.model('nc.line').browse(id!).read(['rounded', 'in_eur', 'due', 'next_month']);
    expect(row!.rounded).toBe(10.01);
    expect(row!.in_eur).toBe(5); // 10.005 * 0.5 / 1, rounded to EUR cents (rate of 2026-01-01 applies on 2026-01-15)
    const day = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : v;
    expect(day(row!.due)).toBe(await evaluateEnvExpression(alice, 'date_add_days(today, 3)'));
    expect(day(row!.next_month)).toBe(await evaluateEnvExpression(alice, 'date_add_months(date_add_days(today, 3), 1)'));
    await expect(env.model('nc.line').create({ name: 'neg', qty: -1 })).rejects.toThrow(/Quantity must not be negative/);
    // a tiny negative quantity rounds to zero at the named precision and passes
    await env.model('nc.line').create({ name: 'tiny', qty: -0.0001 });
    expect(await env.model('nc.line').onchange({ amount: 2.34567 }, 'amount')).toEqual({ note: 'r=2.35' });
  });

  it('runs helpers in server action expressions', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'nc.round', model: 'nc.line', type: 'update_record', values: { note: "'' + currency_round(amount, currency_id)", amount: "float_round(amount, 'Product Price')" } });
    const [id] = (await root.model('nc.line').create({ name: 'S', amount: 1.23456, currency_id: usd })).ids;
    await actions.run('nc.round', { model: 'nc.line', ids: [id!] });
    const [row] = await root.model('nc.line').browse(id!).read(['note', 'amount']);
    expect(row).toMatchObject({ note: '1.23', amount: 1.23 });
  });

  it('reads currencies under the caller access', async () => {
    const rate = (await root.model('res.currency.rate').search([['currency_id', '=', eur]])).ids;
    expect(rate.length).toBe(2);
    // a helper reading an unknown currency fails like a normal read
    await expect(evaluateEnvExpression(alice, 'currency_round(1, 999999)')).rejects.toThrow();
    await expect(evaluateEnvExpression(alice, `currency_convert(1, ${usd}, ${eur}, '2026-02-30')`)).rejects.toThrow(/valid calendar date/);
    expect(await evaluateEnvExpression(alice, `currency_convert(10, ${usd}, ${eur}, '2026-02-15')`)).toBe(2.5);
  });
});

describe('named decimal precision', () => {
  it('rounds writes, reports resolved digits and follows precision changes', async () => {
    const lines = root.model('nc.line');
    const [id] = (await lines.create({ name: 'P', qty: 1.23456, price: 9.87654, ratio: 0.555, fixed: 1.23456 })).ids;
    expect((await lines.browse(id!).read(['qty', 'price', 'ratio', 'fixed']))[0]).toMatchObject({ qty: 1.235, price: 9.88, ratio: 0.56, fixed: 1.235 });
    const fg = await lines.fieldsGet(['qty', 'price', 'ratio', 'fixed', 'amount']);
    expect(fg.qty!.digits).toEqual([16, 3]);
    expect(fg.price!.digits).toEqual([16, 2]);
    expect(fg.ratio!.digits).toEqual([16, 2]); // missing precision record: default digits
    expect(fg.fixed!.digits).toEqual([10, 3]);
    expect(fg.amount!.digits).toBeUndefined();
    await (await root.model('decimal.precision').search([['name', '=', 'Product Price']])).write({ digits: 4 });
    await lines.browse(id!).write({ price: 9.87654 });
    expect((await lines.browse(id!).read(['price']))[0]!.price).toBe(9.8765);
    expect((await h.env({ uid: 1 }).model('nc.line').fieldsGet(['price'])).price!.digits).toEqual([16, 4]);
    await (await root.model('decimal.precision').search([['name', '=', 'Product Price']])).write({ digits: 2 });
    // numeric strings (import/RPC) are coerced, other strings rejected; stored computes are rounded too
    const [other] = (await lines.create({ name: 'Q', price: '3.14159' as never, amount: 10 })).ids;
    expect((await lines.browse(other!).read(['price', 'third']))[0]).toMatchObject({ price: 3.14, third: 3.33 });
    await expect(lines.create({ name: 'R', price: 'abc' as never })).rejects.toBeInstanceOf(ValidationError);
  });

  it('validates named digits in the registry and metadata', async () => {
    expect(() => resolveModels([{ name: 'x.d', origin: 'module', fields: { a: { type: 'integer', digits: 'Product Price' } } }])).toThrow(/digits/);
    expect(() => resolveModels([{ name: 'x.d', origin: 'module', fields: { a: { type: 'float', digits: '' } } }])).toThrow(/digits/);
    expect(() => resolveModels([{ name: 'x.d', origin: 'module', fields: { a: { type: 'float', digits: 'Product Price' } } }])).not.toThrow();
    const meta = MetadataStore.for(h);
    await expect(meta.addField('nc.line', 'x_bad', { type: 'float', digits: "bad'name;" })).rejects.toThrow(/digits/);
    await meta.addField('nc.line', 'x_weight', { type: 'float', digits: 'Stock Weight' });
    const [id] = (await root.model('nc.line').create({ name: 'W', x_weight: 1.23456 })).ids;
    const digits = (await root.model('nc.line').fieldsGet(['x_weight'])).x_weight!.digits as [number, number];
    expect((await root.model('nc.line').browse(id!).read(['x_weight']))[0]!.x_weight).toBe(Number((1.23456).toFixed(digits[1])));
  });
});

describe('mixins attached through metadata', () => {
  it('attaches mail.thread and mail.activity.mixin to a custom model', async () => {
    const meta = MetadataStore.for(h);
    await meta.createModel({ name: 'x_nc_doc', fields: { x_name: { type: 'char', tracking: true, string: 'Name' } } });
    const admin = { actor: root };
    await expect(meta.addMixin('x_nc_doc', 'mail.thread')).rejects.toBeInstanceOf(AccessError);
    await expect(meta.addMixin('x_nc_doc', 'mail.thread', { actor: alice.sudo() })).rejects.toBeInstanceOf(AccessError);
    await expect(meta.addMixin('x_nc_doc', 'res.partner', admin)).rejects.toThrow(/abstract module mixin/);
    await expect(meta.addMixin('x_nc_doc', 'x_unknown', admin)).rejects.toThrow(/abstract module mixin/);
    await meta.addMixin('x_nc_doc', 'mail.thread', admin);
    await meta.addMixin('x_nc_doc', 'mail.activity.mixin', admin);
    await expect(meta.addMixin('x_nc_doc', 'mail.thread', admin)).rejects.toThrow(/already inherits/);
    expect(h.registry.get('x_nc_doc').fields.has('message_ids')).toBe(true);
    expect(h.registry.get('x_nc_doc').fields.has('activity_state')).toBe(true);
    await h.registry.reload(); // persisted and reapplied on rebuild
    expect(h.registry.get('x_nc_doc').def.extends).toEqual(['mail.thread', 'mail.activity.mixin']);

    const docs = root.model('x_nc_doc');
    const [id] = (await docs.create({ x_name: 'First' })).ids;
    const [posted] = await docs.browse(id!).call('message_post', { body: 'Hello' }) as number[];
    expect(posted).toBeGreaterThan(0);
    await docs.browse(id!).write({ x_name: 'Second' });
    const messages = await new MailThreadService(root).messages('x_nc_doc', id!, { limit: 5 });
    expect(messages.some((m) => m.tracking.some((t) => t.field === 'x_name' && t.old_value_char === 'First' && t.new_value_char === 'Second'))).toBe(true);
    expect(messages.some((m) => m.id === posted)).toBe(true);
    const activity = await new ActivityService(root).schedule('x_nc_doc', id!, { summary: 'Call back', userId: alice.uid });
    const [row] = await docs.browse(id!).read(['activity_ids', 'activity_state', 'message_ids']);
    expect(row!.activity_ids).toEqual([activity]);
    expect(row!.activity_state).toBe('planned');
    expect((row!.message_ids as number[])).toContain(posted);
    expect(await meta.listMixins('x_nc_doc')).toEqual([{ model: 'x_nc_doc', mixin: 'mail.thread' }, { model: 'x_nc_doc', mixin: 'mail.activity.mixin' }]);
    await expect(meta.removeMixin('x_nc_doc', 'mail.activity.mixin', { allowDestructive: true })).rejects.toBeInstanceOf(AccessError);
    await expect(meta.removeMixin('x_nc_doc', 'mail.activity.mixin', { allowDestructive: true, actor: alice.sudo() })).rejects.toBeInstanceOf(AccessError);
  });

  it('initializes stored mixin fields on existing rows and refuses required fields on populated tables', async () => {
    const meta = MetadataStore.for(h);
    const plain = root.model('nc.plain');
    const ids = (await plain.create([{ name: 'a' }, { name: 'b' }])).ids;
    await expect(meta.addMixin('nc.plain', 'nc.mixin.req', { actor: root })).rejects.toThrow(/required fields/);
    expect(h.registry.get('nc.plain').fields.has('nc_code')).toBe(false);
    await meta.addMixin('nc.plain', 'nc.mixin.stored', { actor: root });
    const rows = await plain.browse([...ids]).read(['nc_stamp']);
    expect(rows.map((r) => r.nc_stamp)).toEqual(ids.map((id) => `S${id}`));
    await meta.removeMixin('nc.plain', 'nc.mixin.stored', { allowDestructive: true, actor: root });
    expect(h.registry.get('nc.plain').fields.has('nc_stamp')).toBe(false);
  });

  it('attaches a mixin to a module model only for administrators', async () => {
    const meta = MetadataStore.for(h);
    await expect(meta.addMixin('nc.line', 'mail.thread')).rejects.toBeInstanceOf(AccessError);
    await expect(meta.addMixin('nc.line', 'mail.thread', { actor: alice })).rejects.toBeInstanceOf(AccessError);
    await meta.addMixin('nc.line', 'mail.thread', { actor: root });
    await h.registry.reload();
    const model = h.registry.get('nc.line');
    expect(model.def.origin).toBe('module');
    expect(model.def.extends).toContain('mail.thread');
    expect(model.fields.has('message_follower_ids')).toBe(true);
    expect(model.fields.has('x_weight')).toBe(true); // custom fields kept next to the mixin

    const lines = root.model('nc.line');
    const [id] = (await lines.create({ name: 'Old' })).ids;
    await lines.browse(id!).call('message_post', { body: 'On a module model' });
    await lines.browse(id!).write({ name: 'New' });
    const messages = await new MailThreadService(root).messages('nc.line', id!, { limit: 5 });
    expect(messages.some((m) => m.tracking.some((t) => t.field === 'name' && t.new_value_char === 'New'))).toBe(true);
    // alice may read the thread of a document she can read
    expect((await new MailThreadService(alice).messages('nc.line', id!, { limit: 5 })).length).toBeGreaterThan(0);

    await expect(meta.removeMixin('nc.line', 'mail.thread', { allowDestructive: true, actor: alice })).rejects.toBeInstanceOf(AccessError);
    await meta.removeMixin('nc.line', 'mail.thread', { allowDestructive: true, actor: root });
    expect(h.registry.get('nc.line').fields.has('message_ids')).toBe(false);
    expect(h.registry.get('nc.line').fields.has('x_weight')).toBe(true);
  });

  it('copies mixins on module-level extensions like prototype inheritance', () => {
    const models = resolveModels([
      { name: 'm.mixin', abstract: true, origin: 'module', fields: { m_flag: { type: 'boolean' }, shared: { type: 'char', string: 'Mixin' } }, methods: { hello: () => 'mixin', own: () => 'mixin' } },
      { name: 'm.doc', origin: 'module', fields: { shared: { type: 'char', string: 'Doc' } }, methods: { own: () => 'doc' } },
      { name: 'm.doc', extends: ['m.doc', 'm.mixin'], origin: 'module', fields: {} },
    ]);
    const doc = models.get('m.doc')!;
    expect(doc.fields.has('m_flag')).toBe(true);
    expect(doc.fields.get('shared')!.string).toBe('Doc');
    expect(doc.def.methods!.hello!({} as never)).toBe('mixin');
    expect(doc.def.methods!.own!({} as never)).toBe('doc');
    expect(doc.def.extends).toEqual(['m.mixin']);
    expect(() => resolveModels([{ name: 'm.doc', origin: 'module', fields: {} }, { name: 'm.doc', extends: ['m.doc', 'm.none'], origin: 'module', fields: {} }]))
      .toThrow(/unknown model/);
  });

  it('removes mixin rows with the custom model', async () => {
    const meta = MetadataStore.for(h);
    await meta.removeModel('x_nc_doc', { allowDestructive: true });
    expect(await meta.listMixins('x_nc_doc')).toEqual([]);
  });

  it('rejects mixin changes on unknown models', async () => {
    await expect(MetadataStore.for(h).addMixin('x_missing', 'mail.thread')).rejects.toBeInstanceOf(ValidationError);
  });
});
