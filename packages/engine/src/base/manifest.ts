import type { ModuleManifest } from '../contracts/index.js';
import { ACCESS_MANAGER, securityModels } from '../security/models.js';
import { configAccess, configModels, configRules } from './config-models.js';
import { countryData, countryModels } from './country.js';
import { currencyData, currencyModels } from './currency.js';
import { langData, langModels } from './lang.js';
import { migrateBase110 } from './migrate.js';
import { partnerAccess, partnerModels, partnerRules } from './partner.js';

const all = { read: true, write: true, create: true, unlink: true };
const readOnly = { read: true, write: false, create: false, unlink: false };

/**
 * The `base` module every tenant installs: companies, groups, users, their access rules and the
 * administrator account. Only access managers may change groups and users' privileges.
 */
export const baseModule: ModuleManifest = {
  name: 'base',
  version: '1.4.0',
  summary: 'Companies, users, groups, access control, partners, currencies, countries and languages',
  depends: [],
  models: [...securityModels, ...configModels, ...currencyModels, ...countryModels, ...langModels, ...partnerModels],
  // Reference data is noUpdate: upgrades keep administrators' edits. Groups stay updatable because
  // implied_ids drives security: an upgrade resets admin edits to base group names / implied groups
  // (selective per-field noUpdate is a possible future refinement).
  data: [
    ...currencyData,
    ...countryData,
    ...langData,
    { xmlId: 'main_company', model: 'res.company', values: { name: 'My Company', currency_id: { ref: 'USD' } }, noUpdate: true },
    { xmlId: 'group_user', model: 'res.groups', values: { name: 'Internal User', code: 'base.group_user' } },
    {
      xmlId: 'group_erp_manager', model: 'res.groups',
      values: { name: 'Access Rights', code: ACCESS_MANAGER, implied_ids: [{ ref: 'group_user' }] },
    },
    {
      xmlId: 'group_system', model: 'res.groups',
      values: { name: 'Settings', code: 'base.group_system', implied_ids: [{ ref: 'group_erp_manager' }] },
    },
    { xmlId: 'group_portal', model: 'res.groups', values: { name: 'Portal', code: 'base.group_portal', implied_ids: [] } },
    { xmlId: 'group_public', model: 'res.groups', values: { name: 'Public', code: 'base.group_public', implied_ids: [] } },
    {
      xmlId: 'user_admin', model: 'res.users', noUpdate: true,
      values: {
        name: 'Administrator', login: 'admin', company_id: { ref: 'main_company' },
        company_ids: [{ ref: 'main_company' }], group_ids: [{ ref: 'group_system' }],
      },
    },
  ],
  hooks: { migrate: { '1.1.0': migrateBase110 } },
  access: [
    { model: 'res.company', group: 'base.group_user', perms: readOnly },
    { model: 'res.company', group: 'base.group_system', perms: all },
    { model: 'res.groups', group: 'base.group_user', perms: readOnly },
    { model: 'res.groups', group: ACCESS_MANAGER, perms: all },
    { model: 'res.users', group: 'base.group_user', perms: { read: true, write: true, create: false, unlink: false } },
    { model: 'res.users', group: ACCESS_MANAGER, perms: all },
    ...configAccess,
    ...partnerAccess,
    ...['res.currency', 'res.currency.rate', 'decimal.precision', 'res.country', 'res.country.state', 'res.country.group', 'res.lang']
      .flatMap((model) => [{ model, group: 'base.group_user', perms: readOnly }, { model, group: 'base.group_system', perms: all }]),
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
    ...partnerRules,
    // company-specific currency rates are visible to (and editable within) the active companies only
    {
      name: 'res_currency_rate_company', model: 'res.currency.rate', groups: [], perms: all,
      domain: ['|', ['company_id', '=', false], ['company_id', 'in', { $ctx: 'company_ids' } as never]],
    },
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
    { xmlId: 'action_server_actions', type: 'window', name: 'Server Actions', model: 'ir.actions.server', viewTypes: ['list', 'form'] },
    { xmlId: 'action_buttons', type: 'window', name: 'Buttons', model: 'ir.button', viewTypes: ['list', 'form'] },
    { xmlId: 'action_access_rights', type: 'window', name: 'Access Rights', model: 'ir.model.access', viewTypes: ['list', 'form'] },
    { xmlId: 'action_record_rules', type: 'window', name: 'Record Rules', model: 'ir.rule', viewTypes: ['list', 'form'] },
    { xmlId: 'action_currencies', type: 'window', name: 'Currencies', model: 'res.currency', viewTypes: ['list', 'form'] },
    { xmlId: 'action_countries', type: 'window', name: 'Countries', model: 'res.country', viewTypes: ['list', 'form'] },
    { xmlId: 'action_langs', type: 'window', name: 'Languages', model: 'res.lang', viewTypes: ['list', 'form'] },
    { xmlId: 'action_decimal_precision', type: 'window', name: 'Decimal Accuracy', model: 'decimal.precision', viewTypes: ['list', 'form'] },
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
    { xmlId: 'menu_server_actions', name: 'Server Actions', parent: 'menu_technical', action: 'action_server_actions', sequence: 6 },
    { xmlId: 'menu_buttons', name: 'Buttons', parent: 'menu_technical', action: 'action_buttons', sequence: 7 },
    { xmlId: 'menu_access_rights', name: 'Access Rights', parent: 'menu_technical', action: 'action_access_rights', sequence: 8 },
    { xmlId: 'menu_record_rules', name: 'Record Rules', parent: 'menu_technical', action: 'action_record_rules', sequence: 9 },
    { xmlId: 'menu_currencies', name: 'Currencies', parent: 'menu_technical', action: 'action_currencies', sequence: 10 },
    { xmlId: 'menu_countries', name: 'Countries', parent: 'menu_technical', action: 'action_countries', sequence: 11 },
    { xmlId: 'menu_langs', name: 'Languages', parent: 'menu_technical', action: 'action_langs', sequence: 12 },
    { xmlId: 'menu_decimal_precision', name: 'Decimal Accuracy', parent: 'menu_technical', action: 'action_decimal_precision', sequence: 13 },
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
