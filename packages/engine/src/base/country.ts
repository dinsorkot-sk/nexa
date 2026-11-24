import { ValidationError, type DataRecord, type ModelDef } from '../contracts/index.js';
import { COUNTRIES_CSV, EU_MEMBERS, US_STATES_CSV } from './data/countries.js';

/** Odoo res.country / res.country.state / res.country.group concepts. */
export const countryModels: ModelDef[] = [
  {
    name: 'res.country', origin: 'module', module: 'base', order: 'name asc', description: 'Country',
    fields: {
      name: { type: 'char', required: true, translate: true, string: 'Country Name' },
      code: { type: 'char', required: true, unique: true, string: 'Country Code', help: 'ISO 3166-1 alpha-2' },
      phone_code: { type: 'integer', string: 'Country Calling Code' },
      currency_id: { type: 'many2one', comodel: 'res.currency', ondelete: 'set null' },
      state_ids: { type: 'one2many', comodel: 'res.country.state', inverseName: 'country_id', string: 'States' },
      country_group_ids: {
        type: 'many2many', comodel: 'res.country.group', string: 'Country Groups',
        relationTable: 'res_country_res_country_group_rel', column1: 'res_country_id', column2: 'res_country_group_id',
      },
    },
    constraints: [{
      name: 'res_country_code', fields: ['code'],
      check: async (records) => {
        for (const row of await records.read(['code'])) {
          if (!/^[A-Z]{2}$/.test(String(row.code))) throw new ValidationError('Country code must be two upper-case letters (ISO 3166-1)');
        }
      },
    }],
  },
  {
    name: 'res.country.state', origin: 'module', module: 'base', order: 'country_id asc, name asc', description: 'Country State',
    fields: {
      country_id: { type: 'many2one', comodel: 'res.country', required: true, ondelete: 'cascade', index: true },
      name: { type: 'char', required: true, string: 'State Name' },
      code: { type: 'char', required: true, string: 'State Code' },
    },
    constraints: [{ name: 'res_country_state_code_uniq', sql: 'UNIQUE(country_id, code)' }],
  },
  {
    name: 'res.country.group', origin: 'module', module: 'base', order: 'name asc', description: 'Country Group',
    fields: {
      name: { type: 'char', required: true, translate: true },
      country_ids: {
        type: 'many2many', comodel: 'res.country', string: 'Countries',
        relationTable: 'res_country_res_country_group_rel', column1: 'res_country_group_id', column2: 'res_country_id',
      },
    },
  },
];

export const countryData: DataRecord[] = [
  ...COUNTRIES_CSV.split('\n').map((line): DataRecord => {
    const [code, name, phone, currency] = line.split('|');
    return {
      xmlId: code.toLowerCase(), model: 'res.country', noUpdate: true,
      values: { code, name, phone_code: phone ? Number(phone) : null, currency_id: currency ? { ref: currency } : null },
    };
  }),
  {
    xmlId: 'europe', model: 'res.country.group', noUpdate: true,
    values: { name: 'European Union', country_ids: EU_MEMBERS.map((code) => ({ ref: code.toLowerCase() })) },
  },
  ...US_STATES_CSV.split('\n').map((line): DataRecord => {
    const [code, name] = line.split('|');
    return { xmlId: `state_us_${code.toLowerCase()}`, model: 'res.country.state', noUpdate: true, values: { country_id: { ref: 'us' }, code, name } };
  }),
];
