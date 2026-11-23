import type { ModuleManifest } from '../contracts/index.js';
import { ACCESS_MANAGER, securityModels } from '../security/models.js';

const all = { read: true, write: true, create: true, unlink: true };
const readOnly = { read: true, write: false, create: false, unlink: false };

/**
 * The `base` module every tenant installs: companies, groups, users, their access rules and the
 * administrator account. Only access managers may change groups and users' privileges.
 */
export const baseModule: ModuleManifest = {
  name: 'base',
  version: '1.0.0',
  summary: 'Companies, users, groups and access control',
  depends: [],
  models: securityModels,
  data: [
    { xmlId: 'main_company', model: 'res.company', values: { name: 'My Company' }, noUpdate: true },
    { xmlId: 'group_user', model: 'res.groups', values: { name: 'Internal User', code: 'base.group_user' } },
    {
      xmlId: 'group_erp_manager', model: 'res.groups',
      values: { name: 'Access Rights', code: ACCESS_MANAGER, implied_ids: [{ ref: 'group_user' }] },
    },
    {
      xmlId: 'group_system', model: 'res.groups',
      values: { name: 'Settings', code: 'base.group_system', implied_ids: [{ ref: 'group_erp_manager' }] },
    },
    {
      xmlId: 'user_admin', model: 'res.users', noUpdate: true,
      values: {
        name: 'Administrator', login: 'admin', company_id: { ref: 'main_company' },
        company_ids: [{ ref: 'main_company' }], group_ids: [{ ref: 'group_system' }],
      },
    },
  ],
  access: [
    { model: 'res.company', group: 'base.group_user', perms: readOnly },
    { model: 'res.company', group: 'base.group_system', perms: all },
    { model: 'res.groups', group: 'base.group_user', perms: readOnly },
    { model: 'res.groups', group: ACCESS_MANAGER, perms: all },
    { model: 'res.users', group: 'base.group_user', perms: { read: true, write: true, create: false, unlink: false } },
    { model: 'res.users', group: ACCESS_MANAGER, perms: all },
  ],
  rules: [
    // users may edit only their own record (privilege fields are additionally restricted by field groups)
    {
      name: 'res_users_self_write', model: 'res.users', groups: ['base.group_user'],
      perms: { read: false, write: true, create: false, unlink: false }, domain: [['id', '=', { $ctx: 'uid' } as never]],
    },
    {
      name: 'res_users_manager_write', model: 'res.users', groups: [ACCESS_MANAGER],
      perms: { read: false, write: true, create: true, unlink: true }, domain: [],
    },
  ],
  menus: [{ xmlId: 'menu_settings', name: 'Settings', sequence: 100, groups: ['base.group_system'] }],
};
