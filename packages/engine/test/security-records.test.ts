import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, PgliteTenantManager, ensureSecurityTables, securityModels, writeModuleSecurity,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';
import { configAccess, configModels } from '../src/base/config-models.js';
import { baseModule } from '../src/base/manifest.js';
import { RECORDS_MODULE } from '../src/security/records.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  ...configModels,
  { name: 'uom.secr', origin: 'module', fields: { name: { type: 'char' } } },
  { name: 'mail.template', origin: 'module', fields: { name: { type: 'char' } } },
  { name: 'secr.order', origin: 'module', fields: {
    name: { type: 'char' },
    owner_id: { type: 'many2one', comodel: 'res.users' },
    company_id: { type: 'many2one', comodel: 'res.company' },
  } },
  { name: 'secr.mixin', origin: 'module', abstract: true, fields: { name: { type: 'char' } } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;
let admin: Env;
let aliceUid: number;
let bobUid: number;
let salesGroup: number;
let userGroup: number;
let managerGroup: number;
let companyA: number;
let companyB: number;
const env = (uid: number, companyIds?: number[]) => tenant.env({ uid, ...(companyIds ? { companyIds } : {}) });

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('security-records');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  [companyA, companyB] = (await root.model('res.company').create([{ name: 'A' }, { name: 'B' }])).ids as [number, number];
  const [user] = (await root.model('res.groups').create({ name: 'Users', code: 'base.group_user' })).ids;
  userGroup = user!;
  const [erp] = (await root.model('res.groups').create({ name: 'Access', code: 'base.group_erp_manager', implied_ids: [user] })).ids;
  const [system] = (await root.model('res.groups').create({ name: 'Settings', code: 'base.group_system', implied_ids: [erp] })).ids;
  [salesGroup] = (await root.model('res.groups').create({ name: 'Sales / User', code: 'x_sales.user', implied_ids: [user] })).ids as [number];
  [managerGroup] = (await root.model('res.groups').create({ name: 'Sales / Manager', code: 'x_sales.manager', implied_ids: [salesGroup] })).ids as [number];
  const mk = async (login: string, groups: number[]) => (await root.model('res.users').create({
    name: login, login, company_id: companyA, company_ids: [companyA, companyB], group_ids: groups,
  })).ids[0] as number;
  const adminUid = await mk('adm', [system!]);
  aliceUid = await mk('alice', [salesGroup]);
  bobUid = await mk('bob', [salesGroup]);
  await writeModuleSecurity(tenant.driver, 'base', baseModule.access!, baseModule.rules!);
  admin = env(adminUid);
}, 60_000);

afterAll(() => mgr.closeAll());

async function nxAccess() {
  return tenant.driver.query<{ model: string; group_code: string | null; perm_read: boolean }>({
    text: `SELECT model, group_code, perm_read FROM nx_access WHERE module = $1 ORDER BY id`, params: [RECORDS_MODULE],
  });
}

describe('base manifest', () => {
  it('ships ir.model.access and ir.rule as system-only models and bumps the version', () => {
    expect(baseModule.models!.map((m) => m.name)).toEqual(expect.arrayContaining(['ir.model.access', 'ir.rule']));
    for (const model of ['ir.model.access', 'ir.rule']) {
      expect(configAccess.filter((a) => a.model === model).map((a) => a.group)).toEqual(['base.group_system']);
    }
    expect(baseModule.version).toBe('1.4.0');
  });
});

describe('ir.model.access records', () => {
  it('is system-only', async () => {
    await expect(env(aliceUid).model('ir.model.access').create({ name: 'x', model_name: 'secr.order', perm_read: true }))
      .rejects.toBeInstanceOf(AccessError);
    await expect(env(aliceUid).model('ir.model.access').search([])).rejects.toBeInstanceOf(AccessError);
  });

  it('grants access to a group, toggles and removes it, taking effect immediately', async () => {
    const alice = env(aliceUid);
    await expect(alice.model('secr.order').search([])).rejects.toBeInstanceOf(AccessError);
    const acl = await admin.model('ir.model.access').create({
      name: 'sales orders', model_name: 'secr.order', group_id: salesGroup, perm_read: true, perm_write: true, perm_create: true,
    });
    expect(await nxAccess()).toEqual([{ model: 'secr.order', group_code: 'x_sales.user', perm_read: true }]);
    // a fresh env (= next request) sees the right
    await env(aliceUid).model('secr.order').create({ name: 'A1', owner_id: aliceUid, company_id: companyA });
    await expect(env(aliceUid).model('secr.order').search([]).then((r) => r.ids.length)).resolves.toBe(1);
    await expect(env(aliceUid).model('secr.order').search([]).then((r) => r.unlink())).rejects.toBeInstanceOf(AccessError);

    await acl.write({ active: false });
    expect(await nxAccess()).toEqual([]);
    await expect(env(aliceUid).model('secr.order').search([])).rejects.toBeInstanceOf(AccessError);
    await acl.write({ active: true });
    await expect(env(aliceUid).model('secr.order').search([]).then((r) => r.ids.length)).resolves.toBe(1);
  });

  it('invalidates the cached security of the writing env family', async () => {
    const acl = await admin.model('ir.model.access').create({ name: 'tmp', model_name: 'secr.order', group_id: userGroup, perm_read: true });
    await expect(admin.model('secr.order').search([]).then((r) => r.ids.length)).resolves.toBeGreaterThan(0);
    await acl.unlink();
    await expect(admin.model('secr.order').search([])).rejects.toBeInstanceOf(AccessError);
  });

  it('rejects unknown, abstract and protected models', async () => {
    const Acl = admin.model('ir.model.access');
    await expect(Acl.create({ name: 'x', model_name: 'secr.nope', group_id: salesGroup, perm_read: true })).rejects.toThrow(/does not exist/);
    await expect(Acl.create({ name: 'x', model_name: 'secr.mixin', group_id: salesGroup, perm_read: true })).rejects.toThrow(/not a concrete model/);
    for (const model of ['res.users', 'res.groups', 'ir.rule', 'ir.model.access', 'ir.actions.server', 'mail.template']) {
      await expect(Acl.create({ name: 'x', model_name: model, group_id: salesGroup, perm_read: true })).rejects.toThrow(/managed by modules/);
    }
    expect((await nxAccess()).map((r) => r.model)).toEqual(['secr.order']);
  });

  it('does not expose or touch module-owned rows', async () => {
    const before = await tenant.driver.query<{ n: number }>({ text: `SELECT count(*)::int AS n FROM nx_access WHERE module = 'base'`, params: [] });
    await admin.model('ir.model.access').create({ name: 'y', model_name: 'secr.order', group_id: managerGroup, perm_unlink: true });
    const after = await tenant.driver.query<{ n: number }>({ text: `SELECT count(*)::int AS n FROM nx_access WHERE module = 'base'`, params: [] });
    expect(after).toEqual(before);
    const names = (await admin.model('ir.model.access').search([]).then((r) => r.read(['name']))).map((r) => r.name);
    expect(names.sort()).toEqual(['sales orders', 'y']);
  });

  it('resyncs group codes and refuses to delete groups used by rules', async () => {
    const [g] = (await root.model('res.groups').create({ name: 'Tmp', code: 'x_tmp.a' })).ids;
    const acl = await admin.model('ir.model.access').create({ name: 'tmp', model_name: 'secr.order', group_id: g, perm_read: true });
    await root.model('res.groups').browse([g!]).write({ code: 'x_tmp.b' });
    expect((await nxAccess()).map((r) => r.group_code)).toContain('x_tmp.b');
    await acl.unlink();
    const rule = await admin.model('ir.rule').create({ name: 'tmp', model_name: 'secr.order', group_ids: [g], domain_force: '[]' });
    await expect(root.model('res.groups').browse([g!]).unlink()).rejects.toThrow(/used by record rules/);
    await rule.unlink();
    await root.model('res.groups').browse([g!]).unlink();
  });
});

describe('ir.rule records', () => {
  it('restricts salespeople to their own orders while managers see all', async () => {
    await root.model('secr.order').create([
      { name: 'B1', owner_id: bobUid, company_id: companyA },
      { name: 'A-B', owner_id: aliceUid, company_id: companyB },
    ]);
    const visible = async (uid: number, companyIds?: number[]) =>
      (await env(uid, companyIds).model('secr.order').search([]).then((r) => r.read(['name']))).map((r) => r.name).sort();
    expect(await visible(bobUid)).toEqual(['A-B', 'A1', 'B1']);

    await admin.model('ir.rule').create({
      name: 'own orders', model_name: 'secr.order', group_ids: [salesGroup],
      domain_force: JSON.stringify([['owner_id', '=', { $ctx: 'uid' }]]),
    });
    const own = await admin.model('ir.rule').create({
      name: 'all orders', model_name: 'secr.order', group_ids: [managerGroup], domain_force: '[]',
    });
    expect(await visible(bobUid)).toEqual(['B1']);
    expect(await visible(aliceUid)).toEqual(['A-B', 'A1']);
    await expect(env(bobUid).model('secr.order').browse([(await root.model('secr.order').search([['name', '=', 'A1']])).ids[0]!])
      .write({ name: 'stolen' })).rejects.toBeInstanceOf(AccessError);

    await root.model('res.users').browse([bobUid]).write({ group_ids: [managerGroup] });
    expect(await visible(bobUid)).toEqual(['A-B', 'A1', 'B1']);
    await root.model('res.users').browse([bobUid]).write({ group_ids: [salesGroup] });
    expect(own.ids.length).toBe(1);
  });

  it('applies a global NX-Expr multi-company rule ANDed with group rules', async () => {
    const rule = await admin.model('ir.rule').create({
      name: 'company', model_name: 'secr.order', domain_force: "[['company_id', 'in', companyIds]]",
    });
    const names = async (companyIds: number[]) =>
      (await env(aliceUid, companyIds).model('secr.order').search([]).then((r) => r.read(['name']))).map((r) => r.name).sort();
    expect(await names([companyA])).toEqual(['A1']);
    expect(await names([companyB])).toEqual(['A-B']);
    expect(await names([companyA, companyB])).toEqual(['A-B', 'A1']);
    await rule.write({ active: false });
    expect(await names([companyA])).toEqual(['A-B', 'A1']);
    await rule.unlink();
  });

  it('validates the domain against the model', async () => {
    const Rule = admin.model('ir.rule');
    await expect(Rule.create({ name: 'bad', model_name: 'secr.order', domain_force: '[["nope", "=", 1]]' })).rejects.toThrow(/invalid domain/);
    await expect(Rule.create({ name: 'bad', model_name: 'secr.order', domain_force: "[['nope', '=', user.id]]" })).rejects.toThrow(/invalid domain/);
    await expect(Rule.create({ name: 'bad', model_name: 'secr.order', domain_force: 'user.password' })).rejects.toThrow(/invalid domain/);
    await expect(Rule.create({ name: 'bad', model_name: 'secr.order', domain_force: '["&", ["name", "=", "x"]]' })).rejects.toThrow(/invalid domain/);
    await expect(Rule.create({
      name: 'bad', model_name: 'secr.order', domain_force: '[]', perm_read: false, perm_write: false, perm_create: false, perm_unlink: false,
    })).rejects.toThrow(/at least one operation/);
    const ok = await Rule.create({ name: 'ok', model_name: 'secr.order', domain_force: "[['owner_id.login', '!=', false]]", perm_read: false });
    await expect(ok.write({ domain_force: '[["missing", "=", 1]]' })).rejects.toThrow(/invalid domain/);
    await ok.unlink();
  });

  it('cannot target security models (admin lock-out guard) and is system-only', async () => {
    for (const model of ['res.users', 'res.groups', 'ir.rule', 'ir.model.access', 'res.company']) {
      await expect(admin.model('ir.rule').create({ name: 'lock', model_name: model, domain_force: '[["id", "=", 0]]' }))
        .rejects.toThrow(/managed by modules/);
    }
    await expect(env(aliceUid).model('ir.rule').create({ name: 'x', model_name: 'secr.order', domain_force: '[]' }))
      .rejects.toBeInstanceOf(AccessError);
  });

  it('requires a group on access rights (no public rows)', async () => {
    await expect(admin.model('ir.model.access').create({ name: 'public', model_name: 'secr.order', perm_read: true }))
      .rejects.toThrow(/required/);
  });

  it('allows only group rules on reference data models', async () => {
    await expect(admin.model('ir.rule').create({ name: 'g', model_name: 'uom.secr', domain_force: '[["id", "=", 0]]' }))
      .rejects.toThrow(/reference data/);
    const ok = await admin.model('ir.rule').create({
      name: 'g', model_name: 'uom.secr', group_ids: [salesGroup], domain_force: '[["id", "=", 0]]',
    });
    await expect(ok.write({ group_ids: [] })).rejects.toThrow(/reference data/);
    await ok.unlink();
  });

  it('reports SQL-level domain failures as validation errors without aborting the admin transaction', async () => {
    await admin.transaction(async (tx) => {
      await expect(tx.model('ir.rule').create({ name: 'sql', model_name: 'secr.order', domain_force: '[["id", "=", "not-a-number"]]' }))
        .rejects.toThrow(/invalid domain/);
      const later = await tx.model('ir.rule').create({ name: 'after', model_name: 'secr.order', domain_force: '[]', perm_read: false });
      await later.unlink();
    });
  });

  it('module upgrades leave administrator rows alone', async () => {
    const before = await tenant.driver.query({ text: `SELECT model, name FROM nx_rule WHERE module = $1 ORDER BY id`, params: [RECORDS_MODULE] });
    expect(before.length).toBe(2);
    await writeModuleSecurity(tenant.driver, 'base', [...baseModule.access!, { model: 'secr.order', group: 'base.group_system', perms: all }], baseModule.rules!);
    const after = await tenant.driver.query({ text: `SELECT model, name FROM nx_rule WHERE module = $1 ORDER BY id`, params: [RECORDS_MODULE] });
    expect(after).toEqual(before);
  });
});
