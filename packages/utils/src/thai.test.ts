import { describe, it, expect } from 'vitest';
import { toBuddhistYear, formatThaiNumber, formatThaiCurrency, vatCalc, whtCalc, formatThaiDate } from './thai';

describe('thai utils', () => {
  it('toBuddhistYear adds 543', () => {
    expect(toBuddhistYear(new Date('2024-01-01'))).toBe(2567);
  });

  it('formatThaiNumber', () => {
    expect(formatThaiNumber(1234.5, 2)).toContain('1,234.50');
  });

  it('formatThaiCurrency', () => {
    expect(formatThaiCurrency(100)).toContain('บาท');
  });

  it('vatCalc 7%', () => {
    const r = vatCalc(100, 7);
    expect(r.vat).toBe(7);
    expect(r.total).toBe(107);
  });

  it('whtCalc', () => {
    const r = whtCalc(100, 3);
    expect(r.wht).toBe(3);
    expect(r.total).toBe(97);
  });

  it('formatThaiDate', () => {
    expect(formatThaiDate('2024-01-15')).toContain('2567');
  });
});