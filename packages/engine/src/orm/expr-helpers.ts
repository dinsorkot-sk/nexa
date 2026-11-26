import { ValidationError, type Env, type FieldDef } from '../contracts/index.js';
import {
  evaluateExpressionAsync, isHelperName, reserveHelperName, type AsyncExprHelper, type ExprEnvironment, type ExprValue,
} from '../expr/index.js';
import { floatCompare, floatPrecision, floatRound } from '../expr/helpers.js';
import { roundMonetary } from './decimal.js';
import type { EnvImpl } from './env.js';
import { expressionContext } from './compute.js';

/**
 * NX-Expr helper extension point for ORM-evaluated expressions (compute, default, constraint,
 * onchange, server actions). Helpers that need data are async and run through
 * evaluateExpressionAsync's bounded replay; they always use the CALLER's env (never sudo),
 * except decimal precisions, which are configuration read with superuser rights.
 */

export const DEFAULT_PRECISION_DIGITS = 2;

/** A helper with side effects was called in a read-only evaluation (computed field, preview, guard). */
export class SideEffectRefusedError extends ValidationError {}

/** Digits of a named decimal.precision, cached in the env family's record cache. */
export async function precisionDigits(env: Env, name: string): Promise<number> {
  const impl = env as EnvImpl;
  const key = `decimal.precision:${name}`;
  const memo = impl.cache.memo;
  if (memo.has(key)) return memo.get(key) as number;
  let digits = DEFAULT_PRECISION_DIGITS;
  if (impl.registry.models.has('decimal.precision')) {
    const [row] = await env.sudo().model('decimal.precision').searchRead([['name', '=', name]], ['digits'], { limit: 1 });
    const value = Number(row?.digits);
    if (row && Number.isInteger(value) && value >= 0 && value <= 12) digits = value;
  }
  memo.set(key, digits);
  return digits;
}

/** Digits a float field reports/rounds to: the scale of a pair, the named precision's digits, or undefined. */
export async function fieldDigits(env: Env, field: FieldDef): Promise<readonly [number, number] | undefined> {
  if (typeof field.digits === 'string') return [16, await precisionDigits(env, field.digits)];
  return field.digits;
}

const NUMERIC_TEXT = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i;

/** Round one value of a named-precision float; numeric strings are accepted (import/RPC). */
export async function roundFieldValue(env: Env, field: FieldDef, name: string, value: unknown): Promise<unknown> {
  if (value === null || value === undefined || value === false || typeof field.digits !== 'string') return value;
  const number = typeof value === 'string' && NUMERIC_TEXT.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) throw new ValidationError(`Field '${name}' requires a number`);
  const digits = await precisionDigits(env, field.digits);
  return roundMonetary(number, Number((10 ** -digits).toFixed(digits)));
}

/** Round float values of fields declaring a named precision (create/write path). */
export async function roundNamedPrecision(env: Env, fields: ReadonlyMap<string, FieldDef>, vals: Record<string, unknown>): Promise<Record<string, unknown>> {
  let out = vals;
  for (const [name, value] of Object.entries(vals)) {
    const field = fields.get(name);
    if (!field || field.type !== 'float' || typeof field.digits !== 'string' || field.delegated) continue;
    if (value === null || value === undefined || value === false) continue;
    if (out === vals) out = { ...vals };
    out[name] = await roundFieldValue(env, field, name, value);
  }
  return out;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Numbers; an empty value (null) counts as 0 like Odoo's False. */
function num(value: ExprValue, what: string): number {
  if (value === null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${what} must be a finite number`);
  return value;
}

function recordId(value: ExprValue, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${what} must be a record id`);
  return value;
}

async function digitsArg(env: Env, value: ExprValue | undefined, rounding?: ExprValue): Promise<{ digits: number; rounding?: number }> {
  if (rounding !== undefined && rounding !== null) return floatPrecision(value, rounding);
  if (value === undefined || value === null) return { digits: DEFAULT_PRECISION_DIGITS };
  if (typeof value === 'string') {
    if (value.length > 64) throw new TypeError('Invalid precision name');
    return { digits: await precisionDigits(env, value) };
  }
  return floatPrecision(value);
}

async function currencyRounding(env: Env, value: ExprValue): Promise<number> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const rounding = (value as Record<string, ExprValue>).rounding;
    if (typeof rounding === 'number' && rounding > 0 && Number.isFinite(rounding)) return rounding;
    value = (value as Record<string, ExprValue>).id ?? null;
  }
  const id = recordId(value, 'Currency');
  if (!(env as EnvImpl).registry.models.has('res.currency')) throw new ValidationError('Currency helpers require the base currencies');
  // caller access: an unreadable currency fails like any other read
  const [row] = await env.model('res.currency').browse(id).read(['rounding']);
  const rounding = Number(row?.rounding);
  if (!(rounding > 0) || !Number.isFinite(rounding)) throw new ValidationError('Invalid currency rounding');
  return rounding;
}

async function currencyRateAt(env: Env, currencyId: number, date: string, companyId: number | null): Promise<number> {
  const scopes: (number | false)[] = companyId ? [companyId, false] : [false];
  for (const company of scopes) {
    const [row] = await env.model('res.currency.rate').searchRead(
      [['currency_id', '=', currencyId], ['name', '<=', date], ['company_id', '=', company]], ['rate'], { limit: 1, order: 'name desc, id desc' },
    );
    if (row) return Number(row.rate);
  }
  return 1;
}

/** Engine async helpers bound to the caller's env. */
function engineAsyncHelpers(env: Env, today: string, companyId: number | null): Record<string, AsyncExprHelper> {
  return {
    float_round: { resolve: async ([value, digits, rounding]) => {
      const precision = await digitsArg(env, digits, rounding);
      return floatRound(num(value ?? null, 'Value'), precision.digits, precision.rounding);
    } },
    float_compare: { resolve: async ([a, b, digits, rounding]) => {
      const precision = await digitsArg(env, digits, rounding);
      return floatCompare(num(a ?? null, 'Value'), num(b ?? null, 'Value'), precision.digits, precision.rounding);
    } },
    float_is_zero: { resolve: async ([value, digits, rounding]) => {
      const precision = await digitsArg(env, digits, rounding);
      return floatRound(num(value ?? null, 'Value'), precision.digits, precision.rounding) === 0;
    } },
    currency_round: { resolve: async ([amount, currency]) => roundMonetary(num(amount ?? null, 'Amount'), await currencyRounding(env, currency ?? null)) },
    currency_convert: {
      resolve: async ([amount, from, to, date, company]) => {
        const value = num(amount ?? null, 'Amount');
        const fromId = recordId(from ?? null, 'Source currency');
        const toId = recordId(to ?? null, 'Target currency');
        if (date !== undefined && date !== null && (typeof date !== 'string' || !DATE_ONLY.test(date.slice(0, 10)))) throw new TypeError('Conversion date must be an ISO date');
        const day = typeof date === 'string' ? date.slice(0, 10) : today;
        const parsed = new Date(`${day}T00:00:00.000Z`);
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw new TypeError('Conversion date must be a valid calendar date');
        const companyRef = company === undefined || company === null ? companyId : recordId(company, 'Company');
        if (!(env as EnvImpl).registry.models.has('res.currency.rate')) throw new ValidationError('Currency helpers require the base currencies');
        let converted = value;
        if (fromId !== toId) converted = value * await currencyRateAt(env, toId, day, companyRef) / await currencyRateAt(env, fromId, day, companyRef);
        return roundMonetary(converted, await currencyRounding(env, toId));
      },
    },
  };
}

/** A helper contributed by trusted code. Exactly one of `sync` / `resolve`. */
export interface ExpressionHelperDef {
  /** Deterministic helpers (result depends only on arguments) may be used in stored computes. */
  pure?: boolean;
  sync?: (...args: ExprValue[]) => ExprValue;
  /** Runs with the caller's env; must apply that env's access rights (do not sudo for user data). */
  resolve?: (env: Env, args: ExprValue[]) => Promise<ExprValue> | ExprValue;
  /**
   * The helper changes data (for example draws a sequence number). It is unavailable in read-only
   * evaluations (computed fields), where it would run on every read.
   */
  sideEffects?: boolean;
}

const registered = new Map<string, ExpressionHelperDef>();

/**
 * Register a process-wide NX-Expr helper for ORM-evaluated expressions. Call at module load,
 * before tenant registries are built, so dependency extraction knows the name.
 */
export function registerExpressionHelper(name: string, def: ExpressionHelperDef): void {
  if (!def || (typeof def.sync === 'function') === (typeof def.resolve === 'function')) {
    throw new TypeError(`Expression helper '${name}' needs exactly one of sync or resolve`);
  }
  if (def.pure && def.resolve) throw new TypeError(`Async expression helper '${name}' cannot be pure`);
  if (def.sideEffects && (def.pure || !def.resolve)) throw new TypeError(`Expression helper '${name}' with side effects must be async and impure`);
  reserveHelperName(name, { pure: !!def.pure });
  registered.set(name, { ...def });
}

export interface EvaluateOptions {
  /** Extra call-local helpers for this evaluation only (trusted caller code). */
  helpers?: Readonly<Record<string, ExpressionHelperDef>>;
  /** Read-only evaluation (computed fields): helpers with side effects fail instead of running. */
  readOnly?: boolean;
}

/** Registered synchronous helpers (also usable by synchronous evaluators such as templates). */
export function registeredSyncHelpers(): ExprEnvironment {
  const scope: ExprEnvironment = {};
  for (const [name, def] of registered) if (def.sync) scope[name] = def.sync;
  return scope;
}

/**
 * Evaluate an NX-Expr in the ORM: `scope` (record values) + caller identity/context + all helpers.
 * Async helpers run under the caller's env through the bounded replay protocol.
 */
export async function evaluateEnvExpression(env: Env, source: string, scope: ExprEnvironment = {}, options: EvaluateOptions = {}): Promise<ExprValue> {
  const context = await expressionContext(env as EnvImpl);
  const companyId = typeof (context.company as { id?: unknown })?.id === 'number' ? (context.company as { id: number }).id : null;
  const asyncHelpers: Record<string, AsyncExprHelper> = engineAsyncHelpers(env, context.today as string, companyId);
  const local: string[] = [];
  const environment: ExprEnvironment = { ...scope, ...context };
  const add = (name: string, def: ExpressionHelperDef) => {
    if (def.resolve && def.sideEffects && options.readOnly) {
      asyncHelpers[name] = { resolve: () => { throw new SideEffectRefusedError(`Expression helper '${name}' changes data and cannot be used here`); } };
    } else if (def.resolve) { const resolve = def.resolve; asyncHelpers[name] = { resolve: (args) => resolve(env, args) }; }
    else if (def.sync) environment[name] = def.sync;
  };
  for (const [name, def] of registered) if (def.resolve) add(name, def);
  for (const [name, def] of Object.entries(options.helpers ?? {})) {
    if (isHelperName(name)) throw new TypeError(`Expression helper '${name}' is already defined`);
    if (!def || (typeof def.sync === 'function') === (typeof def.resolve === 'function')) throw new TypeError(`Expression helper '${name}' needs exactly one of sync or resolve`);
    local.push(name);
    add(name, def);
  }
  return evaluateExpressionAsync(source, environment, { asyncHelpers, helpers: local });
}
