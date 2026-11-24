import { roundMonetary } from '../orm/decimal.js';
import type { ExprEnvironment, ExprValue } from './types.js';

function finite(value: ExprValue): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new TypeError('Expected a finite numeric value');
  return number;
}

function roundPlaces(value: ExprValue, places: ExprValue = 0): number {
  const digits = finite(places);
  if (!Number.isInteger(digits) || digits < -12 || digits > 12) throw new RangeError('Rounding precision must be an integer from -12 to 12');
  const factor = 10 ** digits;
  return Math.round((finite(value) + Number.EPSILON) * factor) / factor;
}

function roundIncrement(value: ExprValue, increment: ExprValue = 1): number {
  const step = finite(increment);
  if (step <= 0) throw new RangeError('Rounding increment must be positive');
  return Math.round(finite(value) / step) * step;
}

function isoDate(value: ExprValue): string {
  if (typeof value !== 'string') throw new TypeError('Date helper expects an ISO date string');
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new TypeError('Invalid ISO date');
  return date.toISOString().slice(0, 10);
}

/** Decimal digits 0..12 given as a number (named precisions are resolved by the ORM helpers). */
export function precisionDigits(value: ExprValue): number {
  if (typeof value === 'string') throw new TypeError('Named precision is not available in this expression context');
  const digits = finite(value);
  if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new RangeError('Precision digits must be an integer from 0 to 12');
  return digits;
}

/** Round to `digits` decimals with exact decimal ties away from zero. */
export function floatRound(value: ExprValue, digits: number): number {
  return roundMonetary(finite(value), Number((10 ** -digits).toFixed(digits)));
}

/** -1, 0 or 1 comparing two values after rounding their difference to `digits`. */
export function floatCompare(a: ExprValue, b: ExprValue, digits: number): number {
  const diff = floatRound(finite(a) - finite(b), digits);
  return diff === 0 ? 0 : diff > 0 ? 1 : -1;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})((?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?)?)$/;

/** Add whole days or months to an ISO date (time suffix of a datetime is kept); months clamp to month end. */
export function dateAdd(value: ExprValue, amount: ExprValue, unit: 'days' | 'months'): string {
  if (typeof value !== 'string' || value.length > 40) throw new TypeError('Date helper expects an ISO date string');
  const match = DATE_RE.exec(value);
  if (!match) throw new TypeError('Invalid ISO date');
  const count = finite(amount);
  if (!Number.isInteger(count) || Math.abs(count) > 1_000_000) throw new RangeError('Date offset must be an integer');
  const [, y, m, d, rest] = match;
  const base = isoDate(`${y}-${m}-${d}`);
  const date = new Date(`${base}T00:00:00.000Z`);
  if (unit === 'days') date.setUTCDate(date.getUTCDate() + count);
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + count);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new RangeError('Date out of range');
  return date.toISOString().slice(0, 10) + rest;
}

/** Deterministic built-in helpers for portable expressions; application callbacks may override them. */
export function createExpressionHelpers(extra: Partial<ExprEnvironment> = {}): ExprEnvironment {
  return {
    round: (value: ExprValue, places?: ExprValue) => roundPlaces(value, places),
    currency: (value: ExprValue, places: ExprValue = 2) => roundPlaces(value, places),
    float: (value: ExprValue, places: ExprValue = 6) => roundPlaces(value, places),
    uom: (value: ExprValue, rounding: ExprValue = 1) => roundIncrement(value, rounding),
    date: (value: ExprValue) => isoDate(value),
    abs: (value: ExprValue) => Math.abs(finite(value)),
    float_round: (value: ExprValue, digits: ExprValue = 2) => floatRound(value, precisionDigits(digits)),
    float_compare: (a: ExprValue, b: ExprValue, digits: ExprValue = 2) => floatCompare(a, b, precisionDigits(digits)),
    float_is_zero: (value: ExprValue, digits: ExprValue = 2) => floatRound(value, precisionDigits(digits)) === 0,
    date_add_days: (value: ExprValue, days: ExprValue) => dateAdd(value, days, 'days'),
    date_add_months: (value: ExprValue, months: ExprValue) => dateAdd(value, months, 'months'),
    ...extra,
  };
}
