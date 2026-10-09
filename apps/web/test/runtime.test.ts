import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@nexa/meta';
import { csvRowToRecordData, defaultSortField, defaultViewColumns } from '../app/utils/runtime';

function field(partial: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: partial.id ?? partial.name!,
    entityId: 'entity',
    name: partial.name!,
    label: partial.label ?? partial.name!,
    type: partial.type ?? 'text',
    options: partial.options ?? {},
    position: partial.position ?? 0,
  } as FieldDefinition;
}

const fields: FieldDefinition[] = [
  field({ id: 'f-b', name: 'notes', label: 'Notes', type: 'longText', position: 2 }),
  field({ id: 'f-a', name: 'title', label: 'Title', type: 'text', position: 1 }),
  field({ id: 'f-hidden', name: 'secret', label: 'Secret', type: 'text', options: { hidden: true }, position: 0 }),
];

describe('runtime helpers', () => {
  it('orders view columns by position and drops hidden fields, staying stable', () => {
    expect(defaultViewColumns(fields).map((f) => f.id)).toEqual(['f-a', 'f-b']);
    expect(defaultViewColumns(fields)).not.toContain(fields[2]);
    const hiddenFirst = [
      field({ id: 'z', name: 'zeta', position: 0, options: { hidden: true } }),
      field({ id: 'a', name: 'alpha', position: 1 }),
    ];
    expect(defaultViewColumns(hiddenFirst).map((f) => f.id)).toEqual(['a']);
    const tied = [
      field({ id: 'x1', name: 'x1', position: 1 }),
      field({ id: 'x0', name: 'x0', position: 0 }),
      field({ id: 'x2', name: 'x2', position: 1 }),
    ];
    expect(defaultViewColumns(tied).map((f) => f.id)).toEqual(['x0', 'x1', 'x2']);
    expect(defaultViewColumns(fields)).not.toContain(fields[2]);
  });

  it('prefers a unique visible field for the default sort', () => {
    const withUnique = [
      ...fields,
      field({ id: 'f-unique-hidden', name: 'code', type: 'integer', options: { unique: true, hidden: true }, position: 3 }),
      field({ id: 'f-unique', name: 'sku', type: 'text', options: { unique: true }, position: 4 }),
    ];
    expect(defaultSortField(withUnique)?.id).toBe('f-unique');
  });

  it('falls back to the first sortable non-computed field, or undefined', () => {
    expect(defaultSortField(fields)?.id).toBe('f-a');
    const allComputed = [
      field({ id: 'm', name: 'tags', type: 'multiSelect', position: 0 }),
      field({ id: 'j', name: 'payload', type: 'json', position: 1 }),
      field({ id: 'x', name: 'fx', type: 'formula', position: 2 }),
    ];
    expect(defaultSortField(allComputed)).toBeUndefined();
    expect(defaultSortField([])).toBeUndefined();
  });

  it('coerces CSV cells to field types keyed by field id', () => {
    const schema = [
      field({ id: 'n', name: 'count', type: 'integer' }),
      field({ id: 'd', name: 'price', type: 'decimal' }),
      field({ id: 'b', name: 'active', type: 'boolean' }),
      field({ id: 't', name: 'title', type: 'text' }),
      field({ id: 'cur', name: 'amount', type: 'currency' }),
      field({ id: 'pct', name: 'rate', type: 'percentage' }),
    ];
    const result = csvRowToRecordData(schema, ['COUNT', 'price', 'active', 'title', 'amount', 'rate'], ['42', '19.5', 'true', 'Widget', '5', '0.25']);
    expect(result.data).toEqual({ n: 42, d: 19.5, b: true, t: 'Widget', cur: 5, pct: 0.25 });
    expect(result.skipped).toEqual([]);
  });

  it('parses booleans case-insensitively including 1/0 and yes/no', () => {
    const schema = [field({ id: 'b', name: 'active', type: 'boolean' })];
    expect(csvRowToRecordData(schema, ['active'], ['TRUE']).data).toEqual({ b: true });
    expect(csvRowToRecordData(schema, ['active'], ['1']).data).toEqual({ b: true });
    expect(csvRowToRecordData(schema, ['active'], ['yes']).data).toEqual({ b: true });
    expect(csvRowToRecordData(schema, ['active'], ['0']).data).toEqual({ b: false });
    expect(csvRowToRecordData(schema, ['active'], ['no']).data).toEqual({ b: false });
    expect(csvRowToRecordData(schema, ['active'], ['other']).data).toEqual({ b: false });
  });

  it('skips computed, hidden, readonly and unknown headers', () => {
    const schema = [
      field({ id: 'fx', name: 'total', type: 'formula', options: { expression: '1' } }),
      field({ id: 'hid', name: 'secret', options: { hidden: true } }),
      field({ id: 'ro', name: 'locked', options: { readonly: true } }),
      field({ id: 'auto', name: 'seq', type: 'autoNumber' }),
      field({ id: 'keep', name: 'title' }),
    ];
    const result = csvRowToRecordData(schema, ['total', 'secret', 'locked', 'seq', 'title', 'unknown'], ['1', 'x', 'y', '7', 'ok', 'zzz']);
    expect(result.data).toEqual({ keep: 'ok' });
    expect(result.skipped).toEqual(['fx', 'hid', 'ro', 'auto', 'unknown']);
  });

  it('skips empty numeric cells instead of coercing them to NaN', () => {
    const schema = [field({ id: 'n', name: 'count', type: 'integer' }), field({ id: 't', name: 'title' })];
    const result = csvRowToRecordData(schema, ['count', 'title'], ['', 'Widget']);
    expect(result.data).toEqual({ t: 'Widget' });
    expect(Object.hasOwn(result.data, 'n')).toBe(false);
  });

  it('treats missing trailing cells as absent when the row is short', () => {
    const schema = [field({ id: 'n', name: 'count', type: 'integer' }), field({ id: 't', name: 'title' })];
    const result = csvRowToRecordData(schema, ['count', 'title'], ['42']);
    expect(result.data).toEqual({ n: 42 });
    expect(Object.hasOwn(result.data, 't')).toBe(false);
  });
});
