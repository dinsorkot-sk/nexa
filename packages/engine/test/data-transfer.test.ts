import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, PgliteTenantManager, ValidationError, ensureSecurityTables, securityModels, writeModuleSecurity,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';
import {
  DataExportService, DataImportService, ExportTemplateService, parseCsv, toCsv, convertScalar, joinList, splitList, ensureDataTransferTables,
} from '../src/services/data-transfer.js';
import { SavedFilterService } from '../src/services/filters.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  { name: 'dt.tag', origin: 'module', fields: { name: { type: 'char', required: true } } },
  { name: 'dt.product', origin: 'module', fields: { name: { type: 'char', required: true }, secret: { type: 'char', groups: ['test.manager'] } } },
  { name: 'dt.order', origin: 'module', fields: {
    name: { type: 'char', required: true, string: 'Reference' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['done', 'Confirmed']], default: 'draft' },
    amount: { type: 'float' },
    qty: { type: 'integer' },
    ok: { type: 'boolean' },
    day: { type: 'date' },
    owner_id: { type: 'many2one', comodel: 'res.users' },
    product_id: { type: 'many2one', comodel: 'dt.product' },
    tag_ids: { type: 'many2many', comodel: 'dt.tag' },
    line_ids: { type: 'one2many', comodel: 'dt.line', inverseName: 'order_id' },
    note: { type: 'char', groups: ['test.manager'] },
  } },
  { name: 'dt.line', origin: 'module', fields: {
    order_id: { type: 'many2one', comodel: 'dt.order', required: true, ondelete: 'cascade' },
    product_id: { type: 'many2one', comodel: 'dt.product' },
    qty: { type: 'integer' },
  } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;
let alice: Env;
let admin: Env;
let aliceUid: number;
let bobUid: number;
let p1: number;
let p2: number;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('data-transfer');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  const [company] = (await root.model('res.company').create({ name: 'Main' })).ids;
  const [group] = (await root.model('res.groups').create({ name: 'Users', code: 'test.user' })).ids;
  const [system] = (await root.model('res.groups').create({ name: 'System', code: 'base.group_system' })).ids;
  [aliceUid] = (await root.model('res.users').create({ name: 'Alice', login: 'alice', company_id: company, group_ids: [group] })).ids;
  [bobUid] = (await root.model('res.users').create({ name: 'Bob', login: 'bob', company_id: company, group_ids: [group] })).ids;
  const [adminUid] = (await root.model('res.users').create({ name: 'Admin', login: 'adm', company_id: company, group_ids: [group, system] })).ids;
  await writeModuleSecurity(tenant.driver, 'dt', [
    { model: 'dt.order', group: 'test.user', perms: all },
    { model: 'dt.line', group: 'test.user', perms: all },
    { model: 'dt.product', group: 'test.user', perms: { read: true, write: false, create: false, unlink: false } },
    { model: 'dt.tag', group: 'test.user', perms: all },
    { model: 'res.users', group: 'test.user', perms: { read: true, write: false, create: false, unlink: false } },
  ], [
    { name: 'own_orders', model: 'dt.order', groups: [], perms: all, domain: "[['owner_id', '=', user.id]]" },
  ]);
  alice = tenant.env({ uid: aliceUid! });
  admin = tenant.env({ uid: adminUid! });
  [p1, p2] = (await root.model('dt.product').create([{ name: 'Apple', secret: 's' }, { name: 'Pear' }])).ids as [number, number];
  await root.model('dt.product').create([{ name: 'Dup' }, { name: 'Dup' }]);
  await root.model('dt.tag').create([{ name: 'red' }, { name: 'blue' }]);
}, 60_000);

afterAll(() => mgr.closeAll());

describe('import', () => {
  it('creates records with conversions, many2one by name, many2many lists and one2many sub-rows', async () => {
    const res = await new DataImportService(alice).load('dt.order',
      ['id', 'Reference', 'state', 'amount', 'qty', 'ok', 'day', 'product_id', 'tag_ids', 'owner_id/.id', 'line_ids/product_id', 'line_ids/qty'],
      [
        ['ord_a', 'A', 'Confirmed', '1.5', '3', 'yes', '2026-01-31', 'apple', 'red, blue', aliceUid, 'Apple', '1'],
        ['', '', '', '', '', '', '', '', '', '', 'Pear', '2'],
        ['ord_b', 'B', 'draft', 2, null, false, null, null, '', aliceUid, null, null],
      ]);
    expect(res.errors).toEqual([]);
    expect(res).toMatchObject({ ok: true, created: 4, updated: 0 });
    expect(res.ids).toHaveLength(2);
    const [a] = await alice.model('dt.order').browse(res.ids[0]!).read(['name', 'state', 'amount', 'qty', 'ok', 'product_id', 'tag_ids', 'line_ids']);
    expect(a).toMatchObject({ name: 'A', state: 'done', amount: 1.5, qty: 3, ok: true, product_id: p1 });
    expect(a!.tag_ids).toHaveLength(2);
    const lines = await alice.model('dt.line').searchRead([['order_id', '=', res.ids[0]!]], ['product_id', 'qty'], { order: 'id' });
    expect(lines.map((l) => [l.product_id, l.qty])).toEqual([[p1, 1], [p2, 2]]);

    // same external id updates the existing record
    const again = await new DataImportService(alice).load('dt.order', ['id', 'name', 'owner_id/.id'], [['ord_a', 'A2', aliceUid]]);
    expect(again).toMatchObject({ ok: true, created: 0, updated: 1, ids: [res.ids[0]] });
  });

  it('reports per-cell errors, rolls everything back and honours dry runs', async () => {
    const before = await root.model('dt.order').searchCount([]);
    const res = await new DataImportService(alice).load('dt.order', ['name', 'qty', 'product_id', 'state', 'day', 'owner_id/.id'], [
      ['ok row', '1', 'Apple', 'draft', '2026-02-01', aliceUid],
      ['bad', 'x1', 'Nope', 'weird', '2026-02-30', aliceUid],
      ['amb', '1', 'Dup', 'draft', '', aliceUid],
      ['', '1', '', '', '', aliceUid],
    ]);
    expect(res.ok).toBe(false);
    expect(res.ids).toEqual([]);
    expect(res.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'qty' }),
      expect.objectContaining({ row: 2, field: 'product_id', message: expect.stringContaining('No') }),
      expect.objectContaining({ row: 2, field: 'state' }),
      expect.objectContaining({ row: 2, field: 'day' }),
      expect.objectContaining({ row: 3, field: 'product_id', message: expect.stringContaining('Several') }),
      expect.objectContaining({ row: 4, field: null }), // required name
    ]));
    expect(await root.model('dt.order').searchCount([])).toBe(before);

    const dry = await new DataImportService(alice).load('dt.order', ['name', 'owner_id/.id'], [['dry', aliceUid]], { dryRun: true });
    expect(dry).toMatchObject({ ok: true, dryRun: true, created: 1, ids: [] });
    expect(await root.model('dt.order').searchCount([])).toBe(before);
  });

  it('applies ACL, record rules and field groups as the caller', async () => {
    const imp = new DataImportService(alice);
    await expect(imp.load('dt.order', ['name', 'note'], [['x', 'y']])).rejects.toBeInstanceOf(AccessError);
    // record rule: alice cannot create orders owned by bob
    const res = await imp.load('dt.order', ['name', 'owner_id/.id'], [['x', bobUid]]);
    expect(res.ok).toBe(false);
    // no create right on products
    const prod = await imp.load('dt.product', ['name'], [['Banana']]);
    expect(prod.ok).toBe(false);
    // bob's records are invisible: cannot update them by db id or external id
    const bobs = await new DataImportService(tenant.env({ uid: bobUid })).load('dt.order', ['id', 'name', 'owner_id/.id'], [['bob_o', 'Bob', bobUid]]);
    expect(bobs.ok).toBe(true);
    const hijack = await imp.load('dt.order', ['id', 'name'], [['bob_o', 'pwned']]);
    expect(hijack.ok).toBe(false);
    const hijack2 = await imp.load('dt.order', ['.id', 'name'], [[bobs.ids[0]!, 'pwned']]);
    expect(hijack2.ok).toBe(false);
    // new external ids cannot claim module namespaces
    const ns = await imp.load('dt.order', ['id', 'name', 'owner_id/.id'], [['base.fake', 'x', aliceUid]]);
    expect(ns.errors[0]!.message).toMatch(/namespace/);
  });

  it('rejects malformed headers and oversized input', async () => {
    const imp = new DataImportService(alice);
    await expect(imp.load('dt.order', ['nope'], [['1']])).rejects.toBeInstanceOf(ValidationError);
    await expect(imp.load('dt.order', ['name', 'name'], [])).rejects.toBeInstanceOf(ValidationError);
    await expect(imp.load('dt.order', ['create_date'], [])).rejects.toBeInstanceOf(ValidationError);
    await expect(imp.load('dt.order', ['name'], Array.from({ length: 10_001 }, () => ['x']))).rejects.toBeInstanceOf(ValidationError);
  });

  it('converts scalars strictly', () => {
    const f = (type: string, extra = {}) => ({ name: 'f', type, ...extra }) as Parameters<typeof convertScalar>[0];
    expect(convertScalar(f('boolean'), 'No')).toBe(false);
    expect(convertScalar(f('float'), '-1.25e2')).toBe(-125);
    expect(convertScalar(f('datetime'), '2026-01-02 03:04')).toBe('2026-01-02T03:04:00Z');
    expect(() => convertScalar(f('integer'), '1.5')).toThrow(ValidationError);
    expect(() => convertScalar(f('boolean'), 'maybe')).toThrow(ValidationError);
  });
});

describe('export', () => {
  it('exports dotted paths, external ids and x2many sub-rows', async () => {
    const res = await new DataImportService(alice).load('dt.order',
      ['id', 'name', 'owner_id/.id', 'tag_ids', 'line_ids/product_id', 'line_ids/qty'],
      [['exp_1', 'E1', aliceUid, 'red', 'Apple', 5], [null, null, null, null, 'Pear', 6]]);
    expect(res.errors).toEqual([]);
    const out = await new DataExportService(alice).exportData('dt.order',
      ['id', 'name', 'product_id/name', 'tag_ids', 'line_ids/product_id/name', 'line_ids/qty', 'line_ids/id'], { ids: res.ids });
    expect(out.header[0]).toBe('id');
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]!.slice(0, 6)).toEqual(['__import__.exp_1', 'E1', null, 'red', 'Apple', 5]);
    expect(out.rows[1]!.slice(0, 6)).toEqual([null, null, null, null, 'Pear', 6]);
    expect(out.rows[1]![6]).toMatch(/^__export__\.dt_line_\d+$/);
    expect(toCsv(out.header, out.rows).split('\r\n')[1]).toMatch(/^__import__\.exp_1,E1,,red,Apple,5,/);

    // round trip: re-import the export updates rather than duplicates
    const back = await new DataImportService(alice).load('dt.order', ['id', 'name'], [['__import__.exp_1', 'E1b']]);
    expect(back).toMatchObject({ ok: true, updated: 1, created: 0 });
  });

  it('refuses hidden fields and invisible records', async () => {
    const exp = new DataExportService(alice);
    await expect(exp.exportData('dt.order', ['note'], {})).rejects.toBeInstanceOf(AccessError);
    await expect(exp.exportData('dt.order', ['product_id/secret'], {})).rejects.toBeInstanceOf(AccessError);
    const [bobOrder] = (await root.model('dt.order').search([['owner_id', '=', bobUid]])).ids;
    await expect(exp.exportData('dt.order', ['name'], { ids: [bobOrder!] })).rejects.toBeInstanceOf(AccessError);
    const visible = await exp.exportData('dt.order', ['name'], { domain: [] });
    expect(visible.rows.some((r) => r[0] === 'Bob')).toBe(false);
    await expect(exp.exportData('dt.order', ['name/x'], {})).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores per-user export templates', async () => {
    const svc = new ExportTemplateService(alice);
    const id = await svc.save('dt.order', 'Basic', ['name', 'line_ids/qty']);
    expect(await svc.list('dt.order')).toEqual([expect.objectContaining({ id, name: 'Basic', fields: ['name', 'line_ids/qty'] })]);
    expect(await new ExportTemplateService(tenant.env({ uid: bobUid })).list('dt.order')).toEqual([]);
    await expect(new ExportTemplateService(tenant.env({ uid: bobUid })).remove(id)).rejects.toBeInstanceOf(AccessError);
    await expect(svc.save('dt.order', 'Bad', ['note'])).rejects.toBeInstanceOf(AccessError);
    await svc.remove(id);
    expect(await svc.list('dt.order')).toEqual([]);
  });
});

describe('review fixes', () => {
  const sql = (text: string, params: unknown[] = []) => tenant.driver.query<Record<string, unknown>>({ text, params });

  it('never binds a module-owned external id whose record is gone', async () => {
    await ensureDataTransferTables(root);
    await sql(`INSERT INTO nx_model_data(module, name, model, res_id) VALUES ('base', 'gone_order', 'dt.order', 999999)`);
    const res = await new DataImportService(alice).load('dt.order', ['id', 'name', 'owner_id/.id'], [['base.gone_order', 'Mine', aliceUid]]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]!.message).toMatch(/namespace/);
    expect(await sql(`SELECT res_id FROM nx_model_data WHERE module = 'base' AND name = 'gone_order'`)).toEqual([{ res_id: 999999 }]);
    // a stale import-namespace id is cleaned up and rebound
    await sql(`INSERT INTO nx_model_data(module, name, model, res_id) VALUES ('__import__', 'stale_one', 'dt.order', 999998)`);
    const ok = await new DataImportService(alice).load('dt.order', ['id', 'name', 'owner_id/.id'], [['stale_one', 'Fresh', aliceUid]]);
    expect(ok).toMatchObject({ ok: true, created: 1 });
    expect(await sql(`SELECT res_id FROM nx_model_data WHERE module = '__import__' AND name = 'stale_one'`)).toEqual([{ res_id: ok.ids[0] }]);
  });

  it('stops exports at the row cap while building rows', async () => {
    const res = await new DataImportService(alice).load('dt.order', ['name', 'owner_id/.id', 'line_ids/qty'],
      [['Cap', aliceUid, 1], [null, null, 2], [null, null, 3]]);
    expect(res.ok).toBe(true);
    const capped = new DataExportService(alice, { maxExportRows: 2 });
    await expect(capped.exportData('dt.order', ['name', 'line_ids/qty'], { ids: res.ids })).rejects.toThrow(/too many rows/);
    expect((await new DataExportService(alice, { maxExportRows: 3 }).exportData('dt.order', ['name', 'line_ids/qty'], { ids: res.ids })).rows).toHaveLength(3);
  });

  it('round-trips many2many names containing commas and backslashes', async () => {
    expect(joinList(['a,b', 'c\\d'])).toBe('a\\,b,c\\\\d');
    expect(splitList(joinList(['a,b', 'c\\d', 'e']))).toEqual(['a,b', 'c\\d', 'e']);
    await root.model('dt.tag').create([{ name: 'x,y' }, { name: 'p\\q' }]);
    const res = await new DataImportService(alice).load('dt.order', ['name', 'owner_id/.id', 'tag_ids'], [['Tags', aliceUid, 'x\\,y, p\\\\q']]);
    expect(res.errors).toEqual([]);
    const out = await new DataExportService(alice).exportData('dt.order', ['tag_ids'], { ids: res.ids });
    const back = await new DataImportService(alice).load('dt.order', ['.id', 'tag_ids'], [[res.ids[0]!, out.rows[0]![0]!]]);
    expect(back).toMatchObject({ ok: true, updated: 1 });
    const [row] = await alice.model('dt.order').browse(res.ids[0]!).read(['tag_ids']);
    expect(row!.tag_ids).toHaveLength(2);
  });

  it('exports dates exactly as imported', async () => {
    const res = await new DataImportService(alice).load('dt.order', ['name', 'owner_id/.id', 'day'],
      [['D1', aliceUid, '2026-01-01'], ['D2', aliceUid, '2026-12-31']]);
    const out = await new DataExportService(alice).exportData('dt.order', ['day'], { ids: res.ids });
    expect(out.rows).toEqual([['2026-01-01'], ['2026-12-31']]);
  });

  it('enforces a single default filter per model and owner in the database', async () => {
    await Promise.all([ensureDataTransferTables(root), ensureDataTransferTables(root)]);
    await new SavedFilterService(alice).create({ name: 'Def', model: 'dt.tag', isDefault: true });
    await expect(sql(`INSERT INTO nx_filter(name, model, user_id, is_default, create_uid) VALUES ('dup', 'dt.tag', $1, true, $1)`, [aliceUid]))
      .rejects.toThrow();
  });
});

describe('csv', () => {
  it('parses quoted values and round-trips', () => {
    const text = toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', null], [true, 3]]);
    expect(parseCsv('﻿' + text)).toEqual({ header: ['a', 'b'], rows: [['x,y', 'say "hi"'], ['line\nbreak', ''], ['True', '3']] });
    expect(() => parseCsv('a\n"open')).toThrow(ValidationError);
  });
});

describe('saved filters', () => {
  it('lets users manage own filters and admins manage shared ones', async () => {
    const mine = new SavedFilterService(alice);
    const id = await mine.create({ name: 'Done', model: 'dt.order', domain: [['state', '=', 'done']], sort: 'name desc', isDefault: true });
    const id2 = await mine.create({ name: 'Draft', model: 'dt.order', domain: [['state', '=', 'draft']], isDefault: true });
    const list = await mine.list('dt.order');
    expect(list.find((f) => f.id === id)!.is_default).toBe(false);
    expect((await mine.defaultFor('dt.order'))!.id).toBe(id2);
    await expect(mine.create({ name: 'Bad', model: 'dt.order', domain: [['nope', '=', 1]] })).rejects.toBeInstanceOf(ValidationError);
    await expect(mine.create({ name: 'Bad', model: 'dt.order', sort: 'nope; drop' })).rejects.toBeInstanceOf(ValidationError);
    await expect(mine.create({ name: 'Shared', model: 'dt.order', shared: true })).rejects.toBeInstanceOf(AccessError);

    const bob = new SavedFilterService(tenant.env({ uid: bobUid }));
    expect(await bob.list('dt.order')).toEqual([]);
    await expect(bob.remove(id)).rejects.toBeInstanceOf(AccessError);
    await expect(bob.update(id, { name: 'x' })).rejects.toBeInstanceOf(AccessError);

    const shared = await new SavedFilterService(admin).create({ name: 'Everyone', model: 'dt.order', shared: true, context: { group_by: 'state' } });
    expect((await bob.list('dt.order')).map((f) => f.id)).toEqual([shared]);
    await expect(bob.update(shared, { name: 'mine now' })).rejects.toBeInstanceOf(AccessError);
    await mine.update(id, { name: 'Done!', sort: null });
    expect((await mine.list('dt.order')).find((f) => f.id === id)).toMatchObject({ name: 'Done!', sort: null });
    await mine.remove(id);
    await new SavedFilterService(admin).remove(shared);
    expect((await mine.list('dt.order')).map((f) => f.id)).toEqual([id2]);
    await expect(mine.list('res.nothing')).rejects.toBeInstanceOf(ValidationError);
  });
});
