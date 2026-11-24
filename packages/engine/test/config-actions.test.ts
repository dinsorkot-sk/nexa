import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ButtonService, PgliteTenantManager, ServerActionService, ensureSecurityTables, securityModels, writeModuleSecurity,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';
import { configAccess, configModels, configRules } from '../src/base/config-models.js';
import { baseModule } from '../src/base/manifest.js';
import { importServiceConfigRecords } from '../src/services/index.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  ...configModels,
  { name: 'cfga.order', origin: 'module', fields: {
    name: { type: 'char' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['done', 'Done']], default: 'draft' },
    note: { type: 'char' },
  } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;
let admin: Env;
let alice: Env;

async function runtimeAction(key: string) {
  return tenant.driver.query<{ key: string; type: string; definition: Record<string, unknown> }>({
    text: `SELECT key, type, definition FROM nx_server_action WHERE key=$1`, params: [key],
  });
}
async function runtimeButtons(model: string) {
  return tenant.driver.query<{ kind: string; ref: string; guard: string | null }>({
    text: `SELECT kind, ref, guard FROM nx_button WHERE model=$1 ORDER BY id`, params: [model],
  });
}

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('config-actions');
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
  await writeModuleSecurity(tenant.driver, 'base', [...configAccess, { model: 'cfga.order', group: 'base.group_user', perms: all }], configRules);
  admin = tenant.env({ uid: adminUid! });
  alice = tenant.env({ uid: aliceUid! });
}, 60_000);

afterAll(() => mgr.closeAll());

describe('base manifest', () => {
  it('ships server actions and buttons as system-only models with Technical menus', () => {
    const names = baseModule.models!.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(['ir.actions.server', 'ir.button']));
    for (const model of ['ir.actions.server', 'ir.button']) {
      expect(configAccess.filter((a) => a.model === model).map((a) => a.group)).toEqual(['base.group_system']);
    }
    const menus = baseModule.menus!.filter((m) => ['menu_server_actions', 'menu_buttons'].includes(m.xmlId));
    expect(menus.map((m) => m.parent)).toEqual(['menu_technical', 'menu_technical']);
  });
});

describe('ir.actions.server records', () => {
  it('validates through ServerActionService.define and syncs the runtime definition', async () => {
    const Action = admin.model('ir.actions.server');
    await Action.create({
      key: 'cfga.mark_done', name: 'Mark done', model_name: 'cfga.order', type: 'update_record',
      values_json: JSON.stringify({ state: "'done'", note: "name + ' ok'" }),
    });
    const [row] = await runtimeAction('cfga.mark_done');
    expect(row).toMatchObject({ type: 'update_record', definition: { values: { state: "'done'", note: "name + ' ok'" } } });

    await expect(Action.create({ key: 'cfga.bad1', model_name: 'cfga.order', type: 'update_record', values_json: '[1]' }))
      .rejects.toThrow(/JSON object|NX-Expr/);
    await expect(Action.create({ key: 'cfga.bad2', model_name: 'cfga.order', type: 'update_record', values_json: '{"nope":"1"}' }))
      .rejects.toThrow(/unknown field/);
    await expect(Action.create({ key: 'cfga.bad3', model_name: 'cfga.order', type: 'post_message', message: '1 +' }))
      .rejects.toThrow(/message/);
    await expect(Action.create({ key: 'cfga.bad4', model_name: 'no.model', type: 'script', code: 'return 1' }))
      .rejects.toThrow(/Unknown model/);
    expect(await runtimeAction('cfga.bad2')).toEqual([]);

    // edits re-sync; the key is immutable
    const [id] = (await Action.search([['key', '=', 'cfga.mark_done']])).ids;
    await Action.browse(id!).write({ values_json: JSON.stringify({ state: "'done'" }) });
    expect((await runtimeAction('cfga.mark_done'))[0]!.definition).toMatchObject({ values: { state: "'done'" } });
    await expect(Action.browse(id!).write({ key: 'cfga.other' })).rejects.toThrow(/cannot be changed/);
  });

  it('is system-only: normal users cannot read, create, alter or delete actions', async () => {
    await expect(alice.model('ir.actions.server').create({ key: 'cfga.evil', type: 'script', code: 'return 1' })).rejects.toThrow();
    await expect(alice.model('ir.actions.server').search([])).rejects.toThrow();
    await expect(alice.model('ir.button').create({ model_name: 'cfga.order', method: 'unlink' })).rejects.toThrow();
    const [id] = (await admin.model('ir.actions.server').search([['key', '=', 'cfga.mark_done']])).ids;
    await expect(alice.model('ir.actions.server').browse(id!).write({ code: 'x' })).rejects.toThrow();
    await expect(alice.model('ir.actions.server').browse(id!).unlink()).rejects.toThrow();
    expect(await runtimeAction('cfga.evil')).toEqual([]);
  });

  it('runs automations and guarded buttons defined as records as the triggering user', async () => {
    await admin.model('ir.actions.server').create({
      key: 'cfga.note', model_name: 'cfga.order', type: 'update_record', values_json: JSON.stringify({ note: "'auto'" }),
    });
    await admin.model('ir.automation').create({ key: 'cfga.on_create', model_name: 'cfga.order', trigger: 'on_create', action: 'cfga.note' });
    await admin.model('ir.button').create({ name: 'Done', model_name: 'cfga.order', action: 'cfga.mark_done', guard: "state == 'draft'" });
    expect(await runtimeButtons('cfga.order')).toEqual([{ kind: 'action', ref: 'cfga.mark_done', guard: "state == 'draft'" }]);

    const [orderId] = (await alice.model('cfga.order').create({ name: 'O1' })).ids;
    expect((await alice.model('cfga.order').browse(orderId!).read(['note']))[0]!.note).toBe('auto');
    await new ButtonService(alice).execute('cfga.order', [orderId!], { action: 'cfga.mark_done' });
    expect((await alice.model('cfga.order').browse(orderId!).read(['state']))[0]!.state).toBe('done');
    await expect(new ButtonService(alice).execute('cfga.order', [orderId!], { action: 'cfga.mark_done' })).rejects.toThrow(/not allowed/);
  });

  it('keeps button identity immutable, edits guards and rejects duplicates', async () => {
    const Button = admin.model('ir.button');
    const [id] = (await Button.search([['model_name', '=', 'cfga.order']])).ids;
    await expect(Button.browse(id!).write({ action: 'cfga.note' })).rejects.toThrow(/cannot be changed/);
    await expect(Button.browse(id!).write({ method: 'unlink' })).rejects.toThrow(/cannot be changed/);
    await Button.browse(id!).write({ guard: false });
    expect((await runtimeButtons('cfga.order'))[0]!.guard).toBeNull();
    await expect(Button.create({ model_name: 'cfga.order', action: 'cfga.mark_done' })).rejects.toThrow(/already exists/);
    await expect(Button.create({ model_name: 'cfga.order', action: 'cfga.mark_done', method: 'unlink' })).rejects.toThrow(/exactly one/);
    await expect(Button.create({ model_name: 'cfga.order', action: 'cfga.missing' })).rejects.toThrow(/Unknown server action/);
  });

  it('refuses to remove or archive referenced actions; unlink removes runtime rows', async () => {
    const Action = admin.model('ir.actions.server');
    const [noteId] = (await Action.search([['key', '=', 'cfga.note']])).ids;
    const [doneId] = (await Action.search([['key', '=', 'cfga.mark_done']])).ids;
    await expect(Action.browse(noteId!).unlink()).rejects.toThrow(/still used by automation rule/);
    await expect(Action.browse(noteId!).write({ active: false })).rejects.toThrow(/still used/);
    await expect(Action.browse(doneId!).unlink()).rejects.toThrow(/still used by button/);
    await Action.create({ key: 'cfga.multi', type: 'multi', model_name: 'cfga.order', child_keys: 'cfga.note' });
    await (await admin.model('ir.automation').search([['key', '=', 'cfga.on_create']])).unlink();
    await expect(Action.browse(noteId!).unlink()).rejects.toThrow(/still used by server action cfga.multi/);
    await (await Action.search([['key', '=', 'cfga.multi']])).unlink();
    await Action.browse(noteId!).unlink();
    expect(await runtimeAction('cfga.note')).toEqual([]);

    await (await admin.model('ir.button').search([['model_name', '=', 'cfga.order']])).unlink();
    expect(await runtimeButtons('cfga.order')).toEqual([]);
    await Action.browse(doneId!).write({ active: false });
    expect(await runtimeAction('cfga.mark_done')).toEqual([]);
    await Action.browse(doneId!).write({ active: true });
    expect(await runtimeAction('cfga.mark_done')).toHaveLength(1);
  });

  it('imports service-defined actions and buttons as records', async () => {
    await new ServerActionService(root).define({ key: 'cfga.svc', model: 'cfga.order', type: 'post_message', message: "'hi'" });
    await new ServerActionService(root).define({ key: 'cfga.svc_multi', type: 'multi', children: ['cfga.svc'] });
    await new ButtonService(root).define({ model: 'cfga.order', action: 'cfga.svc', guard: 'true' });
    await new ButtonService(root).define({ model: 'cfga.order', method: 'copy' });
    await expect(importServiceConfigRecords(alice)).rejects.toThrow();
    expect(await importServiceConfigRecords(admin)).toBe(4);
    expect(await importServiceConfigRecords(admin)).toBe(0);
    const actions = await admin.model('ir.actions.server').searchRead([['key', 'in', ['cfga.svc', 'cfga.svc_multi']]], ['key', 'type', 'message', 'child_keys']);
    expect(actions).toEqual([
      expect.objectContaining({ key: 'cfga.svc', type: 'post_message', message: "'hi'" }),
      expect.objectContaining({ key: 'cfga.svc_multi', type: 'multi', child_keys: 'cfga.svc' }),
    ]);
    const buttons = await admin.model('ir.button').searchRead([['model_name', '=', 'cfga.order']], ['action', 'method', 'guard']);
    expect(buttons).toEqual([
      expect.objectContaining({ action: 'cfga.svc', guard: 'true' }),
      expect.objectContaining({ method: 'copy' }),
    ]);
  });
});
