import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, PgliteTenantManager, ServerActionService, ValidationError,
  ensureSecurityTables, securityModels, writeModuleSecurity, type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';
import { configAccess, configModels, configRules } from '../src/base/config-models.js';
import { ensureServiceTables } from '../src/index.js';
import { registerCallableMethod } from '../src/services/actions.js';

const all = { read: true, write: true, create: true, unlink: true };
const readOnly = { read: true, write: false, create: false, unlink: false };

const models: ModelDef[] = [
  ...securityModels,
  ...configModels,
  { name: 'alm.order', origin: 'module', fields: {
    name: { type: 'char' },
    line_ids: { type: 'one2many', comodel: 'alm.order.line', inverseName: 'order_id' },
  }, methods: {
    ping: async (records, a: unknown, b: unknown) => ({ ids: [...records.ids], a, b }),
    secret: async () => 'secret',
    big: async () => 10n,
    touch: async (records) => { await records.write({ name: 'touched' }); return true; },
  } },
  { name: 'alm.order.line', origin: 'module', fields: {
    order_id: { type: 'many2one', comodel: 'alm.order' },
    label: { type: 'char' },
    qty: { type: 'integer', default: 0 },
    price: { type: 'integer', default: 0 },
  } },
  { name: 'alm.doc', origin: 'module', fields: {
    name: { type: 'char' },
    line_ids: { type: 'one2many', comodel: 'alm.doc.line', inverseName: 'doc_id' },
  } },
  { name: 'alm.doc.line', origin: 'module', fields: {
    doc_id: { type: 'many2one', comodel: 'alm.doc' },
    text: { type: 'char' },
    total: { type: 'integer', default: 0 },
    ro: { type: 'integer', readonly: true },
    calc: { type: 'integer', computeExpr: 'total * 2' },
  } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;
let admin: Env;
let alice: Env;
let bob: Env;

async function orderWithLines(n: number): Promise<number> {
  const [id] = (await root.model('alm.order').create({
    name: 'SO',
    line_ids: Array.from({ length: n }, (_, i) => ({ op: 'create', values: { label: `L${i + 1}`, qty: i + 1, price: 10 } })),
  })).ids as number[];
  return id!;
}
const docs = () => tenant.env({ uid: 1 }).model('alm.doc').searchRead([], ['name', 'line_ids']);

const LINES = { field: 'line_ids', source: 'record.line_ids', values: { text: 'line.label', total: 'line.qty * line.price' } };

beforeAll(async () => {
  registerCallableMethod('alm.order', 'ping');
  registerCallableMethod('alm.order', 'touch');
  registerCallableMethod('alm.order', 'big');
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('action-lines-callmethod');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  const [company] = (await root.model('res.company').create({ name: 'A' })).ids as number[];
  const [user] = (await root.model('res.groups').create({ name: 'Users', code: 'base.group_user' })).ids;
  const [system] = (await root.model('res.groups').create({ name: 'Settings', code: 'base.group_system', implied_ids: [user] })).ids;
  const [limited] = (await root.model('res.groups').create({ name: 'Limited', code: 'alm.limited' })).ids;
  const mk = async (login: string, groups: number[]) => (await root.model('res.users').create({
    name: login, login, company_id: company, company_ids: [company], group_ids: groups,
  })).ids[0]!;
  const adminUid = await mk('adm', [system!]);
  const aliceUid = await mk('alice', [user!]);
  const bobUid = await mk('bob', [limited!]);
  await writeModuleSecurity(tenant.driver, 'base', [
    ...configAccess,
    { model: 'alm.order', group: 'base.group_user', perms: all },
    { model: 'alm.order.line', group: 'base.group_user', perms: all },
    { model: 'alm.doc', group: 'base.group_user', perms: all },
    { model: 'alm.doc.line', group: 'base.group_user', perms: all },
    // bob may read orders and create docs, but has no access to doc lines or write on orders
    { model: 'alm.order', group: 'alm.limited', perms: readOnly },
    { model: 'alm.order.line', group: 'alm.limited', perms: readOnly },
    { model: 'alm.doc', group: 'alm.limited', perms: all },
  ], configRules);
  admin = tenant.env({ uid: adminUid });
  alice = tenant.env({ uid: aliceUid });
  bob = tenant.env({ uid: bobUid });
  const svc = new ServerActionService(admin);
  await svc.define({ key: 'alm.make_doc', model: 'alm.order', type: 'create_record', targetModel: 'alm.doc',
    values: { name: "'Doc ' + name" }, lines: LINES });
  await svc.define({ key: 'alm.ping', model: 'alm.order', type: 'call_method', method: 'ping', args: ['name', '2 + 3'] });
}, 60_000);

afterAll(() => mgr.closeAll());

describe('create_record.lines', () => {
  it('creates the parent and its children from record.<source> in one run', async () => {
    const id = await orderWithLines(3);
    const created = await new ServerActionService(alice).run('alm.make_doc', { model: 'alm.order', ids: [id] }) as number[];
    expect(created).toHaveLength(1);
    const lines = await root.model('alm.doc.line').searchRead([['doc_id', '=', created[0]!]], ['text', 'total'], { order: 'id asc' });
    expect(lines.map((l) => [l.text, l.total])).toEqual([['L1', 10], ['L2', 20], ['L3', 30]]);
    expect((await root.model('alm.doc').browse(created).read(['name']))[0]).toMatchObject({ name: 'Doc SO' });
  });

  it('creates a parent without children when the source is empty', async () => {
    const id = await orderWithLines(0);
    const [docId] = await new ServerActionService(alice).run('alm.make_doc', { model: 'alm.order', ids: [id] }) as number[];
    expect(await root.model('alm.doc.line').searchRead([['doc_id', '=', docId!]], ['id'])).toHaveLength(0);
  });

  it('rolls back parent and children when a child value fails', async () => {
    await new ServerActionService(admin).define({ key: 'alm.bad_lines', model: 'alm.order', type: 'create_record', targetModel: 'alm.doc',
      values: { name: "'Bad'" }, lines: { field: 'line_ids', source: 'record.line_ids', values: { text: 'line.label', total: 'line.label' } } });
    const id = await orderWithLines(2);
    const before = (await docs()).length;
    const linesBefore = (await tenant.env({ uid: 1 }).model('alm.doc.line').searchRead([], ['id'])).length;
    await expect(new ServerActionService(alice).run('alm.bad_lines', { model: 'alm.order', ids: [id] })).rejects.toThrow();
    expect(await docs()).toHaveLength(before);
    expect(await tenant.env({ uid: 1 }).model('alm.doc.line').searchRead([], ['id'])).toHaveLength(linesBefore);
  });

  it('applies the caller ACL to the created children', async () => {
    const id = await orderWithLines(2);
    const before = (await docs()).length;
    // bob can read orders and create docs but has no access to doc lines
    await expect(new ServerActionService(bob).run('alm.make_doc', { model: 'alm.order', ids: [id] })).rejects.toThrow(AccessError);
    expect(await docs()).toHaveLength(before);
  });

  it('charges source reads and created children to the row budget', async () => {
    const id = await orderWithLines(5);
    // 1 record + 5 source ids read + 5 child rows + relation loading: far above a budget of 8
    await expect(new ServerActionService(alice, { maxRows: 8 }).run('alm.make_doc', { model: 'alm.order', ids: [id] }))
      .rejects.toThrow(/row quota/);
    await expect(new ServerActionService(alice, { maxRows: 100 }).run('alm.make_doc', { model: 'alm.order', ids: [id] })).resolves.toHaveLength(1);
  });

  it('follows relations in line values with the caller access', async () => {
    await new ServerActionService(admin).define({ key: 'alm.rel', model: 'alm.order', type: 'create_record', targetModel: 'alm.doc',
      values: { name: "'Rel'" }, lines: { field: 'line_ids', source: 'record.line_ids', values: { text: "line.order_id.name + '-' + line.label" } } });
    const id = await orderWithLines(2);
    const [docId] = await new ServerActionService(alice).run('alm.rel', { model: 'alm.order', ids: [id] }) as number[];
    const rows = await tenant.env({ uid: 1 }).model('alm.doc.line').searchRead([['doc_id', '=', docId!]], ['text'], { order: 'id asc' });
    expect(rows.map((r) => r.text)).toEqual(['SO-L1', 'SO-L2']);
    // the relation reads are charged to the row budget
    await expect(new ServerActionService(alice, { maxRows: 6 }).run('alm.rel', { model: 'alm.order', ids: [id] })).rejects.toThrow(/row quota/);
  });

  it('loads the parent scope once per expression, not once per line', async () => {
    await new ServerActionService(admin).define({ key: 'alm.once', model: 'alm.order', type: 'create_record', targetModel: 'alm.doc',
      values: { name: "'Once'" }, lines: { field: 'line_ids', source: 'record.line_ids', values: { total: "record.line_ids.sum('qty')" } } });
    const id = await orderWithLines(8);
    // per-line reloads would charge ~8 * 8 extra rows; once costs about 8 more than the plain mapping
    const [docId] = await new ServerActionService(alice, { maxRows: 40 }).run('alm.once', { model: 'alm.order', ids: [id] }) as number[];
    const rows = await tenant.env({ uid: 1 }).model('alm.doc.line').searchRead([['doc_id', '=', docId!]], ['total']);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.total === 36)).toBe(true);
  });

  it('refuses relational line paths when the source items are not records', async () => {
    await new ServerActionService(admin).define({ key: 'alm.objs', model: 'alm.order', type: 'create_record', targetModel: 'alm.doc',
      values: { name: "'Objs'" }, lines: { field: 'line_ids', source: "record.line_ids.sorted('qty')", values: { text: 'line.order_id.name' } } });
    const id = await orderWithLines(2);
    await expect(new ServerActionService(alice).run('alm.objs', { model: 'alm.order', ids: [id] })).rejects.toThrow(/needs record ids/);
  });

  it('rejects readonly, computed and inverse fields in line values', async () => {
    const svc = new ServerActionService(admin);
    const base = { model: 'alm.order', type: 'create_record' as const, targetModel: 'alm.doc', values: { name: "'x'" } };
    for (const field of ['ro', 'calc', 'doc_id']) {
      await expect(svc.define({ key: 'alm.ro', ...base, lines: { ...LINES, values: { [field]: '1' } } })).rejects.toThrow(/readonly or computed|inverse/);
    }
  });

  it('validates the mapping at define time', async () => {
    const svc = new ServerActionService(admin);
    const base = { model: 'alm.order', type: 'create_record' as const, targetModel: 'alm.doc', values: { name: "'x'" } };
    await expect(svc.define({ key: 'alm.v1', ...base, lines: { ...LINES, field: 'name' } })).rejects.toThrow(/not a one2many/);
    await expect(svc.define({ key: 'alm.v2', ...base, lines: { ...LINES, field: 'nope' } })).rejects.toThrow(/unknown field/);
    await expect(svc.define({ key: 'alm.v3', ...base, lines: { ...LINES, values: { nope: '1' } } })).rejects.toThrow(/unknown field 'nope'/);
    await expect(svc.define({ key: 'alm.v4', ...base, lines: { ...LINES, source: '((' } })).rejects.toThrow(ValidationError);
    await expect(svc.define({ key: 'alm.v5', ...base, lines: { ...LINES, values: {} } })).rejects.toThrow(ValidationError);
    await expect(svc.define({ key: 'alm.v6', model: 'alm.order', type: 'update_record', values: { name: "'x'" }, lines: LINES })).rejects.toThrow(/only apply to create_record/);
  });
});

describe('call_method', () => {
  it('refuses methods that are not in the allowlist, at define and at run time', async () => {
    const svc = new ServerActionService(admin);
    await expect(svc.define({ key: 'alm.secret', model: 'alm.order', type: 'call_method', method: 'secret' })).rejects.toThrow(/not callable/);
    await expect(svc.define({ key: 'alm.missing', model: 'alm.order', type: 'call_method', method: 'create' })).rejects.toThrow(/not callable/);
    await expect(svc.define({ key: 'alm.nomethod', model: 'alm.order', type: 'call_method' })).rejects.toThrow(ValidationError);
    // a definition stored before the allowlist entry existed (or tampered with) still cannot run
    await tenant.driver.query({
      text: `INSERT INTO nx_server_action(key,name,model,type,definition) VALUES('alm.forced','f','alm.order','call_method','{"method":"secret"}'::jsonb)`, params: [],
    });
    const id = await orderWithLines(1);
    await expect(new ServerActionService(admin).run('alm.forced', { model: 'alm.order', ids: [id] })).rejects.toThrow(/not callable/);
  });

  it('runs an allowed method with evaluated arguments and returns its result', async () => {
    const id = await orderWithLines(1);
    const result = await new ServerActionService(alice).run('alm.ping', { model: 'alm.order', ids: [id] });
    expect(result).toEqual({ ids: [id], a: 'SO', b: 5 });
  });

  it('turns a non-serializable result into a ValidationError', async () => {
    await new ServerActionService(admin).define({ key: 'alm.big', model: 'alm.order', type: 'call_method', method: 'big' });
    const id = await orderWithLines(1);
    await expect(new ServerActionService(alice).run('alm.big', { model: 'alm.order', ids: [id] })).rejects.toThrow(ValidationError);
  });

  it('runs under the caller ACL and record access', async () => {
    await new ServerActionService(admin).define({ key: 'alm.touch', model: 'alm.order', type: 'call_method', method: 'touch' });
    const id = await orderWithLines(1);
    await expect(new ServerActionService(bob).run('alm.touch', { model: 'alm.order', ids: [id] })).rejects.toThrow(AccessError);
    expect((await tenant.env({ uid: 1 }).model('alm.order').browse(id).read(['name']))[0]).toMatchObject({ name: 'SO' });
    await expect(new ServerActionService(alice).run('alm.touch', { model: 'alm.order', ids: [id] })).resolves.toBe(true);
    expect((await tenant.env({ uid: 1 }).model('alm.order').browse(id).read(['name']))[0]).toMatchObject({ name: 'touched' });
  });
});

describe('service schema', () => {
  it('widens differently named older type checks', async () => {
    const q = (text: string) => tenant.driver.query({ text, params: [] });
    await q('ALTER TABLE nx_server_action DROP CONSTRAINT IF EXISTS nx_server_action_type_check');
    await q('DELETE FROM nx_server_action WHERE type=\'call_method\'');
    await q('ALTER TABLE nx_server_action ADD CONSTRAINT legacy_kind CHECK (type IN (\'update_record\',\'create_record\',\'post_message\',\'multi\',\'script\'))');
    await q('COMMENT ON TABLE nx_service_ready IS \'3\'');
    await ensureServiceTables(admin);
    await q('INSERT INTO nx_server_action(key,name,type) VALUES(\'alm.schema\',\'s\',\'call_method\')');
    await q('DELETE FROM nx_server_action WHERE key=\'alm.schema\'');
  });
});

describe('ir.actions.server records', () => {
  it('validates and syncs create_record.lines and call_method records', async () => {
    const Action = admin.model('ir.actions.server');
    await Action.create({
      key: 'alm.rec_lines', model_name: 'alm.order', type: 'create_record', target_model: 'alm.doc',
      values_json: JSON.stringify({ name: "'R'" }), lines_field: 'line_ids', lines_source: 'record.line_ids',
      lines_values_json: JSON.stringify({ text: 'line.label' }),
    });
    await Action.create({ key: 'alm.rec_call', model_name: 'alm.order', type: 'call_method', method: 'ping', args_json: JSON.stringify(['name']) });
    const rows = await tenant.driver.query<{ key: string; definition: Record<string, unknown> }>({
      text: `SELECT key, definition FROM nx_server_action WHERE key LIKE 'alm.rec_%' ORDER BY key`, params: [],
    });
    expect(rows[0]!.definition).toMatchObject({ method: 'ping', args: ['name'] });
    expect(rows[1]!.definition).toMatchObject({ lines: { field: 'line_ids', source: 'record.line_ids', values: { text: 'line.label' } } });
    const id = await orderWithLines(2);
    const [docId] = await new ServerActionService(alice).run('alm.rec_lines', { model: 'alm.order', ids: [id] }) as number[];
    expect(await root.model('alm.doc.line').searchRead([['doc_id', '=', docId!]], ['id'])).toHaveLength(2);
  });

  it('rejects invalid records', async () => {
    const Action = admin.model('ir.actions.server');
    await expect(Action.create({ key: 'alm.rec_bad1', model_name: 'alm.order', type: 'call_method', method: 'secret' })).rejects.toThrow(/not callable/);
    await expect(Action.create({
      key: 'alm.rec_bad2', model_name: 'alm.order', type: 'create_record', target_model: 'alm.doc', values_json: JSON.stringify({ name: "'R'" }),
      lines_field: 'name', lines_source: 'record.line_ids', lines_values_json: JSON.stringify({ text: "'x'" }),
    })).rejects.toThrow(/not a one2many/);
    await expect(Action.create({ key: 'alm.rec_bad3', model_name: 'alm.order', type: 'call_method', method: 'ping', args_json: '{}' })).rejects.toThrow(ValidationError);
  });
});
