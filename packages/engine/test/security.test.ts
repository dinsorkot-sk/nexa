import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, PgliteTenantManager, combineDomains, ensureSecurityTables, securityModels, writeModuleSecurity,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';

const all = { read: true, write: true, create: true, unlink: true };
const readOnly = { read: true, write: false, create: false, unlink: false };

const models: ModelDef[] = [
  ...securityModels,
  {
    name: 'note', origin: 'module',
    fields: {
      name: { type: 'char' },
      owner_id: { type: 'many2one', comodel: 'res.users' },
      company_id: { type: 'many2one', comodel: 'res.company' },
      secret: { type: 'char', groups: ['base.group_manager'] },
      line_ids: { type: 'one2many', comodel: 'note.line', inverseName: 'note_id' },
      tag_ids: { type: 'many2many', comodel: 'note.tag' },
      secret_alias: { type: 'char', related: 'owner_id.login' },
    },
  },
  { name: 'note.line', origin: 'module', fields: { note_id: { type: 'many2one', comodel: 'note', ondelete: 'cascade' }, txt: { type: 'char' } } },
  { name: 'unprotected', origin: 'module', fields: { name: { type: 'char' } } },
  { name: 'note.tag', origin: 'module', fields: { name: { type: 'char' }, company_id: { type: 'many2one', comodel: 'res.company' } } },
];

let mgr: PgliteTenantManager;
let h: TenantHandle;
let root: Env;
const id: Record<string, number> = {};

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  h = await mgr.open('sec');
  await ensureSecurityTables(h.driver);
  root = h.env({ uid: 1 }); // superuser
  [id.c1] = (await root.model('res.company').create({ name: 'C1' })).ids;
  [id.c2] = (await root.model('res.company').create({ name: 'C2' })).ids;
  [id.gUser] = (await root.model('res.groups').create({ name: 'User', code: 'base.group_user' })).ids;
  [id.gMgr] = (await root.model('res.groups').create({ name: 'Manager', code: 'base.group_manager', implied_ids: [id.gUser] })).ids;
  // uid 1 is the superuser; make sure our test users get other ids
  [id.admin] = (await root.model('res.users').create({ name: 'Root', login: 'root', company_id: id.c1 })).ids;
  [id.alice] = (await root.model('res.users').create({ name: 'Alice', login: 'alice', company_id: id.c1, group_ids: [id.gUser] })).ids;
  [id.bob] = (await root.model('res.users').create({ name: 'Bob', login: 'bob', company_id: id.c2, company_ids: [id.c1, id.c2], group_ids: [id.gMgr] })).ids;
  [id.nobody] = (await root.model('res.users').create({ name: 'Nobody', login: 'nobody', company_id: id.c1 })).ids;
  [id.ghost] = (await root.model('res.users').create({ name: 'Ghost', login: 'ghost', company_id: id.c1, active: false, group_ids: [id.gUser] })).ids;

  await writeModuleSecurity(h.driver, 'notes', [
    { model: 'note', group: 'base.group_user', perms: { read: true, write: true, create: true, unlink: false } },
    { model: 'note', group: 'base.group_manager', perms: all },
    { model: 'note.line', group: 'base.group_user', perms: all },
    { model: 'res.company', group: null, perms: readOnly },
  ], [
    // multi-company (global): only records of the env's active companies (or shared)
    { name: 'note_company', model: 'note', groups: [], perms: all,
      domain: ['|', ['company_id', '=', false], ['company_id', 'in', { $ctx: 'company_ids' }]] as never },
    // users only see their own notes; managers see all
    { name: 'note_own', model: 'note', groups: ['base.group_user'], perms: all, domain: [['owner_id', '=', { $ctx: 'uid' }]] as never },
    { name: 'note_all', model: 'note', groups: ['base.group_manager'], perms: all, domain: [] },
  ]);

  await root.model('note').create([
    { name: 'alice-c1', owner_id: id.alice, company_id: id.c1, secret: 's1' },
    { name: 'bob-c1', owner_id: id.bob, company_id: id.c1 },
    { name: 'bob-c2', owner_id: id.bob, company_id: id.c2 },
    { name: 'shared', owner_id: id.alice },
  ]);
}, 60_000);
afterAll(() => mgr.closeAll());

const as = (uid: number, companyIds?: number[]) => h.env({ uid, companyIds });
const names = async (env: Env) => (await env.model('note').searchRead([], ['name'], { order: 'id asc' })).map((r) => r.name);

describe('ACL', () => {
  it('denies models without access rows and users without groups', async () => {
    await expect(as(id.alice).model('unprotected').search([])).rejects.toThrow(AccessError);
    await expect(as(id.nobody).model('note').search([])).rejects.toThrow(AccessError);
  });
  it('grants per operation and through implied groups', async () => {
    const alice = as(id.alice).model('note');
    const [n] = (await alice.search([['name', '=', 'alice-c1']])).ids;
    await expect(alice.browse(n).unlink()).rejects.toThrow(/not allowed to unlink/);
    await expect(as(id.alice).model('res.company').create({ name: 'X' })).rejects.toThrow(AccessError);
    expect((await as(id.alice).model('res.company').searchRead([], ['name'])).length).toBe(2);
  });
  it('rejects archived and unknown users', async () => {
    await expect(as(id.ghost).model('note').search([])).rejects.toThrow(/archived/);
    await expect(as(9999).model('note').search([])).rejects.toThrow(/does not exist/);
  });
});

describe('record rules', () => {
  it('group rules OR, global rules AND (own notes in active company + shared)', async () => {
    expect(await names(as(id.alice))).toEqual(['alice-c1', 'shared']);
  });
  it('manager rule widens, but the company rule still applies', async () => {
    expect(await names(as(id.bob))).toEqual(['bob-c2', 'shared']); // default company c2
    expect(await names(as(id.bob, [id.c1, id.c2]))).toEqual(['alice-c1', 'bob-c1', 'bob-c2', 'shared']);
  });
  it('blocks direct read/write/unlink of records outside the rules', async () => {
    const [bobs] = (await root.model('note').search([['name', '=', 'bob-c1']])).ids;
    const alice = as(id.alice).model('note');
    await expect(alice.browse(bobs).read(['name'])).rejects.toThrow(/Record rules forbid read/);
    await expect(alice.browse(bobs).write({ name: 'hacked' })).rejects.toThrow(/Record rules forbid write/);
    expect((await root.model('note').browse(bobs).read(['name']))[0].name).toBe('bob-c1');
  });
  it('checks created records and written values (no moving out of scope)', async () => {
    const alice = as(id.alice).model('note');
    await expect(alice.create({ name: 'for bob', owner_id: id.bob, company_id: id.c1 })).rejects.toThrow(/forbid create/);
    expect(await root.model('note').searchCount([['name', '=', 'for bob']])).toBe(0);
    const mine = await alice.create({ name: 'mine', owner_id: id.alice, company_id: id.c1 });
    await expect(mine.write({ company_id: id.c2 })).rejects.toThrow(/forbid write/);
    expect((await root.model('note').browse(mine.ids[0]).read(['company_id']))[0].company_id).toBe(id.c1);
  });
  it('rejects companies the user is not allowed in', async () => {
    await expect(as(id.alice, [id.c2]).model('note').search([])).rejects.toThrow(/may not access companies/);
  });
  it('searchCount and dotted searches respect rules', async () => {
    expect(await as(id.alice).model('note').searchCount([])).toBe(3); // alice-c1, shared, mine
    expect(await as(id.alice).model('note').searchCount([['owner_id.login', '=', 'bob']])).toBe(0);
  });
});

describe('field groups', () => {
  it('hides restricted fields from default reads and rejects explicit access', async () => {
    const alice = as(id.alice).model('note');
    const rows = await alice.searchRead([['name', '=', 'alice-c1']]);
    expect(rows[0]).not.toHaveProperty('secret');
    await expect(alice.searchRead([], ['secret'])).rejects.toThrow(/restricted/);
    await expect(alice.create({ name: 'n', owner_id: id.alice, secret: 'x' })).rejects.toThrow(/restricted/);
    const bob = await as(id.bob, [id.c1]).model('note').searchRead([['name', '=', 'alice-c1']], ['secret']);
    expect(bob[0].secret).toBe('s1');
  });
});

describe('domain combination', () => {
  const a = ['a', '=', 1] as const;
  const b = ['b', '=', 2] as const;
  const c = ['c', '=', 3] as const;
  it('makes implicit ANDs explicit before combining', () => {
    expect(combineDomains('|', [[a, b], [c]])).toEqual(['|', '&', a, b, c]);
    expect(combineDomains('&', [['|', a, b], [c]])).toEqual(['&', '|', a, b, c]);
    expect(combineDomains('&', [['!', a, b], []])).toEqual(['&', '!', a, b]);
  });
  it('treats an empty domain as TRUE', () => {
    expect(combineDomains('|', [[a], []])).toEqual([]);
    expect(combineDomains('&', [[], [a]])).toEqual([a]);
  });
});

describe('superuser', () => {
  it('uid 1 and sudo() bypass all checks', async () => {
    expect(root.su).toBe(true);
    expect(await root.model('unprotected').searchCount([])).toBe(0);
    expect(await as(id.alice).sudo().model('note').searchCount([])).toBeGreaterThanOrEqual(5);
  });
  it('non-superuser env without security models is refused', async () => {
    const plain = new PgliteTenantManager({ models: async () => [{ name: 'x', origin: 'module', fields: {} }] });
    try {
      const e = (await plain.open('plain')).env({ uid: 2 });
      await expect(e.model('x').search([])).rejects.toThrow(/Security models are not installed/);
    } finally {
      await plain.closeAll();
    }
  });
});

describe('review regressions (T6)', () => {
  beforeAll(async () => {
    await writeModuleSecurity(h.driver, 'extra', [
      { model: 'note.tag', group: 'base.group_user', perms: readOnly },
      { model: 'res.users', group: 'base.group_user', perms: { read: true, write: true, create: false, unlink: false } },
    ], [
      { name: 'tag_company', model: 'note.tag', groups: [], perms: all, domain: [['company_id', 'in', { $ctx: 'company_ids' }]] as never },
      { name: 'user_self', model: 'res.users', groups: ['base.group_user'], perms: { read: false, write: true, create: false, unlink: false },
        domain: [['id', '=', { $ctx: 'uid' }]] as never },
    ]);
  });
  const fresh = (uid: number, companyIds?: number[]) => h.env({ uid, companyIds }); // new env => reloads rules

  it('#1 a malformed user domain cannot negate or absorb the record rules', async () => {
    const notes = fresh(id.alice).model('note');
    await expect(notes.search([['id', '>', 0], '!'])).rejects.toThrow(/Malformed domain/);
    await expect(notes.search([['id', '>', 0], '|', ['id', '>', 0]])).rejects.toThrow(/Malformed domain/);
    expect((await notes.search(['!', ['owner_id', '=', id.alice]])).ids).toEqual([]);
  });

  it('#2 cannot link records the user may not read; clear keeps invisible links', async () => {
    const [t1] = (await root.model('note.tag').create({ name: 't-c1', company_id: id.c1 })).ids;
    const [t2] = (await root.model('note.tag').create({ name: 't-c2', company_id: id.c2 })).ids;
    const [n] = (await root.model('note').create({ name: 'tagged', owner_id: id.alice, company_id: id.c1, tag_ids: [t1, t2] })).ids;
    const alice = fresh(id.alice).model('note');
    await expect(alice.browse(n).write({ tag_ids: [{ op: 'link', id: t2 }] })).rejects.toThrow(/Cannot link/);
    await expect(alice.browse(n).write({ tag_ids: [{ op: 'link', id: 999_999 }] })).rejects.toThrow(/Cannot link/);
    await alice.browse(n).write({ tag_ids: false });
    expect((await root.model('note').browse(n).read(['tag_ids']))[0].tag_ids).toEqual([t2]);
  });

  it('#3 users cannot grant themselves groups or companies', async () => {
    const me = fresh(id.alice).model('res.users').browse(id.alice);
    await expect(me.write({ group_ids: [{ op: 'link', id: id.gMgr }] })).rejects.toThrow(/restricted/);
    await expect(me.write({ company_ids: [id.c2] })).rejects.toThrow(/restricted/);
    await me.write({ name: 'Alice A.' }); // own preferences still allowed
    await expect(fresh(id.alice).model('res.users').browse(id.bob).write({ name: 'x' })).rejects.toThrow(/forbid write/);
  });

  it('#4 x2many reads only return comodel records the user may read', async () => {
    const [t1] = (await root.model('note.tag').search([['name', '=', 't-c1']])).ids;
    const [t2] = (await root.model('note.tag').search([['name', '=', 't-c2']])).ids;
    const [n] = (await root.model('note').create({ name: 'two-tags', owner_id: id.alice, company_id: id.c1, tag_ids: [t1, t2] })).ids;
    expect((await fresh(id.alice).model('note').browse(n).read(['tag_ids']))[0].tag_ids).toEqual([t1]);
  });

  it('#5 paths and any() do not reveal comodel records hidden by rules', async () => {
    const notes = fresh(id.alice).model('note');
    expect(await notes.searchCount([['tag_ids.name', '=', 't-c2']])).toBe(0);
    expect(await notes.searchCount([['tag_ids', 'any', [['company_id', '=', id.c2]]]])).toBe(0);
    expect(await notes.searchCount([['tag_ids.name', '=', 't-c1']])).toBe(1); // only 'two-tags' still links t1 ('tagged' lost it in #2)
  });

  it('related fields inherit the groups of their target', () => {
    expect(h.registry.get('note').fields.get('secret_alias')!.groups).toBeUndefined(); // login is not restricted
    const reg = h.registry.get('res.users').fields.get('group_ids')!;
    expect(reg.groups).toEqual(['base.group_erp_manager']);
  });
});
