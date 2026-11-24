import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgliteTenantManager, ValidationError, securityModels, type Env, type ModelDef } from '../src/index.js';

const models: ModelDef[] = securityModels.map((model) => model.name === 'res.groups'
  ? {
      ...model,
      fields: {
        ...model.fields,
        user_ids: {
          type: 'many2many', comodel: 'res.users', relationTable: 'res_groups_users_rel',
          column1: 'gid', column2: 'uid',
        },
      },
    }
  : model.name === 'res.users'
    ? { ...model, fields: { ...model.fields, cascade_parent_id: { type: 'many2one', comodel: 'res.partner', ondelete: 'cascade' } } }
    : model).concat({
      name: 'res.partner', origin: 'custom', fields: { name: { type: 'char' } },
    });

let manager: PgliteTenantManager;
let env: Env;
let companyId: number;
let systemGroupId: number;
let erpManagerGroupId: number;
let impliedGroupId: number;
let adminId: number;
let secondAdminId: number;

beforeAll(async () => {
  manager = new PgliteTenantManager({ models: async () => models });
  env = (await manager.open('last-admin')).env({ uid: 1 });
  [companyId] = (await env.model('res.company').create({ name: 'Admin company' })).ids;
  await env.model('res.users').create({ name: 'Internal user', login: 'internal', company_id: companyId });
  [systemGroupId, erpManagerGroupId] = (await env.model('res.groups').create([
    { name: 'Settings', code: 'base.group_system' },
    { name: 'ERP manager', code: 'base.group_erp_manager' },
  ])).ids;
  await env.model('res.groups').browse(systemGroupId).write({ implied_ids: [erpManagerGroupId] });
  [impliedGroupId] = (await env.model('res.groups').create({
    name: 'Settings through implication', code: 'base.group_admin_parent', implied_ids: [systemGroupId],
  })).ids;
  [adminId] = (await env.model('res.users').create({
    name: 'Admin one', login: 'admin-one', company_id: companyId, group_ids: [impliedGroupId],
  })).ids;
}, 60_000);

afterAll(() => manager.closeAll());

describe('last Settings administrator protection', () => {
  it('recognizes implied groups and prevents removing the final active administrator', async () => {
    const admin = env.model('res.users').browse(adminId);
    await expect(admin.write({ active: false })).rejects.toThrow(ValidationError);
    expect((await admin.read(['active']))[0].active).toBe(true);

    await expect(admin.write({ group_ids: false })).rejects.toThrow(/last active Settings administrator/);
    expect((await admin.read(['group_ids']))[0].group_ids).toContain(impliedGroupId);
    await expect(env.model('res.groups').browse(impliedGroupId).write({ user_ids: false }))
      .rejects.toThrow(/last active Settings administrator/);

    await expect(env.model('res.groups').browse(systemGroupId).write({ code: 'base.group_settings' }))
      .rejects.toThrow(/last active Settings administrator/);
    expect((await env.model('res.groups').browse(systemGroupId).read(['code']))[0].code).toBe('base.group_system');

    await expect(env.model('res.groups').browse(impliedGroupId).write({ implied_ids: false }))
      .rejects.toThrow(/last active Settings administrator/);
    expect((await env.model('res.groups').browse(impliedGroupId).read(['implied_ids']))[0].implied_ids)
      .toContain(systemGroupId);

    await expect(admin.unlink()).rejects.toThrow(/last active Settings administrator/);
    expect((await admin.read(['active']))[0].active).toBe(true);
  });

  it('allows one administrator to be disabled while another remains', async () => {
    [secondAdminId] = (await env.model('res.users').create({
      name: 'Admin two', login: 'admin-two', company_id: companyId, group_ids: [systemGroupId],
    })).ids;
    const first = env.model('res.users').browse(adminId);
    await first.write({ active: false });
    expect((await env.model('res.users').browse(secondAdminId).read(['active']))[0].active).toBe(true);
    await expect(env.model('res.users').browse(secondAdminId).write({ active: false }))
      .rejects.toThrow(/last active Settings administrator/);
    await first.write({ active: true });
  });

  it('keeps a bulk removal atomic and prevents deleting the last admin group', async () => {
    const users = env.model('res.users').browse([adminId, secondAdminId]);
    await expect(users.write({ group_ids: false })).rejects.toThrow(/last active Settings administrator/);
    expect((await users.read(['group_ids'])).every((row) => (row.group_ids as number[]).length > 0)).toBe(true);

    await expect(env.model('res.groups').browse(systemGroupId).unlink())
      .rejects.toThrow(/last active Settings administrator/);
    expect((await env.model('res.groups').browse(systemGroupId).read(['code']))[0].code).toBe('base.group_system');
  });

  it('blocks a cascade deletion through another model from deleting the last administrator', async () => {
    expect(env.registry.get('res.users').fields.get('cascade_parent_id')?.ondelete).toBe('cascade');
    await env.model('res.users').browse(secondAdminId).write({ active: false });
    const [partnerId] = (await env.model('res.partner').create({ name: 'Cascade target' })).ids;
    const admin = env.model('res.users').browse(adminId);
    await admin.write({ cascade_parent_id: partnerId });
    await expect(env.model('res.partner').browse(partnerId).unlink())
      .rejects.toThrow(/last active Settings administrator/);
    expect((await admin.read(['active']))[0].active).toBe(true);
  });

  it('does not require an admin while bootstrapping an empty tenant', async () => {
    const empty = (await manager.open('last-admin-bootstrap')).env({ uid: 1 });
    const [company] = (await empty.model('res.company').create({ name: 'Bootstrap company' })).ids;
    const [settings, managerGroup] = (await empty.model('res.groups').create([
      { name: 'Settings', code: 'base.group_system' },
      { name: 'ERP manager', code: 'base.group_erp_manager' },
    ])).ids;
    const [settingsOnly] = (await empty.model('res.users').create({
      name: 'Settings only', login: 'settings-only', company_id: company, group_ids: [settings],
    })).ids;
    const [firstUser] = (await empty.model('res.users').create({
      name: 'First user', login: 'first-user', company_id: company, group_ids: [managerGroup],
    })).ids;
    const otherAdmins = await empty.db.query<{ id: number }>({
      text: `WITH RECURSIVE protected_groups(id) AS (
               SELECT id FROM res_groups WHERE code = 'base.group_system'
               UNION SELECT rel.gid FROM res_groups_implied_rel rel JOIN protected_groups p ON p.id = rel.hid
             )
             SELECT DISTINCT u.id FROM res_users u WHERE u.id > 1 AND u.active IS TRUE AND u.id <> $1
             AND EXISTS (SELECT 1 FROM res_groups_users_rel rel JOIN protected_groups p ON p.id = rel.gid WHERE rel.uid = u.id)
             AND EXISTS (SELECT 1 FROM res_groups_users_rel rel JOIN res_groups g ON g.id = rel.gid WHERE rel.uid = u.id AND g.code = 'base.group_erp_manager')`,
      params: [firstUser],
    });
    for (const { id } of otherAdmins) await empty.model('res.users').browse(id).write({ active: false });
    await empty.model('res.users').browse(settingsOnly).write({ active: false });
    await expect(empty.model('res.users').browse(firstUser).write({ active: false })).resolves.toBeUndefined();
    const [combined] = (await empty.model('res.users').create({
      name: 'Combined role user', login: 'combined-role', company_id: company, group_ids: [settings, managerGroup],
    })).ids;
    await expect(empty.model('res.users').browse(combined).write({ active: false }))
      .rejects.toThrow(/last active Settings administrator/);

    const separate = (await manager.open('last-admin-internal-only')).env({ uid: 1 });
    const [separateCompany] = (await separate.model('res.company').create({ name: 'Internal only company' })).ids;
    const [separateSettings] = (await separate.model('res.groups').create({
      name: 'Settings', code: 'base.group_system',
    })).ids;
    await separate.model('res.users').create({
      name: 'Internal user', login: 'internal', company_id: separateCompany, group_ids: [separateSettings],
    });
    const [ordinaryUser] = (await separate.model('res.users').create({
      name: 'Ordinary user', login: 'ordinary-user', company_id: separateCompany,
    })).ids;
    await expect(separate.model('res.users').browse(ordinaryUser).write({ active: false })).resolves.toBeUndefined();
  });
});
