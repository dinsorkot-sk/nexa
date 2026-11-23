import type { ModelDef } from '../contracts/index.js';

/** Group allowed to change users' groups and companies. */
export const ACCESS_MANAGER = 'base.group_erp_manager';

/**
 * Models the security layer reads (Odoo res.company / res.groups / res.users).
 * The module system ships them in the `base` module; tests may register them directly.
 * Groups are referenced everywhere by their stable `code` (e.g. 'base.group_user').
 */
export const securityModels: ModelDef[] = [
  {
    name: 'res.company', origin: 'module', module: 'base', order: 'name asc',
    fields: {
      name: { type: 'char', required: true },
      parent_id: { type: 'many2one', comodel: 'res.company', ondelete: 'restrict' },
    },
  },
  {
    name: 'res.groups', origin: 'module', module: 'base', order: 'name asc',
    fields: {
      name: { type: 'char', required: true },
      code: { type: 'char', required: true, unique: true },
      implied_ids: {
        type: 'many2many', comodel: 'res.groups', string: 'Inherits',
        relationTable: 'res_groups_implied_rel', column1: 'gid', column2: 'hid',
      },
    },
  },
  {
    name: 'res.users', origin: 'module', module: 'base', order: 'login asc',
    fields: {
      name: { type: 'char', required: true },
      login: { type: 'char', required: true, unique: true, writeGroups: [ACCESS_MANAGER] },
      active: { type: 'boolean', default: true, writeGroups: [ACCESS_MANAGER] },
      // fields that grant privileges: only access managers may change them (Odoo groups_id is restricted too)
      company_id: { type: 'many2one', comodel: 'res.company', required: true, ondelete: 'restrict', groups: [ACCESS_MANAGER] },
      company_ids: {
        type: 'many2many', comodel: 'res.company', string: 'Allowed companies', groups: [ACCESS_MANAGER],
        relationTable: 'res_company_users_rel', column1: 'user_id', column2: 'cid',
      },
      group_ids: {
        type: 'many2many', comodel: 'res.groups', string: 'Groups', groups: [ACCESS_MANAGER],
        relationTable: 'res_groups_users_rel', column1: 'uid', column2: 'gid',
      },
    },
  },
];
