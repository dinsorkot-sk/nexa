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

/** Deterministic built-in helpers for portable expressions; application callbacks may override them. */
export function createExpressionHelpers(extra: Partial<ExprEnvironment> = {}): ExprEnvironment {
  return {
    round: (value: ExprValue, places?: ExprValue) => roundPlaces(value, places),
    currency: (value: ExprValue, places: ExprValue = 2) => roundPlaces(value, places),
    float: (value: ExprValue, places: ExprValue = 6) => roundPlaces(value, places),
    uom: (value: ExprValue, rounding: ExprValue = 1) => roundIncrement(value, rounding),
    date: (value: ExprValue) => isoDate(value),
    abs: (value: ExprValue) => Math.abs(finite(value)),
    ...extra,
  };
}
