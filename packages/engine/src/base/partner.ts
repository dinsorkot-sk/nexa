import { ValidationError, type AccessRule, type ModelDef, type Recordset, type RecordRule } from '../contracts/index.js';
import { ACCESS_MANAGER } from '../security/models.js';
import { checkLangField, checkTzField } from './lang.js';

const all = { read: true, write: true, create: true, unlink: true };
const SYSTEM = 'base.group_system';

type Row = Record<string, unknown>;

async function parentsOf(records: Recordset, rows: Row[], fields: string[]): Promise<Map<number, Row>> {
  const ids = [...new Set(rows.map((row) => row.parent_id).filter((id): id is number => typeof id === 'number'))];
  if (!ids.length) return new Map();
  const read = await records.env.model('res.partner').browse(ids).read(fields);
  return new Map(read.map((row) => [row.id as number, row]));
}

const computeIsCompany = async (records: Recordset) => new Map(
  (await records.read(['company_type'])).map((row) => [row.id as number, row.company_type === 'company']),
);

/** "Company, Contact" for contacts of a company; the full parent chain is used for nested contacts. */
const computeCompleteName = async (records: Recordset) => {
  const rows = await records.read(['name', 'is_company', 'parent_id']);
  const parents = await parentsOf(records, rows, ['complete_name']);
  return new Map(rows.map((row) => {
    const parent = typeof row.parent_id === 'number' ? parents.get(row.parent_id) : undefined;
    const name = String(row.name ?? '');
    return [row.id as number, parent && !row.is_company && parent.complete_name ? `${String(parent.complete_name)}, ${name}` : name];
  }));
};

/** The partner holding commercial data: itself when a company or without parent, else its parent's. */
const computeCommercial = async (records: Recordset) => {
  const rows = await records.read(['is_company', 'parent_id']);
  const parents = await parentsOf(records, rows, ['commercial_partner_id']);
  return new Map(rows.map((row) => {
    const parent = typeof row.parent_id === 'number' ? parents.get(row.parent_id) : undefined;
    return [row.id as number, row.is_company || !parent ? row.id : (parent.commercial_partner_id ?? parent.id)];
  }));
};

async function checkPartners(records: Recordset): Promise<void> {
  const rows = await records.read(['state_id', 'country_id']);
  if (rows.some((row) => row.state_id && !row.country_id)) throw new ValidationError('Set the country of the selected state');
  const stateIds = [...new Set(rows.map((row) => row.state_id).filter((id): id is number => typeof id === 'number'))];
  if (stateIds.length) {
    const states = new Map((await records.env.sudo().model('res.country.state').browse(stateIds).read(['country_id']))
      .map((s) => [s.id as number, s.country_id]));
    for (const row of rows) {
      if (typeof row.state_id === 'number' && row.country_id && states.get(row.state_id) !== row.country_id) {
        throw new ValidationError('The state does not belong to the selected country');
      }
    }
  }
  await checkLangField(records);
  await checkTzField(records);
}

/**
 * Keep a partner for each company / user (Odoo creates them through delegation). The partner is
 * created on the first save and its name follows the owner's name. Runs with superuser rights.
 */
function ensurePartner(model: 'res.company' | 'res.users') {
  return async (records: Recordset): Promise<void> => {
    const su = records.env.sudo();
    const owners = su.model(model).browse([...records.ids]);
    const fields = model === 'res.users' ? ['name', 'partner_id', 'lang', 'tz'] : ['name', 'partner_id'];
    const synced = model === 'res.users' ? ['name', 'lang', 'tz'] : ['name'];
    for (const row of await owners.read(fields)) {
      const partners = su.withContext({ activeTest: false }).model('res.partner');
      if (typeof row.partner_id !== 'number') {
        const values: Row = { name: row.name, company_type: model === 'res.company' ? 'company' : 'person' };
        if (model === 'res.users') Object.assign(values, { lang: row.lang || null, tz: row.tz || null });
        const created = await partners.create(values);
        await su.model(model).browse(row.id as number).write({ partner_id: created.ids[0] });
        continue;
      }
      const [partner] = await partners.browse(row.partner_id).read(synced);
      const patch: Row = {};
      for (const f of synced) if (partner && (partner[f] || null) !== (row[f] || null)) patch[f] = row[f] || null;
      if (partner && Object.keys(patch).length) await partners.browse(row.partner_id).write(patch);
    }
  };
}

/** Odoo res.partner concept, plus the company / user links to their partner. */
export const partnerModels: ModelDef[] = [
  {
    name: 'res.partner', origin: 'module', module: 'base', order: 'complete_name asc, id asc', recName: 'complete_name',
    nameSearchFields: ['email', 'vat'], description: 'Contact',
    fields: {
      name: { type: 'char', required: true, index: true },
      company_type: { type: 'selection', string: 'Type', default: 'person', selection: [['person', 'Individual'], ['company', 'Company']] },
      is_company: { type: 'boolean', compute: computeIsCompany, depends: ['company_type'], store: true, readonly: true },
      parent_id: { type: 'many2one', comodel: 'res.partner', string: 'Related Company', ondelete: 'restrict', index: true },
      child_ids: { type: 'one2many', comodel: 'res.partner', inverseName: 'parent_id', string: 'Contacts' },
      parent_path: { type: 'char', index: true },
      complete_name: {
        type: 'char', compute: computeCompleteName, depends: ['name', 'is_company', 'parent_id.complete_name'], store: true, readonly: true, index: true,
      },
      commercial_partner_id: {
        type: 'many2one', comodel: 'res.partner', compute: computeCommercial, store: true, readonly: true, index: true,
        depends: ['is_company', 'parent_id.commercial_partner_id'], string: 'Commercial Entity',
      },
      type: {
        type: 'selection', string: 'Address Type', default: 'contact',
        selection: [['contact', 'Contact'], ['invoice', 'Invoice Address'], ['delivery', 'Delivery Address'], ['other', 'Other Address']],
      },
      street: { type: 'char' },
      street2: { type: 'char' },
      city: { type: 'char' },
      zip: { type: 'char' },
      state_id: { type: 'many2one', comodel: 'res.country.state', string: 'State', ondelete: 'restrict' },
      country_id: { type: 'many2one', comodel: 'res.country', string: 'Country', ondelete: 'restrict' },
      email: { type: 'char' },
      phone: { type: 'char' },
      vat: { type: 'char', string: 'Tax ID', index: true },
      company_id: { type: 'many2one', comodel: 'res.company', string: 'Company', ondelete: 'restrict', index: true },
      lang: { type: 'char', string: 'Language' },
      tz: { type: 'char', string: 'Timezone' },
      active: { type: 'boolean', default: true },
      user_ids: { type: 'one2many', comodel: 'res.users', inverseName: 'partner_id', string: 'Users' },
      owner_company_ids: { type: 'one2many', comodel: 'res.company', inverseName: 'partner_id', string: 'Companies' },
    },
    constraints: [{ name: 'res_partner_valid', check: checkPartners, fields: ['state_id', 'country_id', 'lang', 'tz'] }],
  },
  {
    name: 'res.company', extends: ['res.company'], origin: 'module', module: 'base',
    fields: {
      partner_id: { type: 'many2one', comodel: 'res.partner', string: 'Partner', ondelete: 'restrict' },
      currency_id: { type: 'many2one', comodel: 'res.currency', string: 'Currency', ondelete: 'restrict' },
    },
    constraints: [{ name: 'res_company_partner', check: ensurePartner('res.company'), fields: ['name', 'partner_id'] }],
  },
  {
    name: 'res.users', extends: ['res.users'], origin: 'module', module: 'base',
    fields: {
      partner_id: { type: 'many2one', comodel: 'res.partner', string: 'Related Partner', ondelete: 'restrict', writeGroups: [ACCESS_MANAGER] },
      lang: { type: 'char', string: 'Language', default: 'en_US' },
      tz: { type: 'char', string: 'Timezone' },
    },
    constraints: [
      { name: 'res_users_partner', check: ensurePartner('res.users'), fields: ['name', 'partner_id', 'lang', 'tz'] },
      { name: 'res_users_lang', check: async (records) => { await checkLangField(records); await checkTzField(records); }, fields: ['lang', 'tz'] },
    ],
  },
];

export const partnerAccess: AccessRule[] = [
  { model: 'res.partner', group: 'base.group_user', perms: { read: true, write: true, create: true, unlink: false } },
  { model: 'res.partner', group: SYSTEM, perms: all },
];

export const partnerRules: RecordRule[] = [
  // multi-company: shared partners (no company) or partners of the active companies (global rule)
  {
    name: 'res_partner_company', model: 'res.partner', groups: [], perms: all,
    domain: ['|', ['company_id', '=', false], ['company_id', 'in', { $ctx: 'company_ids' } as never]],
  },
  // partners of users and companies carry identity data: only access managers / admins may change them
  {
    name: 'res_partner_user_unlinked', model: 'res.partner', groups: ['base.group_user'],
    perms: { read: false, write: true, create: false, unlink: true },
    domain: [['user_ids', 'not any', []], ['owner_company_ids', 'not any', []]],
  },
  {
    name: 'res_partner_manager_all', model: 'res.partner', groups: [ACCESS_MANAGER, SYSTEM],
    perms: { read: false, write: true, create: false, unlink: true }, domain: [],
  },
];
