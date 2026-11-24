import type { ModuleManifest } from '../contracts/index.js';
import { ACCESS_MANAGER, securityModels } from '../security/models.js';
import { configAccess, configModels, configRules } from './config-models.js';

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
  models: [...securityModels, ...configModels],
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
    ...configAccess,
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
    ...configRules,
  ],
  actions: [
    { xmlId: 'action_users', type: 'window', name: 'Users', model: 'res.users', viewTypes: ['list', 'form'] },
    { xmlId: 'action_groups', type: 'window', name: 'Groups', model: 'res.groups', viewTypes: ['list', 'form'] },
    { xmlId: 'action_companies', type: 'window', name: 'Companies', model: 'res.company', viewTypes: ['list', 'form'] },
    { xmlId: 'action_sequences', type: 'window', name: 'Sequences', model: 'ir.sequence', viewTypes: ['list', 'form'] },
    { xmlId: 'action_config_parameters', type: 'window', name: 'System Parameters', model: 'ir.config_parameter', viewTypes: ['list', 'form'] },
    { xmlId: 'action_defaults', type: 'window', name: 'Default Values', model: 'ir.default', viewTypes: ['list', 'form'] },
    { xmlId: 'action_crons', type: 'window', name: 'Scheduled Actions', model: 'ir.cron', viewTypes: ['list', 'form'] },
    { xmlId: 'action_automations', type: 'window', name: 'Automation Rules', model: 'ir.automation', viewTypes: ['list', 'form'] },
  ],
  menus: [
    { xmlId: 'menu_settings', name: 'Settings', sequence: 100, groups: ['base.group_system'] },
    { xmlId: 'menu_users', name: 'Users', parent: 'menu_settings', action: 'action_users', sequence: 1 },
    { xmlId: 'menu_groups', name: 'Groups', parent: 'menu_settings', action: 'action_groups', sequence: 2 },
    { xmlId: 'menu_companies', name: 'Companies', parent: 'menu_settings', action: 'action_companies', sequence: 3 },
    { xmlId: 'menu_technical', name: 'Technical', parent: 'menu_settings', sequence: 50, groups: ['base.group_system'] },
    { xmlId: 'menu_sequences', name: 'Sequences', parent: 'menu_technical', action: 'action_sequences', sequence: 1 },
    { xmlId: 'menu_config_parameters', name: 'System Parameters', parent: 'menu_technical', action: 'action_config_parameters', sequence: 2 },
    { xmlId: 'menu_defaults', name: 'Default Values', parent: 'menu_technical', action: 'action_defaults', sequence: 3 },
    { xmlId: 'menu_crons', name: 'Scheduled Actions', parent: 'menu_technical', action: 'action_crons', sequence: 4 },
    { xmlId: 'menu_automations', name: 'Automation Rules', parent: 'menu_technical', action: 'action_automations', sequence: 5 },
  ],
  views: [
    {
      xmlId: 'view_users_list', model: 'res.users', type: 'list',
      arch: { tag: 'list', children: [
        { tag: 'field', attrs: { name: 'name' } }, { tag: 'field', attrs: { name: 'login' } },
        { tag: 'field', attrs: { name: 'company_id' } }, { tag: 'field', attrs: { name: 'active' } },
      ] },
    },
    {
      xmlId: 'view_users_form', model: 'res.users', type: 'form',
      arch: { tag: 'form', children: [{ tag: 'sheet', children: [
        { tag: 'group', attrs: { string: 'User' }, children: [
          { tag: 'field', attrs: { name: 'name' } }, { tag: 'field', attrs: { name: 'login' } },
          { tag: 'field', attrs: { name: 'active' } },
        ] },
        { tag: 'group', attrs: { string: 'Access', groups: [ACCESS_MANAGER] }, children: [
          { tag: 'field', attrs: { name: 'company_id' } }, { tag: 'field', attrs: { name: 'company_ids' } },
          { tag: 'field', attrs: { name: 'group_ids' } },
        ] },
      ] }] },
    },
  ],
};
