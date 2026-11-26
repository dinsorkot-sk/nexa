import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, AutomationRuleService, PgliteTenantManager, ServerActionService, ValidationError,
  ensureSecurityTables, securityModels, writeModuleSecurity,
  type Env, type EnvImpl, type ModelDef, type TenantHandle,
} from '../src/index.js';
import { configAccess, configModels, configRules } from '../src/base/config-models.js';
import { baseModule } from '../src/base/manifest.js';
import { LifecycleError } from '../src/policy/index.js';
import { withWriteToken, type WriteTokenSpec } from '../src/policy/token.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  ...configModels,
  { name: 'pl.doc', origin: 'module', fields: {
    name: { type: 'char' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['posted', 'Posted'], ['cancel', 'Cancelled']], default: 'draft' },
    note: { type: 'char' },
    amount: { type: 'float' },
    number: { type: 'char' },
    approved_by: { type: 'char' },
    meta: { type: 'json' },
    line_ids: { type: 'one2many', comodel: 'pl.line', inverseName: 'doc_id' },
    master_id: { type: 'many2one', comodel: 'pl.master' },
    tag_ids: { type: 'many2many', comodel: 'pl.tag', relationTable: 'pl_doc_tag_rel', column1: 'doc_id', column2: 'tag_id' },
  } },
  { name: 'pl.line', origin: 'module', fields: {
    doc_id: { type: 'many2one', comodel: 'pl.doc', ondelete: 'cascade' },
    name: { type: 'char' },
    qty: { type: 'integer', default: 1 },
    master_id: { type: 'many2one', comodel: 'pl.master' },
  } },
  { name: 'pl.master', origin: 'module', fields: { name: { type: 'char' } } },
  { name: 'pl.tag', origin: 'module', fields: { name: { type: 'char' } } },
  { name: 'pl.free', origin: 'module', fields: { name: { type: 'char' }, state: { type: 'selection', selection: [['a', 'A'], ['b', 'B']], default: 'a' } } },
  { name: 'pl.eline', origin: 'module', fields: { name: { type: 'char' }, balance: { type: 'float' }, counter: { type: 'integer', default: 0 } } },
  { name: 'pl.late', origin: 'module', fields: {
    name: { type: 'char' },
    rel_name: { type: 'char', related: 'name' },
    state: { type: 'selection', selection: [['new', 'New'], ['done', 'Done']], default: 'new' },
  } },
  { name: 'pl.mixin', origin: 'module', abstract: true, fields: { name: { type: 'char' } } },
  { name: 'mail.pl', origin: 'module', fields: { name: { type: 'char' }, state: { type: 'selection', selection: [['a', 'A']] } } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;
let admin: Env;
let alice: Env;
const rootImpl = (): EnvImpl => root as EnvImpl;

/** Runs `fn` with write tokens active inside one transaction (what a transition service does). */
const withToken = (spec: WriteTokenSpec | WriteTokenSpec[], fn: () => Promise<unknown>) =>
  root.transaction(() => withWriteToken(rootImpl(), spec, fn));
const write = (id: number, vals: Record<string, unknown>) => root.model('pl.doc').browse(id).write(vals);
const row = async (model: string, id: number) => (await root.model(model).browse(id).read())[0]!;

const DOC_LIFECYCLE = {
  model: 'pl.doc', state_field: 'state', initial_state: 'draft',
  locks: [{ states: ['posted', 'cancel'], writable: ['note'], unlink: false, frozen_children: ['line_ids'] }],
  transition_only: ['approved_by'], engine_fields: ['number'],
};

async function post(id: number): Promise<void> {
  await withToken({ op: 'write', model: 'pl.doc', ids: [id], fields: ['state'] }, () => write(id, { state: 'posted' }));
}
async function newDoc(extra: Record<string, unknown> = {}): Promise<number> {
  return (await root.model('pl.doc').create({ name: 'D', amount: 10, ...extra })).ids[0]!;
}
async function postedDoc(): Promise<{ doc: number; line: number }> {
  const doc = await newDoc({ line_ids: [{ op: 'create', values: { name: 'L1', qty: 2 } }] });
  const [line] = (await root.model('pl.line').search([['doc_id', '=', doc]])).ids;
  await post(doc);
  return { doc, line: line! };
}

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('policy-lifecycle');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  const [company] = (await root.model('res.company').create({ name: 'A' })).ids as number[];
  const [user] = (await root.model('res.groups').create({ name: 'Users', code: 'base.group_user' })).ids;
  const [system] = (await root.model('res.groups').create({ name: 'Settings', code: 'base.group_system', implied_ids: [user] })).ids;
  const [adminUid] = (await root.model('res.users').create({
    name: 'Admin', login: 'adm', company_id: company, company_ids: [company], group_ids: [system],
  })).ids;
  const [aliceUid] = (await root.model('res.users').create({
    name: 'Alice', login: 'alice', company_id: company, company_ids: [company], group_ids: [user],
  })).ids;
  await writeModuleSecurity(tenant.driver, 'base', [
    ...configAccess,
    ...['pl.doc', 'pl.line', 'pl.tag', 'pl.free', 'pl.eline', 'pl.late', 'pl.master'].map((model) => ({ model, group: 'base.group_user', perms: all })),
  ], configRules);
  admin = tenant.env({ uid: adminUid! });
  alice = tenant.env({ uid: aliceUid! });
  await admin.model('ir.lifecycle').create(DOC_LIFECYCLE);
  await admin.model('ir.lifecycle').create({ model: 'pl.eline', engine_fields: ['balance', 'counter'] });
}, 60_000);

afterAll(() => mgr.closeAll());

describe('base manifest', () => {
  it('ships ir.lifecycle as a system-only, protected model with a Technical menu and a bumped version', () => {
    expect(baseModule.models!.map((m) => m.name)).toContain('ir.lifecycle');
    expect(configAccess.filter((a) => a.model === 'ir.lifecycle').map((a) => a.group)).toEqual(['base.group_system']);
    expect(baseModule.menus!.find((m) => m.xmlId === 'menu_lifecycles')?.parent).toBe('menu_technical');
    expect(baseModule.version).toBe('1.6.0');
  });

  it('cannot be targeted by access rights or record rules', async () => {
    await expect(admin.model('ir.model.access').create({ name: 'x', model_name: 'ir.lifecycle', group_id: 1, perm_read: true }))
      .rejects.toThrow(/managed by modules only/);
    await expect(admin.model('ir.rule').create({ name: 'x', model_name: 'ir.lifecycle', domain_force: '[]' }))
      .rejects.toThrow(/managed by modules only/);
  });
});

describe('ir.lifecycle records', () => {
  const create = (vals: Record<string, unknown>) => admin.model('ir.lifecycle').create({ model: 'pl.late', ...vals });
  const base = { state_field: 'state', initial_state: 'new' };

  it('is system-only', async () => {
    await expect(alice.model('ir.lifecycle').create({ model: 'pl.late', ...base })).rejects.toBeInstanceOf(AccessError);
    await expect(alice.model('ir.lifecycle').search([])).rejects.toBeInstanceOf(AccessError);
  });

  it.each([
    ['an unknown model', { model: 'pl.nope' }, /does not exist/],
    ['an abstract model', { model: 'pl.mixin' }, /not a concrete model/],
    ['a protected ir.* model', { model: 'ir.rule' }, /protected system model/],
    ['res.users', { model: 'res.users' }, /protected system model/],
    ['res.groups', { model: 'res.groups' }, /protected system model/],
    ['res.company', { model: 'res.company' }, /protected system model/],
    ['a mail.* model', { model: 'mail.pl' }, /protected system model/],
    ['a state field that is not a selection', { state_field: 'name', initial_state: 'x' }, /selection field/],
    ['an unknown state field', { state_field: 'nope', initial_state: 'x' }, /selection field/],
    ['an initial state outside the selection', { ...base, initial_state: 'zzz' }, /initial_state/],
    ['a missing initial state', { state_field: 'state' }, /initial_state/],
    ['an initial state without a state field', { initial_state: 'new' }, /needs a state field/],
    ['locks without a state field', { locks: [{ states: ['new'] }] }, /locks need a state field/],
    ['a lock state outside the selection', { ...base, locks: [{ states: ['gone'] }] }, /not in the selection/],
    ['a state locked twice', { ...base, locks: [{ states: ['done'] }, { states: ['done'] }] }, /locked twice/],
    ['a lock with unknown keys', { ...base, locks: [{ states: ['done'], extra: 1 }] }, /only accepts/],
    ['a lock without states', { ...base, locks: [{ writable: [] }] }, /at least one state/],
    ['an unknown writable field', { ...base, locks: [{ states: ['done'], writable: ['nope'] }] }, /writable field 'nope'/],
    ['an unknown transition-only field', { ...base, transition_only: ['nope'] }, /transition_only field 'nope'/],
    ['an unknown engine field', { ...base, engine_fields: ['nope'] }, /engine field 'nope'/],
    ['a non-list engine_fields', { ...base, engine_fields: 'name' }, /list of field names/],
    ['a related field as engine field', { ...base, engine_fields: ['rel_name'] }, /plain stored field/],
    ['a related field as writable field', { ...base, locks: [{ states: ['done'], writable: ['rel_name'] }] }, /plain stored field/],
    ['a magic field as engine field', { ...base, engine_fields: ['write_date'] }, /plain stored field/],
  ])('refuses %s', async (_label, vals, message) => {
    await expect(create(vals)).rejects.toThrow(message as RegExp);
    await expect(create(vals)).rejects.toBeInstanceOf(ValidationError);
  });

  it('validates frozen children: one2many with an inverse many2one, not combined with unlink', async () => {
    const doc = { model: 'pl.doc', state_field: 'state', initial_state: 'draft' };
    await admin.model('ir.lifecycle').browse((await admin.model('ir.lifecycle').search([['model', '=', 'pl.doc']])).ids).unlink();
    try {
      for (const field of ['name', 'tag_ids']) {
        await expect(admin.model('ir.lifecycle').create({ ...doc, locks: [{ states: ['posted'], frozen_children: [field] }] }))
          .rejects.toThrow(/must be a one2many with an inverse many2one|frozen child/);
      }
      await expect(admin.model('ir.lifecycle').create({ ...doc, locks: [{ states: ['posted'], unlink: true, frozen_children: ['line_ids'] }] }))
        .rejects.toThrow(/cannot allow unlink and freeze children/);
    } finally {
      await admin.model('ir.lifecycle').create(DOC_LIFECYCLE);
    }
  });

  it('allows a stateless child declaring only engine fields, but no locks', async () => {
    const [id] = (await admin.model('ir.lifecycle').search([['model', '=', 'pl.eline']])).ids;
    expect(id).toBeDefined();
    await expect(admin.model('ir.lifecycle').browse(id!).write({ locks: [{ states: ['x'] }] })).rejects.toThrow(/locks need a state field/);
  });

  it('keeps one policy per model', async () => {
    await expect(admin.model('ir.lifecycle').create(DOC_LIFECYCLE)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('create', () => {
  it('defaults to the initial state and refuses any other starting state', async () => {
    const id = await newDoc();
    expect((await row('pl.doc', id)).state).toBe('draft');
    await expect(root.model('pl.doc').create({ name: 'X', state: 'posted' })).rejects.toBeInstanceOf(LifecycleError);
    await expect(root.model('pl.doc').create({ name: 'X', state: 'posted' })).rejects.toThrow(/start in state 'draft'/);
    await expect(alice.model('pl.doc').create({ name: 'X', state: 'posted' })).rejects.toBeInstanceOf(LifecycleError);
    expect((await root.model('pl.doc').create({ name: 'ok', state: 'draft' })).ids).toHaveLength(1);
  });

  it('refuses transition-only and engine fields without a token, allows them with one', async () => {
    await expect(root.model('pl.doc').create({ name: 'X', number: 'N1' })).rejects.toThrow(/maintained by the engine/);
    await expect(root.model('pl.doc').create({ name: 'X', approved_by: 'me' })).rejects.toThrow(/by a transition/);
    // blank values are not a change
    expect((await root.model('pl.doc').create({ name: 'blank', number: null, approved_by: false })).ids).toHaveLength(1);
    const [id] = (await root.transaction(() => withWriteToken(rootImpl(), { op: 'create', model: 'pl.doc', fields: ['number', 'state'] },
      () => root.model('pl.doc').create({ name: 'T', number: 'N2', state: 'posted' })))).ids;
    expect(await row('pl.doc', id!)).toMatchObject({ number: 'N2', state: 'posted' });
  });

  it('a create token is one-shot and must cover every refused field', async () => {
    await expect(root.transaction(() => withWriteToken(rootImpl(), { op: 'create', model: 'pl.doc', fields: ['number'] },
      () => root.model('pl.doc').create({ name: 'X', number: 'N3', approved_by: 'me' })))).rejects.toThrow(/field 'approved_by' can only be set by a transition/);
    await root.transaction(() => withWriteToken(rootImpl(), { op: 'create', model: 'pl.doc', fields: ['number'] }, async () => {
      await root.model('pl.doc').create({ name: 'one', number: 'N4' });
      await expect(root.model('pl.doc').create({ name: 'two', number: 'N5' })).rejects.toThrow(/maintained by the engine/);
    }));
  });

  it('cannot add rows to a locked parent', async () => {
    const { doc } = await postedDoc();
    await expect(root.model('pl.line').create({ doc_id: doc, name: 'late' })).rejects.toBeInstanceOf(LifecycleError);
    await expect(root.model('pl.line').create({ doc_id: doc, name: 'late' })).rejects.toThrow(/frozen/);
    const draft = await newDoc();
    expect((await root.model('pl.line').create({ doc_id: draft, name: 'ok' })).ids).toHaveLength(1);
  });
});

describe('write in a locked state', () => {
  it('refuses fields that are not writable, also for the superuser and for users', async () => {
    const { doc } = await postedDoc();
    await expect(write(doc, { name: 'changed' })).rejects.toBeInstanceOf(LifecycleError);
    await expect(write(doc, { name: 'changed' })).rejects.toThrow(/locked in state 'posted'/);
    await expect(alice.model('pl.doc').browse(doc).write({ amount: 99 })).rejects.toBeInstanceOf(LifecycleError);
    expect((await row('pl.doc', doc)).name).toBe('D');
  });

  it('allows writable fields and ignores values equal to the current ones (full-record save)', async () => {
    const { doc } = await postedDoc();
    await write(doc, { note: 'free' });
    const current = await row('pl.doc', doc);
    await write(doc, {
      name: current.name, state: current.state, amount: current.amount, number: current.number, approved_by: current.approved_by,
      meta: current.meta, note: 'full save', tag_ids: [],
    });
    expect((await row('pl.doc', doc)).note).toBe('full save');
    await expect(write(doc, { name: current.name, amount: 11 })).rejects.toThrow(/field 'amount'/);
  });

  it('is unrestricted for ordinary fields while the record is not locked', async () => {
    const doc = await newDoc();
    await write(doc, { name: 'renamed', amount: 5, note: 'n' });
    expect(await row('pl.doc', doc)).toMatchObject({ name: 'renamed', amount: 5, note: 'n' });
  });

  it('ignores an equal json value and refuses a changed one', async () => {
    const { doc } = await postedDoc();
    await withToken({ op: 'write', model: 'pl.doc', ids: [doc], fields: ['meta'] }, () => write(doc, { meta: { a: 1 } }));
    await write(doc, { meta: { a: 1 }, note: 'same json' });
    await expect(write(doc, { meta: { a: 2 } })).rejects.toThrow(/field 'meta'/);
  });

  it('refuses changing an x2many field that is not writable, but accepts an unchanged id list', async () => {
    const { doc } = await postedDoc();
    const [tag] = (await root.model('pl.tag').create({ name: 't' })).ids;
    await expect(write(doc, { tag_ids: [tag] })).rejects.toThrow(/field 'tag_ids'/);
    await write(doc, { tag_ids: [], note: 'x' });
  });

  it('refuses unlink, with or without a token that names the unlink', async () => {
    const { doc } = await postedDoc();
    await expect(root.model('pl.doc').browse(doc).unlink()).rejects.toThrow(/cannot be deleted in state 'posted'/);
    await expect(alice.model('pl.doc').browse(doc).unlink()).rejects.toBeInstanceOf(LifecycleError);
    // a write token does not cover an unlink
    await expect(root.transaction(() => withWriteToken(rootImpl(), { op: 'write', model: 'pl.doc', ids: [doc], fields: ['state'] },
      () => root.model('pl.doc').browse(doc).unlink()))).rejects.toBeInstanceOf(LifecycleError);
    const draft = await newDoc();
    await root.model('pl.doc').browse(draft).unlink();
    // an unlink token that names exactly these records is the engine's way to delete (e.g. unmatch)
    await root.transaction(() => withWriteToken(rootImpl(), { op: 'unlink', model: 'pl.doc', ids: [doc] },
      () => root.model('pl.doc').browse(doc).unlink()));
    expect(await root.model('pl.doc').search([['id', '=', doc]])).toHaveProperty('ids', []);
  });
});

describe('transition-only and engine fields', () => {
  it('refuse changes without a token, in any state', async () => {
    const doc = await newDoc();
    await expect(write(doc, { state: 'posted' })).rejects.toThrow(/only be changed by a transition/);
    await expect(write(doc, { approved_by: 'me' })).rejects.toThrow(/only be changed by a transition/);
    await expect(write(doc, { number: 'N1' })).rejects.toThrow(/maintained by the engine/);
    await write(doc, { state: 'draft', approved_by: null, number: null, note: 'equal values pass' });
  });

  it('are allowed by a token covering them, and by nothing else', async () => {
    const doc = await newDoc();
    await withToken({ op: 'write', model: 'pl.doc', ids: [doc], fields: ['state', 'number', 'approved_by'] },
      () => write(doc, { state: 'posted', number: 'INV/1', approved_by: 'boss' }));
    expect(await row('pl.doc', doc)).toMatchObject({ state: 'posted', number: 'INV/1', approved_by: 'boss' });
    // a token never bypasses a locked field it does not list
    await expect(withToken({ op: 'write', model: 'pl.doc', ids: [doc], fields: ['state'] }, () => write(doc, { state: 'cancel', name: 'sneaky' })))
      .rejects.toThrow(/field 'name' cannot be changed/);
    expect((await row('pl.doc', doc)).state).toBe('posted');
  });

  it('stateless child models enforce engine fields without any locks', async () => {
    const e = rootImpl().model('pl.eline');
    await expect(e.create({ name: 'x', balance: 5 })).rejects.toThrow(/maintained by the engine/);
    const [id] = (await e.create({ name: 'x' })).ids;
    await e.browse(id!).write({ name: 'y' });
    await expect(e.browse(id!).write({ balance: 7 })).rejects.toThrow(/maintained by the engine/);
    await root.transaction(() => withWriteToken(rootImpl(), { op: 'write', model: 'pl.eline', ids: [id!], fields: ['balance'] },
      () => e.browse(id!).write({ balance: 7 })));
    expect((await row('pl.eline', id!)).balance).toBe(7);
    await e.browse(id!).unlink();
  });
});

describe('write tokens', () => {
  it('are one-shot', async () => {
    const doc = await newDoc();
    await withToken({ op: 'write', model: 'pl.doc', ids: [doc], fields: ['state'] }, async () => {
      await write(doc, { state: 'posted' });
      await expect(write(doc, { state: 'cancel' })).rejects.toThrow(/only be changed by a transition/);
    });
    expect((await row('pl.doc', doc)).state).toBe('posted');
  });

  it('match the model, operation and exact ids', async () => {
    const [a, b] = [await newDoc(), await newDoc()];
    await expect(withToken({ op: 'write', model: 'pl.doc', ids: [a], fields: ['state'] }, () => write(b, { state: 'posted' })))
      .rejects.toThrow(/only be changed by a transition/);
    // a token for [a] does not cover [a, b] either
    await expect(withToken({ op: 'write', model: 'pl.doc', ids: [a], fields: ['state'] }, () => root.model('pl.doc').browse([a, b]).write({ state: 'posted' })))
      .rejects.toThrow(/only be changed by a transition/);
    await expect(withToken({ op: 'write', model: 'pl.line', ids: [a], fields: ['state'] }, () => write(a, { state: 'posted' })))
      .rejects.toThrow(/only be changed by a transition/);
    await expect(withToken({ op: 'create', model: 'pl.doc', fields: ['state'] }, () => write(a, { state: 'posted' })))
      .rejects.toThrow(/only be changed by a transition/);
    // exact ids, in any order
    await withToken({ op: 'write', model: 'pl.doc', ids: [b, a], fields: ['state'] }, () => root.model('pl.doc').browse([a, b]).write({ state: 'posted' }));
    expect((await row('pl.doc', b)).state).toBe('posted');
  });

  it('are not part of the env context and end with their callback', async () => {
    const doc = await newDoc();
    await withToken({ op: 'write', model: 'pl.doc', ids: [doc], fields: ['state'] }, async () => {
      expect(JSON.stringify(rootImpl().context)).not.toMatch(/token/i);
      await write(doc, { state: 'posted' });
    });
    await expect(write(doc, { state: 'cancel' })).rejects.toBeInstanceOf(LifecycleError);
    await expect(root.transaction(() => withWriteToken(rootImpl(), { op: 'write', model: 'pl.doc', ids: [] }, async () => 1))).rejects.toThrow(/exact record ids/);
    await expect(withWriteToken(rootImpl(), { op: 'write', model: 'pl.doc', ids: [doc] }, async () => 1)).rejects.toThrow(/enclosing/);
  });

  it('cannot be reused by a nested automation write in the same transaction', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'pl.reopen', model: 'pl.doc', type: 'update_record', values: { state: "'cancel'" } });
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'pl.auto', model: 'pl.doc', trigger: 'on_write', filterPre: [['state', '=', 'draft']], filter: [['state', '=', 'posted']], action: 'pl.reopen' });
    try {
      const doc = await newDoc();
      // the transition's write consumed the token; the automation's own state write (same ids, same field) is refused
      // and rolls the whole write back
      await expect(withToken({ op: 'write', model: 'pl.doc', ids: [doc], fields: ['state'] }, () => write(doc, { state: 'posted' })))
        .rejects.toThrow(/only be changed by a transition/);
      expect((await row('pl.doc', doc)).state).toBe('draft');
    } finally {
      await rules.define({ key: 'pl.auto', model: 'pl.doc', trigger: 'on_write', action: 'pl.reopen', enabled: false });
    }
    // without the rule the very same token write succeeds
    const doc = await newDoc();
    await post(doc);
    expect((await row('pl.doc', doc)).state).toBe('posted');
  });
});

describe('frozen children', () => {
  it('refuse write and unlink of rows of a locked parent, also through the parent', async () => {
    const { doc, line } = await postedDoc();
    await expect(root.model('pl.line').browse(line).write({ qty: 5 })).rejects.toBeInstanceOf(LifecycleError);
    await expect(root.model('pl.line').browse(line).unlink()).rejects.toThrow(/frozen/);
    await expect(alice.model('pl.line').browse(line).write({ name: 'x' })).rejects.toBeInstanceOf(LifecycleError);
    await expect(write(doc, { line_ids: [{ op: 'create', values: { name: 'N' } }] })).rejects.toThrow(/frozen/);
    await expect(write(doc, { line_ids: [{ op: 'update', id: line, values: { qty: 9 } }] })).rejects.toThrow(/frozen/);
    await expect(write(doc, { line_ids: [{ op: 'delete', id: line }] })).rejects.toThrow(/frozen/);
    await expect(write(doc, { line_ids: [{ op: 'unlink', id: line }] })).rejects.toThrow(/frozen/);
    await expect(write(doc, { line_ids: [{ op: 'clear' }] })).rejects.toThrow(/frozen/);
    await expect(write(doc, { line_ids: [] })).rejects.toThrow(/frozen/);
    expect(await row('pl.line', line)).toMatchObject({ qty: 2, doc_id: doc });
  });

  it('accept an unchanged save of the parent, and no-op line writes', async () => {
    const { doc, line } = await postedDoc();
    await write(doc, { note: 'resave', line_ids: [line] });
    await root.model('pl.line').browse(line).write({ qty: 2, name: 'L1' });
  });

  it('refuse moving a row into or out of a locked parent', async () => {
    const { doc, line } = await postedDoc();
    const other = await newDoc();
    const [mine] = (await root.model('pl.line').create({ doc_id: other, name: 'mine' })).ids;
    await expect(root.model('pl.line').browse(mine!).write({ doc_id: doc })).rejects.toThrow(/frozen/);
    await expect(root.model('pl.line').browse(line).write({ doc_id: other })).rejects.toThrow(/frozen/);
    await expect(root.model('pl.line').browse(line).write({ doc_id: false })).rejects.toThrow(/frozen/);
    await expect(write(doc, { line_ids: [{ op: 'link', id: mine! }] })).rejects.toThrow(/frozen/);
  });

  it('are only editable under a token covering the fields', async () => {
    const { line } = await postedDoc();
    await withToken({ op: 'write', model: 'pl.line', ids: [line], fields: ['qty'] }, () => root.model('pl.line').browse(line).write({ qty: 8 }));
    expect((await row('pl.line', line)).qty).toBe(8);
    await expect(withToken({ op: 'write', model: 'pl.line', ids: [line], fields: ['qty'] }, () => root.model('pl.line').browse(line).write({ qty: 9, name: 'z' })))
      .rejects.toThrow(/frozen/);
  });

  it('stay editable while the parent is not locked, and the lock follows the parent state', async () => {
    const doc = await newDoc({ line_ids: [{ op: 'create', values: { name: 'a' } }] });
    const [line] = (await root.model('pl.line').search([['doc_id', '=', doc]])).ids;
    await write(doc, { line_ids: [{ op: 'update', id: line!, values: { qty: 4 } }, { op: 'create', values: { name: 'b' } }] });
    await root.model('pl.line').browse(line!).write({ qty: 6 });
    await post(doc);
    await expect(root.model('pl.line').browse(line!).write({ qty: 7 })).rejects.toThrow(/frozen/);
    expect((await row('pl.line', line!)).qty).toBe(6);
  });
});

describe('models without a policy', () => {
  it('are unaffected', async () => {
    const f = root.model('pl.free');
    const [id] = (await f.create({ name: 'a', state: 'b' })).ids;
    await f.browse(id!).write({ name: 'z', state: 'a' });
    await f.browse(id!).unlink();
  });
});

describe('policy index refresh', () => {
  it('follows create, edit, deactivate and delete of ir.lifecycle', async () => {
    const [a] = (await root.model('pl.late').create({ name: 'a' })).ids;
    const late = (id: number, vals: Record<string, unknown>) => root.model('pl.late').browse(id).write(vals);
    await late(a!, { state: 'done' }); // no policy yet: free

    const [policy] = (await admin.model('ir.lifecycle').create({
      model: 'pl.late', state_field: 'state', initial_state: 'new', locks: [{ states: ['done'], writable: [] }],
    })).ids;
    await expect(late(a!, { name: 'b' })).rejects.toThrow(/locked in state 'done'/);
    await admin.model('ir.lifecycle').browse(policy!).write({ locks: [{ states: ['done'], writable: ['name'] }] });
    await late(a!, { name: 'b' });
    await admin.model('ir.lifecycle').browse(policy!).write({ active: false });
    await late(a!, { state: 'new' });
    await admin.model('ir.lifecycle').browse(policy!).write({ active: true });
    await expect(late(a!, { state: 'done' })).rejects.toThrow(/only be changed by a transition/);
    await admin.model('ir.lifecycle').browse(policy!).unlink();
    await late(a!, { state: 'done', name: 'free again' });
  });

  it('never keeps a policy from a rolled-back transaction, and sees its own uncommitted edit', async () => {
    const [a] = (await root.model('pl.late').create({ name: 'a', state: 'done' })).ids;
    await expect(admin.transaction(async () => {
      await admin.model('ir.lifecycle').create({ model: 'pl.late', state_field: 'state', initial_state: 'new', locks: [{ states: ['done'] }] });
      await expect(root.model('pl.late').browse(a!).write({ name: 'inside' })).rejects.toThrow(/locked in state 'done'/);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    await root.model('pl.late').browse(a!).write({ name: 'after rollback' });
    expect((await row('pl.late', a!)).name).toBe('after rollback');
  });

  it('rebuilds after a registry reload', async () => {
    const reg = (rootImpl().registry as { reload(): Promise<void> });
    const doc = await newDoc();
    await reg.reload();
    await expect(write(doc, { number: 'x' })).rejects.toThrow(/maintained by the engine/);
  });
});

describe('create defaults', () => {
  it('refuses engine and transition-only values injected through the context or stored defaults', async () => {
    await expect(root.withContext({ default_number: 'N9' }).model('pl.doc').create({ name: 'x' })).rejects.toThrow(/context or stored default/);
    await expect(root.withContext({ default_approved_by: 'me' }).model('pl.doc').create({ name: 'x' })).rejects.toThrow(/context or stored default/);
    await expect(root.withContext({ default_state: 'posted' }).model('pl.doc').create({ name: 'x' })).rejects.toThrow(/start in state/);
    const [def] = (await admin.model('ir.default').create({ model_name: 'pl.doc', field_name: 'approved_by', value_json: '"boss"' })).ids;
    try {
      await expect(root.model('pl.doc').create({ name: 'x' })).rejects.toThrow(/context or stored default/);
      // an explicit blank wins over the stored default and is harmless
      expect((await root.model('pl.doc').create({ name: 'x', approved_by: null })).ids).toHaveLength(1);
    } finally {
      await admin.model('ir.default').browse(def!).unlink();
    }
  });

  it('accepts the field\'s own static default and a token covering an injected value', async () => {
    const [id] = (await root.model('pl.eline').create({ name: 'static' })).ids;
    expect((await row('pl.eline', id!)).counter).toBe(0);
    await root.transaction(() => withWriteToken(rootImpl(), { op: 'create', model: 'pl.doc', fields: ['number'] },
      () => root.withContext({ default_number: 'N7' }).model('pl.doc').create({ name: 'tok' })));
  });
});

describe('copy', () => {
  it('restarts a copied record in the initial state without engine or transition-only values', async () => {
    const { doc } = await postedDoc();
    await withToken({ op: 'write', model: 'pl.doc', ids: [doc], fields: ['number', 'approved_by'] }, () => write(doc, { number: 'N1', approved_by: 'x' }));
    const [copy] = (await root.model('pl.doc').browse(doc).copy()).ids;
    expect(await row('pl.doc', copy!)).toMatchObject({ state: 'draft', number: null, approved_by: null, name: 'D' });
    expect((await root.model('pl.line').search([['doc_id', '=', copy!]])).ids).toHaveLength(1);
  });
});

describe('database cascades', () => {
  it('refuse deleting a master referenced by locked records, allow it for unlocked ones', async () => {
    const free = (await root.model('pl.master').create({ name: 'free' })).ids[0]!;
    const draft = await newDoc({ master_id: free });
    await root.model('pl.master').browse(free).unlink(); // only a draft references it: set null is fine
    expect((await row('pl.doc', draft)).master_id).toBeNull();

    const m1 = (await root.model('pl.master').create({ name: 'used by doc' })).ids[0]!;
    const posted = await newDoc({ master_id: m1 });
    await post(posted);
    await expect(root.model('pl.master').browse(m1).unlink()).rejects.toThrow(/locked pl.doc record references it/);
    expect((await row('pl.doc', posted)).master_id).toBe(m1);

    const m2 = (await root.model('pl.master').create({ name: 'used by a frozen line' })).ids[0]!;
    const { line } = await postedDoc();
    await withToken({ op: 'write', model: 'pl.line', ids: [line], fields: ['master_id'] }, () => root.model('pl.line').browse(line).write({ master_id: m2 }));
    await expect(root.model('pl.master').browse(m2).unlink()).rejects.toThrow(/locked pl.line record references it/);
  });
});

describe('policy robustness', () => {
  it('fails closed when an active policy row became unusable, and recovers when it is fixed', async () => {
    const [policy] = (await admin.model('ir.lifecycle').create({
      model: 'pl.late', state_field: 'state', initial_state: 'new', engine_fields: ['name'],
    })).ids;
    const late = root.model('pl.late');
    const [a] = (await late.create({ name: null })).ids;
    // out-of-band edit (not through the ORM): the fingerprint still notices it
    const sql = (text: string) => tenant.driver.query({ text, params: [] });
    await sql(`UPDATE ir_lifecycle SET engine_fields = '["ghost"]'::jsonb, write_date = now() WHERE id = ${policy}`);
    await expect(late.browse(a!).write({ state: 'new' })).rejects.toThrow(/is unusable/);
    await expect(late.create({})).rejects.toThrow(/is unusable/);
    await expect(late.browse(a!).unlink()).rejects.toThrow(/is unusable/);
    await sql(`UPDATE ir_lifecycle SET engine_fields = '[]'::jsonb, write_date = now() WHERE id = ${policy}`);
    await late.browse(a!).write({ name: 'ok again' });
    await admin.model('ir.lifecycle').browse(policy!).unlink();
  });

  it('treats a NULL state as the initial state for locking', async () => {
    const [row0] = (await root.model('pl.late').create({ name: 'orig' })).ids;
    await tenant.driver.query({ text: 'UPDATE pl_late SET state = NULL WHERE id = $1', params: [row0] });
    const [policy2] = (await admin.model('ir.lifecycle').create({
      model: 'pl.late', state_field: 'state', initial_state: 'new', locks: [{ states: ['new'], writable: [] }],
    })).ids;
    await expect(root.model('pl.late').browse(row0!).write({ name: 'changed' })).rejects.toThrow(/locked in state 'new'/);
    await admin.model('ir.lifecycle').browse(policy2!).unlink();
  });

  it('tolerates a missing ir_lifecycle table (upgrade ordering)', async () => {
    const m2 = new PgliteTenantManager({ models: async () => models });
    try {
      const t2 = await m2.open('policy-no-table');
      await ensureSecurityTables(t2.driver);
      await t2.driver.query({ text: 'DROP TABLE ir_lifecycle', params: [] });
      const env2 = t2.env({ uid: 1 });
      expect((await env2.model('pl.free').create({ name: 'x' })).ids).toHaveLength(1);
    } finally {
      await m2.closeAll();
    }
  });

  it('applies to module-data style superuser writes and uninstall-style unlinks of locked records', async () => {
    const { doc } = await postedDoc();
    await expect(root.sudo().model('pl.doc').browse(doc).write({ name: 'data load' })).rejects.toBeInstanceOf(LifecycleError);
    await expect(root.sudo().model('pl.doc').browse(doc).unlink()).rejects.toBeInstanceOf(LifecycleError);
  });
});
