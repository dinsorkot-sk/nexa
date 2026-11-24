import type { ModuleManifest } from '../contracts/index.js';

/**
 * Small contact directory used by the API's optional demonstration module set. The res.partner
 * model, its access rights and multi-company rule come from `base`; this module adds the menu,
 * views and sample contacts.
 */
export const contactsModule: ModuleManifest = {
  name: 'contacts',
  version: '1.1.0',
  summary: 'People and organizations',
  depends: ['base'],
  data: [
    { xmlId: 'contact_nexa', model: 'res.partner', noUpdate: true, values: { name: 'Nexa Systems', company_type: 'company', email: 'hello@nexa.example', country_id: { ref: 'base.th' }, phone: '+66 2 555 0100' } },
    { xmlId: 'contact_mali', model: 'res.partner', noUpdate: true, values: { name: 'Mali Chaiyaporn', email: 'mali@example.test', parent_id: { ref: 'contact_nexa' }, phone: '+66 81 555 0101' } },
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
      { tag: 'group', children: [{ tag: 'field', attrs: { name: 'email' } }, { tag: 'field', attrs: { name: 'phone' } }, { tag: 'field', attrs: { name: 'vat' } }] },
      { tag: 'group', children: [{ tag: 'field', attrs: { name: 'parent_id' } }, { tag: 'field', attrs: { name: 'country_id' } }, { tag: 'field', attrs: { name: 'city' } }] },
    ] }] } },
  ],
};
