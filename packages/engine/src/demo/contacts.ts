import type { ModuleManifest } from '../contracts/index.js';

const userAccess = { read: true, write: true, create: true, unlink: false };

/** Small contact directory used by the API's optional demonstration module set. */
export const contactsModule: ModuleManifest = {
  name: 'contacts',
  version: '1.0.0',
  summary: 'People and organizations',
  depends: ['base'],
  models: [{
    name: 'res.partner',
    description: 'People and organizations',
    origin: 'module',
    module: 'contacts',
    order: 'name asc',
    fields: {
      name: { type: 'char', string: 'Name', required: true, index: true },
      company_type: { type: 'selection', string: 'Type', selection: [['person', 'Person'], ['company', 'Company']], default: 'person' },
      email: { type: 'char', string: 'Email' },
      phone: { type: 'char', string: 'Phone' },
      active: { type: 'boolean', string: 'Active', default: true },
    },
  }],
  access: [{ model: 'res.partner', group: 'base.group_user', perms: userAccess }],
  data: [
    { xmlId: 'contact_nexa', model: 'res.partner', noUpdate: true, values: { name: 'Nexa Systems', company_type: 'company', email: 'hello@nexa.example', phone: '+66 2 555 0100' } },
    { xmlId: 'contact_mali', model: 'res.partner', noUpdate: true, values: { name: 'Mali Chaiyaporn', email: 'mali@example.test', phone: '+66 81 555 0101' } },
  ],
  actions: [{ xmlId: 'action_contacts', type: 'window', name: 'Contacts', model: 'res.partner', viewTypes: ['list', 'form'] }],
  menus: [{ xmlId: 'menu_contacts', name: 'Contacts', sequence: 20, action: 'action_contacts' }],
  views: [
    { xmlId: 'view_contacts_list', model: 'res.partner', type: 'list', arch: { tag: 'list', children: [
      { tag: 'field', attrs: { name: 'name' } }, { tag: 'field', attrs: { name: 'company_type' } },
      { tag: 'field', attrs: { name: 'email' } }, { tag: 'field', attrs: { name: 'phone' } },
    ] } },
    { xmlId: 'view_contacts_form', model: 'res.partner', type: 'form', arch: { tag: 'form', children: [{ tag: 'sheet', children: [
      { tag: 'group', children: [{ tag: 'field', attrs: { name: 'name' } }, { tag: 'field', attrs: { name: 'company_type' } }] },
      { tag: 'group', children: [{ tag: 'field', attrs: { name: 'email' } }, { tag: 'field', attrs: { name: 'phone' } }] },
    ] }] } },
  ],
};
