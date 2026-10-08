import { describe, expect, it } from 'vitest';
import type { EntityDefinition, FieldDefinition } from '@nexa/meta';
import { RecordValidationError, validateRecordData } from './index';

const entity: EntityDefinition = {
  id: 'vehicle',
  moduleId: 'fleet',
  name: 'vehicle',
  label: 'Vehicle',
  pluralLabel: 'Vehicles',
  description: '',
  settings: {},
};

const field = (
  id: string,
  type: FieldDefinition['type'],
  options: FieldDefinition['options'] = {},
): FieldDefinition => ({
  id,
  entityId: 'vehicle',
  name: id,
  label: id,
  type,
  position: 0,
  options: {
    required: false,
    unique: false,
    readonly: false,
    hidden: false,
    searchable: false,
    sortable: true,
    filterable: true,
    indexed: false,
    isStatus: false,
    ui: {},
    ...options,
  },
});

describe('validateRecordData - formula/computed', () => {
  it('computes formula and computed fields from sibling values', () => {
    const fields = [
      field('quantity', 'integer', { required: true }),
      field('price', 'number', { required: true }),
      field('total', 'computed', { expression: 'quantity * price' }),
      field('withTax', 'formula', { expression: 'ROUND(total * 1.1, 2)' }),
    ];
    const result = validateRecordData(entity, fields, { quantity: 2, price: 5 });
    expect(result.total).toBe(10);
    expect(result.withTax).toBe(11);
  });

  it('rejects client-supplied formula/computed values', () => {
    const fields = [field('total', 'formula', { expression: '10' })];
    expect(() => validateRecordData(entity, fields, { total: 5 })).toThrow(RecordValidationError);
  });

  it('rejects cyclic formula dependencies', () => {
    const fields = [
      field('a', 'formula', { expression: 'b + 1' }),
      field('b', 'formula', { expression: 'a + 1' }),
    ];
    expect(() => validateRecordData(entity, fields, {})).toThrow(RecordValidationError);
  });

  it('computes when some dependencies are provided', () => {
    const fields = [
      field('base', 'number'),
      field('total', 'formula', { expression: 'IF(base > 0, base * 2, 0)' }),
    ];
    expect(validateRecordData(entity, fields, {})).toMatchObject({ total: 0 });
    expect(validateRecordData(entity, fields, { base: 3 })).toMatchObject({ total: 6 });
  });
});
