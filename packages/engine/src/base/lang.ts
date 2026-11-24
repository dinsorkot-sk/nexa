import { ValidationError, type DataRecord, type Env, type ModelDef, type Recordset } from '../contracts/index.js';
import { LANGS_CSV } from './data/langs.js';

const LANG_CODE = /^[A-Za-z]{2,3}(_[A-Za-z0-9]{2,4})?$/;

async function checkLangs(records: Recordset): Promise<void> {
  const rows = await records.read(['code', 'active', 'decimal_point', 'thousands_sep']);
  for (const row of rows) {
    if (!LANG_CODE.test(String(row.code))) throw new ValidationError(`Invalid language code '${String(row.code)}'`);
    if (!row.decimal_point || row.decimal_point === row.thousands_sep) throw new ValidationError('Decimal and thousands separators must differ');
  }
  if (rows.some((row) => row.code === 'en_US' && !row.active)) throw new ValidationError('English (US) is the fallback language and cannot be deactivated');
  const inactive = rows.filter((row) => !row.active).map((row) => String(row.code));
  if (inactive.length) {
    const su = records.env.sudo().withContext({ activeTest: false });
    for (const model of ['res.users', 'res.partner']) {
      if (await su.model(model).searchCount([['lang', 'in', inactive]])) {
        throw new ValidationError(`Cannot deactivate a language still used by ${model === 'res.users' ? 'users' : 'contacts'}`);
      }
    }
  }
}

/** Odoo res.lang concept: installable languages and their formatting conventions. */
export const langModels: ModelDef[] = [{
  name: 'res.lang', origin: 'module', module: 'base', order: 'active desc, name asc', description: 'Language',
  fields: {
    name: { type: 'char', required: true, unique: true },
    code: { type: 'char', required: true, unique: true, string: 'Locale Code' },
    iso_code: { type: 'char', string: 'ISO code' },
    active: { type: 'boolean', default: false },
    direction: { type: 'selection', required: true, default: 'ltr', selection: [['ltr', 'Left-to-Right'], ['rtl', 'Right-to-Left']] },
    date_format: { type: 'char', required: true, default: '%m/%d/%Y' },
    time_format: { type: 'char', required: true, default: '%H:%M:%S' },
    decimal_point: { type: 'char', required: true, default: '.' },
    thousands_sep: { type: 'char', default: ',', string: 'Thousands Separator' },
    week_start: {
      type: 'selection', required: true, default: '7',
      selection: [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['7', 'Sunday']],
    },
  },
  constraints: [{ name: 'res_lang_valid', check: checkLangs }],
  methods: {
    /** Activate the languages (write access to res.lang required). */
    action_activate: async (records: Recordset) => { await records.write({ active: true }); return true; },
    action_archive: async (records: Recordset) => { await records.write({ active: false }); return true; },
  },
}];

export const langData: DataRecord[] = LANGS_CSV.split('\n').map((line): DataRecord => {
  const [code, iso, name, direction, dateFormat, timeFormat, decimalPoint, thousands, weekStart] = line.split('|');
  return {
    xmlId: `lang_${code}`, model: 'res.lang', noUpdate: true,
    values: {
      code, iso_code: iso, name, direction, date_format: dateFormat, time_format: timeFormat,
      decimal_point: decimalPoint, thousands_sep: thousands, week_start: weekStart, active: code === 'en_US',
    },
  };
});

/** Activate a language by code; returns false when no such language exists. */
export async function activateLang(env: Env, code: string): Promise<boolean> {
  const langs = await env.model('res.lang').search([['code', '=', code], ['active', 'in', [true, false]]]);
  if (!langs.ids.length) return false;
  await langs.write({ active: true });
  return true;
}

/** Codes of the active languages (read with superuser rights; language lists are public metadata). */
export async function activeLangCodes(env: Env): Promise<string[]> {
  return (await env.sudo().model('res.lang').searchRead([['active', '=', true]], ['code'])).map((row) => String(row.code));
}

/** Validate that a `lang` value (when set) is an active language. */
export async function checkLangField(records: Recordset, field = 'lang'): Promise<void> {
  const values = (await records.read([field])).map((row) => row[field]).filter((v): v is string => typeof v === 'string' && v !== '');
  if (!values.length) return;
  const active = new Set(await activeLangCodes(records.env));
  for (const value of values) if (!active.has(value)) throw new ValidationError(`Language '${value}' is not active`);
}

/** Validate that a `tz` value (when set) is an IANA time zone known to the runtime. */
export async function checkTzField(records: Recordset, field = 'tz'): Promise<void> {
  for (const row of await records.read([field])) {
    const tz = row[field];
    if (typeof tz !== 'string' || tz === '') continue;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { throw new ValidationError(`Unknown time zone '${tz}'`); }
  }
}

/**
 * Environment carrying the user's language and time zone preferences (res.users.lang / tz) in its
 * context. Values already present in the context (e.g. an explicit request language) win.
 */
export async function withUserContext(env: Env): Promise<Env> {
  const users = env.sudo().model('res.users');
  if (!(await users.search([['id', '=', env.uid], ['active', 'in', [true, false]]])).ids.length) return env;
  const [user] = await users.browse(env.uid).read(['lang', 'tz']);
  const patch: Record<string, unknown> = {};
  if (env.context.lang === undefined && typeof user.lang === 'string' && user.lang) patch.lang = user.lang;
  if (env.context.tz === undefined && typeof user.tz === 'string' && user.tz) patch.tz = user.tz;
  return Object.keys(patch).length ? env.withContext(patch) : env;
}
