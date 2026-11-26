import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PgliteTenantManager, ValidationError, ensureSecurityTables, securityModels,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';
import { configModels } from '../src/base/config-models.js';
import { LifecycleError } from '../src/policy/index.js';
import { TransitionService, transitionModels } from '../src/policy/transition.js';

const models: ModelDef[] = [
  ...securityModels,
  ...configModels,
  ...transitionModels.filter((m) => !configModels.some((c) => c.name === m.name)),
  { name: 'bl.doc', origin: 'module', fields: {
    name: { type: 'char' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['done', 'Done'], ['res', 'Reserved']], default: 'draft' },
    number: { type: 'char' },
    line_ids: { type: 'one2many', comodel: 'bl.line', inverseName: 'doc_id' },
  } },
  { name: 'bl.line', origin: 'module', fields: {
    doc_id: { type: 'many2one', comodel: 'bl.doc', ondelete: 'cascade' },
    product: { type: 'char' },
    loc: { type: 'char' },
    qty: { type: 'float' },
    done_qty: { type: 'float' },
    reserved_qty: { type: 'float' },
  } },
  { name: 'bl.bucket', origin: 'module', fields: {
    product: { type: 'char' },
    loc: { type: 'char' },
    quantity: { type: 'float', default: 0 },
    reserved: { type: 'float', default: 0 },
    plain_qty: { type: 'float' },
    memo: { type: 'char', compute: async () => new Map<number, unknown>() },
    allow_negative: { type: 'boolean', default: false },
    bkey: { type: 'char', unique: true, readonly: true, store: true, depends: ['product', 'loc'], compute: async (records) => {
      const values = new Map<number, unknown>();
      for (const r of await records.read(['product', 'loc'])) values.set(Number(r.id), `${String(r.product)}:${String(r.loc)}`);
      return values;
    } },
  } },
  { name: 'bl.nodef', origin: 'module', fields: {
    product: { type: 'char' },
    quantity: { type: 'float' },
    reserved: { type: 'float' },
    bkey: { type: 'char', unique: true, readonly: true, store: true, depends: ['product'], compute: async (records) => {
      const values = new Map<number, unknown>();
      for (const r of await records.read(['product'])) values.set(Number(r.id), String(r.product));
      return values;
    } },
  } },
  { name: 'bl.nounique', origin: 'module', fields: { product: { type: 'char' }, quantity: { type: 'float' } } },
  { name: 'bl.shadow', origin: 'module', fields: { name: { type: 'char' }, state: { type: 'selection', selection: [['draft', 'D'], ['done', 'X']], default: 'draft' }, balance: { type: 'float' } } },
  { name: 'bl.plain', origin: 'module', fields: { name: { type: 'char' }, qty: { type: 'float' } } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;

const CHECK = { expr: 'balance.quantity >= 0 or balance.allow_negative', message: 'Negative stock' };
const KEY = { product: 'line.product', loc: 'line.loc' };
const run = (ids: number[], key: string) => new TransitionService(root).run('bl.doc', ids, key);
const doc = async (lines: [string, number][], loc = 'L1'): Promise<number> => (await root.model('bl.doc').create({
  name: 'D', line_ids: lines.map(([product, qty]) => ({ op: 'create', values: { product, loc, qty } })),
})).ids[0]!;
const buckets = async (product: string) => (await root.model('bl.bucket').search([['product', '=', product]])).read();
const state = async (id: number) => (await root.model('bl.doc').browse(id).read())[0]!.state;
const lines = async (id: number) => (await (await root.model('bl.line').search([['doc_id', '=', id]])).read());

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('policy-balance');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  await root.model('ir.lifecycle').create({
    model: 'bl.doc', state_field: 'state', initial_state: 'draft',
    locks: [{ states: ['done'], writable: [], frozen_children: ['line_ids'] }], engine_fields: ['number'],
  });
  await root.model('ir.lifecycle').create({ model: 'bl.bucket', engine_fields: ['quantity', 'reserved'] });
  await root.model('ir.lifecycle').create({ model: 'bl.nodef', engine_fields: ['quantity', 'reserved'] });
  await root.model('ir.lifecycle').create({ model: 'bl.nounique', engine_fields: ['quantity'] });
  await root.model('ir.lifecycle').create({ model: 'bl.shadow', state_field: 'state', initial_state: 'draft' });
  const nodefKey = { product: 'line.product' };
  await root.model('ir.transition').create({
    model: 'bl.doc', key: 'nd_reserve', from: ['draft'], to: 'res',
    effects: [{ type: 'balance', from: 'line_ids', target: 'bl.nodef', entries: [{ key: nodefKey, deltas: { reserved: '[line.qty, balance.quantity - balance.reserved].min()' } }],
      into: { reserved_qty: '[line.qty, balance.quantity - balance.reserved].min()' } }],
  });
  await root.model('ir.transition').create({
    model: 'bl.doc', key: 'nd_float', from: ['draft'], to: 'done',
    effects: [{ type: 'balance', from: 'line_ids', target: 'bl.nodef', entries: [{ key: nodefKey, deltas: { quantity: 'line.qty' } }],
      checks: [{ expr: 'balance.quantity <= 0.3', message: 'Too much' }] }],
  });
  await root.model('ir.sequence').create({ name: 'Seq', code: 'bl.seq', prefix: 'S/', padding: 3, implementation: 'no_gap' });
  const base = { model: 'bl.doc', from: ['draft'] };
  await root.model('ir.transition').create({
    ...base, key: 'post', to: 'done',
    effects: [{
      type: 'balance', from: 'line_ids', target: 'bl.bucket',
      entries: [{ key: KEY, deltas: { quantity: 'line.qty' } }],
      into: { done_qty: 'line.qty' }, checks: [CHECK],
    }],
  });
  await root.model('ir.transition').create({
    ...base, key: 'reserve', to: 'res',
    effects: [{
      type: 'balance', from: 'line_ids', target: 'bl.bucket',
      entries: [{ key: KEY, deltas: { reserved: '[line.qty, balance.quantity - balance.reserved].min()' } }],
      into: { reserved_qty: '[line.qty, balance.quantity - balance.reserved].min()' },
    }],
  });
  await root.model('ir.transition').create({
    ...base, key: 'ordered', to: 'done',
    effects: [
      { type: 'sequence', field: 'number', code: "'bl.nosuch'" },
      { type: 'balance', from: 'line_ids', target: 'bl.bucket', entries: [{ key: KEY, deltas: { quantity: 'line.qty' } }], checks: [CHECK] },
    ],
  });
}, 60_000);

afterAll(() => mgr.closeAll());

describe('balance effect', () => {
  it('creates the bucket then increments it, and writes `into` on a frozen child', async () => {
    const a = await doc([['p1', 5]]);
    await run([a], 'post');
    const [b1] = await buckets('p1');
    expect(b1).toMatchObject({ loc: 'L1', quantity: 5 });
    const b = await doc([['p1', 2]]);
    await run([b], 'post');
    expect((await buckets('p1'))).toHaveLength(1);
    expect((await buckets('p1'))[0]!.quantity).toBe(7);
    expect(await state(b)).toBe('done');
    expect((await lines(b))[0]!.done_qty).toBe(2);
  });

  it('accumulates two lines on the same key', async () => {
    const a = await doc([['p2', 5], ['p2', 3], ['p2b', 1]]);
    await run([a], 'post');
    expect((await buckets('p2'))[0]!.quantity).toBe(8);
    expect((await buckets('p2b'))[0]!.quantity).toBe(1);
  });

  it('reserves partially with min(...) and records the amount on the line', async () => {
    await run([await doc([['p3', 10]])], 'post');
    const r1 = await doc([['p3', 7]]);
    await run([r1], 'reserve');
    expect((await lines(r1))[0]!.reserved_qty).toBe(7);
    const r2 = await doc([['p3', 7]]);
    await run([r2], 'reserve');
    expect((await lines(r2))[0]!.reserved_qty).toBe(3);
    expect((await buckets('p3'))[0]).toMatchObject({ quantity: 10, reserved: 10 });
  });

  it('rolls everything back when a post-check fails', async () => {
    const d = await doc([['p5', 4], ['p4', -5]]);
    await expect(run([d], 'post')).rejects.toThrow('Negative stock');
    await expect(run([d], 'post')).rejects.toBeInstanceOf(ValidationError);
    expect(await state(d)).toBe('draft');
    expect(await buckets('p5')).toHaveLength(0);
    expect(await buckets('p4')).toHaveLength(0);
    expect((await lines(d)).every((l) => l.done_qty === null || l.done_qty === 0)).toBe(true);
  });

  it('allows negative stock where the bucket flag says so', async () => {
    const [id] = (await root.model('bl.bucket').create({ product: 'p6', loc: 'L1', allow_negative: true })).ids;
    await run([await doc([['p6', -3]])], 'post');
    expect((await root.model('bl.bucket').browse(id!).read())[0]!.quantity).toBe(-3);
  });

  it('keeps the delta fields write-protected outside the effect', async () => {
    const [bucket] = await buckets('p1');
    await expect(root.model('bl.bucket').browse(bucket!.id as number).write({ quantity: 99 })).rejects.toBeInstanceOf(LifecycleError);
    await expect(root.model('bl.bucket').create({ product: 'px', loc: 'L1', quantity: 1 })).rejects.toBeInstanceOf(LifecycleError);
  });

  it('reads null numeric fields of a brand-new row as zero (partial reserve)', async () => {
    const d = await doc([['n1', 4]]);
    await run([d], 'nd_reserve');
    expect((await lines(d))[0]!.reserved_qty).toBe(0);
    const [row] = await (await root.model('bl.nodef').search([['product', '=', 'n1']])).read();
    expect(row).toMatchObject({ quantity: null, reserved: 0 });
  });

  it('rounds accumulated floats so 0.1 + 0.2 passes a <= 0.3 check', async () => {
    await run([await doc([['n2', 0.1], ['n2', 0.2]])], 'nd_float');
    const [row] = await (await root.model('bl.nodef').search([['product', '=', 'n2']])).read();
    expect(row!.quantity).toBe(0.3);
  });

  it('runs balance effects before sequence effects', async () => {
    const d = await doc([['p7', -1]]);
    await expect(run([d], 'ordered')).rejects.toThrow('Negative stock');
  });
});

describe('balance effect shadowing', () => {
  it('refuses a record model with a field named like an expression variable', async () => {
    await expect(root.model('ir.transition').create({
      model: 'bl.shadow', key: 'bad', from: ['draft'], to: 'done',
      effects: [{ type: 'balance', target: 'bl.bucket', entries: [{ key: { product: 'name', loc: 'name' }, deltas: { quantity: 'balance' } }] }],
    })).rejects.toThrow(/shadow/);
  });
});

describe('balance effect configuration', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    key: KEY, deltas: { quantity: 'line.qty' }, ...over,
  });
  const mk = (effect: Record<string, unknown>) => root.model('ir.transition').create({
    model: 'bl.doc', key: 'bad', from: ['draft'], to: 'done',
    effects: [{ type: 'balance', from: 'line_ids', target: 'bl.bucket', entries: [entry()], ...effect }],
  });
  it.each([
    ['unknown target', { target: 'bl.nope' }, /does not exist/],
    ['target without lifecycle', { target: 'bl.plain' }, /needs an active ir.lifecycle/],
    ['non-engine delta field', { entries: [entry({ deltas: { plain_qty: 'line.qty' } })] }, /engine field/],
    ['non-numeric delta field', { entries: [entry({ deltas: { allow_negative: 'line.qty' } })] }, /numeric/],
    ['unknown key field', { entries: [entry({ key: { nope: 'line.product' } })] }, /unknown key field/],
    ['bad expression', { entries: [entry({ deltas: { quantity: 'line.qty +' } })] }, /./],
    ['unknown line field', { entries: [entry({ deltas: { quantity: 'line.nope' } })] }, /unknown field 'nope'/],
    ['from that is not a one2many', { from: 'name' }, /one2many/],
    ['target without a unique key', { target: 'bl.nounique' }, /unique/],
    ['engine field as key', { entries: [entry({ key: { quantity: 'line.qty', product: 'line.product', loc: 'line.loc' } })] }, /engine or transition-only|unique/],
    ['non-stored key field', { entries: [entry({ key: { product: 'line.product', loc: 'line.loc', memo: 'line.product' } })] }, /stored scalar/],
    ['into with several entries', { entries: [entry(), entry({ deltas: { reserved: 'line.qty' } })], into: { done_qty: 'line.qty' } }, /single entry/],
    ['unknown into field', { into: { nope: 'line.qty' } }, /unknown into field/],
  ])('refuses %s', async (_l, effect, msg) => {
    await expect(mk(effect)).rejects.toThrow(msg as RegExp);
    await expect(mk(effect)).rejects.toBeInstanceOf(ValidationError);
  });
});
