import { describe, expect, it } from 'vitest';
import { FieldDefinition } from '@nexa/meta';
import { calendarDateToIso, isoToCalendarDate, datetimeLocalToIso, isoToDatetimeLocal } from '../src/lib/date';
import { formatFieldDisplay } from '../src/lib/display';
import { mailtoHref, safeHref, telHref } from '../src/lib/safe-url';
import { parseNumberInput, stepFor, formatDecimal } from '../src/lib/number';
import { isEditableField } from '../src/lib/format';

const field = (type: FieldDefinition['type'], options: Partial<FieldDefinition['options']> = {}): FieldDefinition => ({
  id: 'f', entityId: 'e', name: 'f', label: 'F', type, position: 0,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...options },
});

describe('safe links', () => {
  it('allows only http(s) for web links', () => {
    expect(safeHref('https://example.com/x')).toBe('https://example.com/x');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('/relative')).toBeUndefined();
    expect(safeHref('HTTPS://EXAMPLE.com')).toBe('https://example.com/');
  });

  it('refuses addresses that could carry a scheme or markup', () => {
    expect(mailtoHref('ada@example.com')).toBe('mailto:ada@example.com');
    expect(mailtoHref('a@b.c?subject=x')).toBeUndefined();
    expect(telHref('+66 81-234 5678')).toBe('tel:+66812345678');
    expect(telHref('abc')).toBeUndefined();
  });
});

describe('dates', () => {
  it('parses only real Gregorian ISO dates', () => {
    expect(isoToCalendarDate('2026-10-16')?.day).toBe(16);
    expect(isoToCalendarDate('2026-02-30')).toBeUndefined();
    expect(isoToCalendarDate('16/10/2026')).toBeUndefined();
  });

  it('round-trips a calendar date back to the stored ISO string', () => {
    const date = isoToCalendarDate('2026-10-16');
    expect(calendarDateToIso(date)).toBe('2026-10-16');
  });

  it('a datetime-local box converts to a UTC instant and back', () => {
    const iso = datetimeLocalToIso('2026-10-16T09:30');
    expect(iso).toMatch(/Z$/);
    expect(isoToDatetimeLocal(iso)).toBe('2026-10-16T09:30');
    expect(datetimeLocalToIso('2026-10-16')).toBeUndefined();
  });
});

describe('numbers', () => {
  it('parses partial input to undefined and rounds to precision', () => {
    expect(parseNumberInput('')).toBeUndefined();
    expect(parseNumberInput('-')).toBeUndefined();
    expect(parseNumberInput('1.005', 2)).toBe(1.01);
  });

  it('step follows precision and formatting keeps decimals', () => {
    expect(stepFor(undefined)).toBe('any');
    expect(stepFor(0)).toBe(1);
    expect(stepFor(2)).toBe(0.01);
    expect(formatDecimal(12, 2)).toBe('12.00');
  });
});

describe('display text', () => {
  it('formats dates in the Buddhist era under th and Gregorian under en', () => {
    const f = field('date');
    expect(formatFieldDisplay(f, '2026-10-16', { locale: 'en' })).toContain('2026');
    expect(formatFieldDisplay(f, '2026-10-16', { locale: 'th' })).toContain('2569');
  });

  it('shows labels for select and references, and the id when no label is known', () => {
    const select = field('select', { choices: [{ value: 'a', label: 'Alpha' }] });
    expect(formatFieldDisplay(select, 'a', { locale: 'en' })).toBe('Alpha');
    expect(formatFieldDisplay(field('reference'), 'u-1', { locale: 'en', referenceLabel: () => 'Ada' })).toBe('Ada');
    expect(formatFieldDisplay(field('reference'), 'u-2', { locale: 'en' })).toBe('u-2');
  });

  it('shows the empty text for a missing value', () => {
    expect(formatFieldDisplay(field('text'), null, { locale: 'en', empty: '—' })).toBe('—');
  });
});

describe('writable fields', () => {
  it('system-generated and read-only fields are not editable', () => {
    expect(isEditableField(field('text'))).toBe(true);
    expect(isEditableField(field('text', { readonly: true }))).toBe(false);
    expect(isEditableField(field('formula'))).toBe(false);
    expect(isEditableField(field('autoNumber'))).toBe(false);
  });
});
