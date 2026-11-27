import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, ButtonService, PgliteTenantManager, ServerActionService, ValidationError,
  ensureSecurityTables, securityModels, writeModuleSecurity,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';
import { configAccess, configModels, configRules } from '../src/base/config-models.js';
import { LifecycleError } from '../src/policy/index.js';
import { TransitionService, transitionAccess, transitionModels } from '../src/policy/transition.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  ...configModels,
  ...transitionModels.filter((m) => !configModels.some((c) => c.name === m.name)),
  { name: 'tr.move', origin: 'module', fields: {
    name: { type: 'char' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['posted', 'Posted']], default: 'draft' },
    number: { type: 'char' },
    ref: { type: 'char' },
    amount: { type: 'float' },
    line_ids: { type: 'one2many', comodel: 'tr.mline', inverseName: 'move_id' },
  } },
  { name: 'tr.mline', origin: 'module', fields: {
    move_id: { type: 'many2one', comodel: 'tr.move', ondelete: 'cascade' },
    debit: { type: 'float' },
    credit: { type: 'float' },
    flag: { type: 'char' },
  } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env; let admin: Env; let alice: Env; let carol: Env; let dave: Env;

const DEFS = [
  { model: 'tr.move', key: 'post', name: 'Post', from: ['draft'], to: 'posted', already: 'skip', guard: 'amount >= 0',
    checks: [{ expr: "line_ids.sum('debit') == line_ids.sum('credit')", message: 'Entry is not balanced' }],
    effects: [
      { type: 'sequence', field: 'number', code: "'tr.post'", date: "'2026-03-01'", when: "ref != 'nonum'" },
      { type: 'set', values: { name: "'Posted'" } },
      { type: 'child_set', field: 'line_ids', values: { flag: "'P'" } },
    ] },
  { model: 'tr.move', key: 'strict_post', from: ['draft'], to: 'posted', already: 'error' },
  { model: 'tr.move', key: 'grp_post', from: ['draft'], to: 'posted', groups: ['tr.poster'] },
  { model: 'tr.move', key: 'guarded', from: ['draft'], to: 'posted', guard: 'amount > 100' },
];

const newMove = async (e: Env, vals: Record<string, unknown> = {}, balanced = true): Promise<number> => (await e.model('tr.move').create({
  name: 'M', amount: 10,
  line_ids: [
    { op: 'create', values: { debit: 5, credit: 0 } },
    { op: 'create', values: { debit: 0, credit: balanced ? 5 : 4 } },
  ],
  ...vals,
})).ids[0]!;
const read = async (id: number) => (await tenant.env({ uid: 1 }).model('tr.move').browse(id).read())[0]!;
const post = (e: Env, ids: number[], key = 'post') => new TransitionService(e).run('tr.move', ids, key);

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('policy-transition');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  const [company] = (await root.model('res.company').create({ name: 'A' })).ids as number[];
  const [user] = (await root.model('res.groups').create({ name: 'Users', code: 'base.group_user' })).ids;
  const [system] = (await root.model('res.groups').create({ name: 'Settings', code: 'base.group_system', implied_ids: [user] })).ids;
  const [poster] = (await root.model('res.groups').create({ name: 'Poster', code: 'tr.poster', implied_ids: [user] })).ids;
  const [reader] = (await root.model('res.groups').create({ name: 'Reader', code: 'tr.reader' })).ids;
  const mk = async (login: string, groups: number[]) => (await root.model('res.users').create({
    name: login, login, company_id: company, company_ids: [company], group_ids: groups,
  })).ids[0]!;
  const adminUid = await mk('adm', [system!]);
  const aliceUid = await mk('alice', [user!]);
  const carolUid = await mk('carol', [poster!]);
  const daveUid = await mk('dave', [reader!]);
  const ro = { read: true, write: false, create: false, unlink: false };
  await writeModuleSecurity(tenant.driver, 'base', [
    ...configAccess, ...transitionAccess,
    ...['tr.move', 'tr.mline'].map((model) => ({ model, group: 'base.group_user', perms: all })),
    { model: 'tr.move', group: 'tr.reader', perms: ro },
    { model: 'tr.mline', group: 'tr.reader', perms: ro },
  ], configRules);
  admin = tenant.env({ uid: adminUid });
  alice = tenant.env({ uid: aliceUid });
  carol = tenant.env({ uid: carolUid });
  dave = tenant.env({ uid: daveUid });
  await admin.model('ir.lifecycle').create({
    model: 'tr.move', state_field: 'state', initial_state: 'draft',
    locks: [{ states: ['posted'], writable: [], frozen_children: ['line_ids'] }], engine_fields: ['number'],
  });
  await admin.model('ir.lifecycle').create({ model: 'tr.mline', engine_fields: ['flag'] });
  await admin.model('ir.sequence').create({ name: 'Post', code: 'tr.post', prefix: 'P/', padding: 3, implementation: 'no_gap' });
  for (const d of DEFS) await admin.model('ir.transition').create(d);
}, 60_000);

afterAll(() => mgr.closeAll());

describe('ir.transition records', () => {
  const mkT = (vals: Record<string, unknown>) => admin.model('ir.transition').create({ model: 'tr.move', key: 'x1', from: ['draft'], to: 'posted', ...vals });
  it('is system-only', async () => {
    await expect(alice.model('ir.transition').create({ model: 'tr.move', key: 'x', to: 'posted' })).rejects.toBeInstanceOf(AccessError);
  });
  it.each([
    ['unknown model', { model: 'tr.nope' }, /does not exist/],
    ['to outside selection', { to: 'gone' }, /not in the selection/],
    ['from outside selection', { from: ['gone'] }, /not in the selection/],
    ['bad expression', { guard: 'amount >' }, /./],
    ['unknown field in check', { checks: [{ expr: 'nope > 1', message: 'm' }] }, /unknown field 'nope'/],
    ['set of unknown field', { effects: [{ type: 'set', values: { nope: '1' } }] }, /unknown field 'nope'/],
    ['sequence on a plain field', { effects: [{ type: 'sequence', field: 'ref', code: "'tr.post'" }] }, /transition_only or an engine field/],
    ['duplicate key', { key: 'post' }, /already exists|Duplicate value/],
  ])('refuses %s', async (_l, vals, msg) => {
    await expect(mkT(vals)).rejects.toThrow(msg as RegExp);
    await expect(mkT(vals)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('TransitionService', () => {
  it('posts a balanced record: state, number, set and child_set in one go', async () => {
    const id = await newMove(alice);
    expect(await post(alice, [id])).toEqual({ done: [id], skipped: [] });
    const r = await read(id);
    expect(r).toMatchObject({ state: 'posted', name: 'Posted' });
    expect(r.number).toMatch(/^P\/\d{3}$/);
    const lines = await root.model('tr.mline').search([['move_id', '=', id]]);
    expect((await lines.read(['flag'])).map((l) => l.flag)).toEqual(['P', 'P']);
  });

  it('refuses an unbalanced record with the check message and changes nothing', async () => {
    const id = await newMove(alice, {}, false);
    await expect(post(alice, [id])).rejects.toThrow('Entry is not balanced');
    await expect(post(alice, [id])).rejects.toBeInstanceOf(ValidationError);
    expect(await read(id)).toMatchObject({ state: 'draft', number: null });
  });

  it('skips the sequence when `when` is false', async () => {
    const id = await newMove(alice, { ref: 'nonum' });
    await post(alice, [id]);
    expect(await read(id)).toMatchObject({ state: 'posted', number: null });
  });

  it('refuses from-state violations, skips when already=skip, errors otherwise', async () => {
    const id = await newMove(alice);
    await post(alice, [id]);
    const number = (await read(id)).number;
    expect(await post(alice, [id])).toEqual({ done: [], skipped: [id] });
    expect((await read(id)).number).toBe(number);
    await expect(post(alice, [id], 'strict_post')).rejects.toThrow(/expected draft/);
  });

  it('evaluates the guard', async () => {
    const id = await newMove(alice);
    await expect(post(alice, [id], 'guarded')).rejects.toThrow(/not allowed/);
    await root.model('tr.move').browse(id).write({ amount: 500 });
    await post(alice, [id], 'guarded');
    expect((await read(id)).state).toBe('posted');
  });

  it('narrows by group', async () => {
    const id = await newMove(alice);
    await expect(post(alice, [id], 'grp_post')).rejects.toBeInstanceOf(AccessError);
    await post(carol, [id], 'grp_post');
    expect((await read(id)).state).toBe('posted');
  });

  it('needs the caller own write access', async () => {
    const id = await newMove(alice);
    await expect(post(dave, [id])).rejects.toBeInstanceOf(AccessError);
    expect((await read(id)).state).toBe('draft');
  });

  it('numbers gaplessly, also after a rolled-back transition', async () => {
    const a = await newMove(alice);
    const bad = await newMove(alice, {}, false);
    await expect(post(alice, [a, bad])).rejects.toThrow('Entry is not balanced');
    expect((await read(a)).number).toBeNull();
    const b = await newMove(alice);
    await post(alice, [a]);
    await post(alice, [b]);
    const num = async (id: number) => Number(/\d+$/.exec((await read(id)).number as string)![0]);
    expect(await num(b)).toBe((await num(a)) + 1);
  });

  it('still refuses direct state, number and child writes', async () => {
    const id = await newMove(alice);
    await expect(root.model('tr.move').browse(id).write({ state: 'posted' })).rejects.toBeInstanceOf(LifecycleError);
    await expect(root.model('tr.move').browse(id).write({ number: 'X' })).rejects.toBeInstanceOf(LifecycleError);
    await post(alice, [id]);
    const [line] = (await root.model('tr.mline').search([['move_id', '=', id]])).ids;
    await expect(root.model('tr.mline').browse(line!).write({ debit: 9 })).rejects.toBeInstanceOf(LifecycleError);
  });

  it('runs through a transition server action and a button', async () => {
    await new ServerActionService(admin).define({ key: 'tr_post_action', model: 'tr.move', type: 'transition', transition: 'post' });
    await new ButtonService(admin).define({ model: 'tr.move', action: 'tr_post_action' });
    const id = await newMove(alice);
    await new ButtonService(alice).execute('tr.move', [id], { action: 'tr_post_action' });
    expect((await read(id)).state).toBe('posted');
    const bad = await newMove(alice, {}, false);
    await expect(new ButtonService(alice).execute('tr.move', [bad], { action: 'tr_post_action' })).rejects.toThrow('Entry is not balanced');
  });
  it('validates and caps ids', async () => {
    await expect(post(alice, [0])).rejects.toThrow('positive integers');
    await expect(post(alice, [1.5])).rejects.toThrow('positive integers');
    await expect(post(alice, ['1' as unknown as number])).rejects.toThrow('positive integers');
    await expect(post(alice, Array.from({ length: 1001 }, (_, i) => i + 1))).rejects.toThrow('at most 1000');
  });

  it('treats a NULL state as the initial state and keeps an existing number', async () => {
    const id = await newMove(alice);
    const db = (root as unknown as { db: { query: (q: { text: string; params: unknown[] }) => Promise<unknown> } }).db;
    await db.query({ text: `UPDATE tr_move SET state = NULL, number = 'KEEP/1' WHERE id = $1`, params: [id] });
    root.cache.invalidate();
    await post(alice, [id]);
    const r = await read(id);
    expect(r.state).toBe('posted');
    expect(r.number).toBe('KEEP/1');
  });
});
