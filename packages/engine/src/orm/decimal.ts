import { ValidationError } from '../contracts/index.js';

/** Round a finite JS input to the nearest decimal increment, with ties away from zero. */
export function roundMonetary(value: number, increment: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) throw new ValidationError('Invalid monetary value or currency rounding');
  const parts = (n: number): { digits: bigint; scale: number } => {
    const [mantissa, exponent = '0'] = Math.abs(n).toString().toLowerCase().split('e');
    const [integer, fraction = ''] = mantissa.split('.');
    return { digits: BigInt(integer + fraction), scale: fraction.length - Number(exponent) };
  };
  const a = parts(value);
  const b = parts(increment);
  const scale = Math.max(0, a.scale, b.scale);
  const number = a.digits * 10n ** BigInt(scale - a.scale);
  const step = b.digits * 10n ** BigInt(scale - b.scale);
  let count = number / step;
  if (number % step * 2n >= step) count++;
  const raw = (count * step).toString().padStart(scale + 1, '0');
  const decimal = scale ? `${raw.slice(0, -scale)}.${raw.slice(-scale)}` : raw;
  const result = Number((value < 0 ? '-' : '') + decimal);
  if (!Number.isFinite(result)) throw new ValidationError('Rounded monetary value is outside the supported range');
  return result;
}
