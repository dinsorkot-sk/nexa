import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@nexa/meta';
import { formatFieldDisplay, type DisplayContext } from '../src/render/display';

const field = (type: FieldDefinition['type'], options: Partial<FieldDefinition['options']> = {}): FieldDefinition => ({
  id: 'f', entityId: 'e', name: 'f', label: 'F', type, position: 0,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...options },
});
const th: DisplayContext = { locale: 'th', yes: 'ใช่', no: 'ไม่ใช่', empty: '—' };
const en: DisplayContext = { locale: 'en', yes: 'Yes', no: 'No', empty: '—' };

describe('formatFieldDisplay', () => {
  it('shows the empty text for absent values', () => {
    for (const v of [null, undefined, '']) expect(formatFieldDisplay(field('text'), v, th)).toBe('—');
    expect(formatFieldDisplay(field('boolean'), false, th)).toBe('ไม่ใช่');
    expect(formatFieldDisplay(field('number'), 0, th)).toBe('0');
  });

  it('localises booleans through the caller-supplied words', () => {
    expect(formatFieldDisplay(field('boolean'), true, th)).toBe('ใช่');
    expect(formatFieldDisplay(field('boolean'), true, en)).toBe('Yes');
  });

  it('shows dates with the Buddhist year in Thai and the Gregorian year in English', () => {
    expect(formatFieldDisplay(field('date'), '2026-10-11', th)).toBe('11 ตุลาคม 2569');
    expect(formatFieldDisplay(field('date'), '2026-10-11', en)).toBe('October 11, 2026');
  });

  it('does not shift a date across the date line whatever the machine timezone', () => {
    expect(formatFieldDisplay(field('date'), '2026-01-01', en)).toBe('January 1, 2026');
    expect(formatFieldDisplay(field('date'), '2026-12-31', en)).toBe('December 31, 2026');
  });

  it('falls back to the raw text for an impossible date instead of hiding it', () => {
    expect(formatFieldDisplay(field('date'), '2026-02-30', en)).toBe('2026-02-30');
  });

  it('formats numbers, currency and percentages by locale and precision', () => {
    expect(formatFieldDisplay(field('number'), 1234567.5, en)).toBe('1,234,567.5');
    expect(formatFieldDisplay(field('decimal', { precision: 2 }), 3, en)).toBe('3.00');
    expect(formatFieldDisplay(field('integer'), 1500, en)).toBe('1,500');
    expect(formatFieldDisplay(field('currency'), 1234.5, { ...th, currency: 'THB' })).toBe('฿1,234.50');
    expect(formatFieldDisplay(field('currency'), 1234.5, { ...en, currency: 'USD' })).toBe('$1,234.50');
    expect(formatFieldDisplay(field('percentage'), 12.5, en)).toBe('12.5%');
  });

  it('shows a non-finite number as text rather than NaN formatting', () => {
    expect(formatFieldDisplay(field('number'), Number.POSITIVE_INFINITY, en)).toBe('Infinity');
    expect(formatFieldDisplay(field('number'), 'abc', en)).toBe('abc');
  });

  it('resolves select and multiSelect labels, keeping unknown values visible', () => {
    const choices = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
    expect(formatFieldDisplay(field('select', { choices }), 'a', en)).toBe('Alpha');
    expect(formatFieldDisplay(field('select', { choices }), 'zzz', en)).toBe('zzz');
    expect(formatFieldDisplay(field('multiSelect', { choices }), ['a', 'b', 'q'], en)).toBe('Alpha Beta q');
  });

  it('shows the label of a reference, or its id when there is none', () => {
    const referenceLabel = (id: string) => (id === 'id-1' ? 'Alice' : undefined);
    expect(formatFieldDisplay(field('reference'), 'id-1', { ...en, referenceLabel })).toBe('Alice');
    expect(formatFieldDisplay(field('reference'), 'id-9', { ...en, referenceLabel })).toBe('id-9');
    expect(formatFieldDisplay(field('reference'), 'id-9', en)).toBe('id-9');
  });

  it('does not truncate a reference id to 8 characters', () => {
    expect(formatFieldDisplay(field('reference'), 'record_abcdefghij', en)).toBe('record_abcdefghij');
  });

  it('renders json compactly', () => {
    expect(formatFieldDisplay(field('json'), { a: 1 }, en)).toBe('{"a":1}');
  });
});
