import { ValidationError, type DataRecord, type Env, type ModelDef, type Recordset } from '../contracts/index.js';
import { roundMonetary } from '../orm/decimal.js';
import { precisionDigits } from '../orm/expr-helpers.js';
import { CURRENCIES_CSV, ACTIVE_CURRENCIES, DECIMAL_PRECISIONS } from './data/currencies.js';

/** Currency-like value accepted by the helpers: a record id or anything carrying `rounding`. */
export type CurrencyRef = number | { rounding: number };

/** Today's date (YYYY-MM-DD) in the time zone of the context (UTC when unset or unknown). */
export function contextToday(env: Env): string {
  const tz = typeof env.context.tz === 'string' && env.context.tz ? env.context.tz : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const decimalPlaces = async (records: Recordset) => new Map((await records.read(['rounding'])).map((row) => {
  const rounding = Number(row.rounding);
  const places = rounding > 0 && rounding < 1 ? Math.max(0, Math.ceil(-Math.log10(rounding) - 1e-9)) : 0;
  return [row.id as number, places];
}));

async function checkCurrencies(records: Recordset): Promise<void> {
  for (const row of await records.read(['name', 'rounding'])) {
    if (!/^[A-Z]{3}$/.test(String(row.name))) throw new ValidationError('Currency code must be three upper-case letters (ISO 4217)');
    const rounding = Number(row.rounding);
    if (!Number.isFinite(rounding) || rounding <= 0) throw new ValidationError('Currency rounding must be positive');
  }
}

async function checkRates(records: Recordset): Promise<void> {
  const su = records.env.sudo().model('res.currency.rate');
  for (const row of await su.browse([...records.ids]).read(['name', 'rate', 'currency_id', 'company_id'])) {
    if (!(Number(row.rate) > 0)) throw new ValidationError('Currency rate must be positive');
    const company = row.company_id ?? false;
    const dupes = await su.searchCount([
      ['id', '!=', row.id], ['currency_id', '=', row.currency_id], ['name', '=', row.name], ['company_id', '=', company],
    ]);
    if (dupes) throw new ValidationError('Only one rate per currency, date and company is allowed');
  }
}

/** Odoo res.currency / res.currency.rate / decimal.precision concepts. */
export const currencyModels: ModelDef[] = [
  {
    name: 'res.currency', origin: 'module', module: 'base', order: 'active desc, name asc', description: 'Currency',
    fields: {
      name: { type: 'char', required: true, unique: true, string: 'Currency', help: 'ISO 4217 code' },
      full_name: { type: 'char', string: 'Name' },
      symbol: { type: 'char', required: true },
      rounding: { type: 'float', required: true, default: 0.01, string: 'Rounding Factor' },
      decimal_places: { type: 'integer', compute: decimalPlaces, depends: ['rounding'], store: true, readonly: true },
      position: { type: 'selection', required: true, default: 'before', selection: [['before', 'Before Amount'], ['after', 'After Amount']] },
      rate_ids: { type: 'one2many', comodel: 'res.currency.rate', inverseName: 'currency_id', string: 'Rates' },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'res_currency_valid', check: checkCurrencies, fields: ['name', 'rounding'] }],
  },
  {
    name: 'res.currency.rate', origin: 'module', module: 'base', order: 'name desc, id desc', description: 'Currency Rate',
    fields: {
      name: { type: 'date', required: true, string: 'Date', default: (env: Env) => contextToday(env) },
      rate: { type: 'float', required: true, default: 1, help: 'Units of this currency per unit of the reference currency (rate 1)' },
      currency_id: { type: 'many2one', comodel: 'res.currency', required: true, ondelete: 'cascade', index: true },
      company_id: { type: 'many2one', comodel: 'res.company', ondelete: 'cascade' },
    },
    constraints: [{ name: 'res_currency_rate_valid', check: checkRates }],
  },
  {
    name: 'decimal.precision', origin: 'module', module: 'base', order: 'name asc', description: 'Decimal Precision',
    fields: {
      name: { type: 'char', required: true, unique: true, string: 'Usage' },
      digits: { type: 'integer', required: true, default: 2 },
    },
    constraints: [{
      name: 'decimal_precision_digits', fields: ['digits'],
      check: async (records) => {
        for (const row of await records.read(['digits'])) {
          const digits = row.digits as number;
          if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new ValidationError('Decimal precision digits must be 0 to 12');
        }
      },
    }],
  },
];

export const currencyData: DataRecord[] = [
  ...CURRENCIES_CSV.split('\n').map((line): DataRecord => {
    const [code, name, symbol, decimals, position] = line.split('|');
    return {
      xmlId: code, model: 'res.currency', noUpdate: true,
      values: {
        name: code, full_name: name, symbol, rounding: Number((10 ** -Number(decimals)).toFixed(Number(decimals))) || 1,
        position: position === 'a' ? 'after' : 'before', active: ACTIVE_CURRENCIES.has(code),
      },
    };
  }),
  ...DECIMAL_PRECISIONS.map(([xmlId, name, digits]): DataRecord => ({ xmlId, model: 'decimal.precision', values: { name, digits }, noUpdate: true })),
];

// ---------- helpers ----------

async function rounding(env: Env, currency: CurrencyRef): Promise<number> {
  if (typeof currency !== 'number') return Number(currency.rounding);
  const [row] = await env.model('res.currency').browse(currency).read(['rounding']);
  return Number(row.rounding);
}

/** Round an amount to the currency's rounding factor (ties away from zero). */
export async function currencyRound(env: Env, amount: number, currency: CurrencyRef): Promise<number> {
  return roundMonetary(amount, await rounding(env, currency));
}

/** True when the amount rounds to zero in the currency. */
export async function currencyIsZero(env: Env, amount: number, currency: CurrencyRef): Promise<boolean> {
  return (await currencyRound(env, amount, currency)) === 0;
}

/** Compare two amounts in the currency: -1, 0 or 1 after rounding their difference. */
export async function currencyCompareAmounts(env: Env, a: number, b: number, currency: CurrencyRef): Promise<-1 | 0 | 1> {
  const diff = await currencyRound(env, a - b, currency);
  return diff === 0 ? 0 : diff > 0 ? 1 : -1;
}

/**
 * Rate of a currency at `date` (default today in the context time zone): the latest rate dated on or before it, preferring
 * rates of `companyId` over shared (company-less) rates; 1 when the currency has no rate.
 * Rates are read through the caller's environment, so access rules apply.
 */
export async function currencyRate(env: Env, currencyId: number, opts: { companyId?: number | null; date?: string } = {}): Promise<number> {
  const date = opts.date ?? contextToday(env);
  const Rate = env.model('res.currency.rate');
  const scopes = opts.companyId ? [opts.companyId, false] : [false];
  for (const company of scopes) {
    const [row] = await Rate.searchRead(
      [['currency_id', '=', currencyId], ['name', '<=', date], ['company_id', '=', company]], ['rate'], { limit: 1, order: 'name desc, id desc' },
    );
    if (row) return Number(row.rate);
  }
  return 1;
}

/** Convert an amount between currencies with the rates at `date`; rounded in the target currency unless `round` is false. */
export async function currencyConvert(
  env: Env, amount: number, fromId: number, toId: number,
  opts: { companyId?: number | null; date?: string; round?: boolean } = {},
): Promise<number> {
  let value = amount;
  if (fromId !== toId) {
    const [from, to] = [await currencyRate(env, fromId, opts), await currencyRate(env, toId, opts)];
    value = amount * to / from;
  }
  return opts.round === false ? value : currencyRound(env, value, toId);
}

/** Digits of a named decimal precision (2 when it does not exist), read with superuser rights and cached per env family. */
export async function precisionGet(env: Env, name: string): Promise<number> {
  return precisionDigits(env, name);
}

/** Round a float to a number of decimal digits (ties away from zero). */
export function roundDigits(value: number, digits: number): number {
  if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new ValidationError('Invalid decimal precision');
  return roundMonetary(value, Number((10 ** -digits).toFixed(digits)));
}

/** Round a float with a named decimal precision (e.g. 'Product Price'). */
export async function roundPrecision(env: Env, value: number, name: string): Promise<number> {
  return roundDigits(value, await precisionGet(env, name));
}
