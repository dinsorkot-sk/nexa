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
  options: Partial<FieldDefinition['options']> = {},
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

  it('recomputes formula fields on update from merged values', () => {
    const fields = [
      field('quantity', 'integer', { required: true }),
      field('price', 'number', { required: true }),
      field('total', 'computed', { expression: 'quantity * price' }),
      field('withTax', 'formula', { expression: 'ROUND(total * 1.1, 2)' }),
    ];
    const existing = validateRecordData(entity, fields, { quantity: 2, price: 5 });
    const updated = validateRecordData(
      entity,
      fields,
      { price: 10 },
      { mode: 'update', existing },
    );
    expect(updated).toMatchObject({ quantity: 2, price: 10, total: 20, withTax: 22 });
  });

  it('rejects computed results that violate field constraints', () => {
    const bounded = [
      field('price', 'number', { required: true }),
      field('capped', 'computed', { expression: 'price * 2', max: 10 }),
    ];
    expect(() => validateRecordData(entity, bounded, { price: 6 })).toThrow(RecordValidationError);

    const floored = [
      field('price', 'number', { required: true }),
      field('floored', 'computed', { expression: 'price - 100', min: 0 }),
    ];
    expect(() => validateRecordData(entity, floored, { price: 5 })).toThrow(RecordValidationError);

    const requiredComputed = [
      field('base', 'number'),
      field('maybe', 'computed', { expression: 'base', required: true }),
    ];
    expect(() => validateRecordData(entity, requiredComputed, {})).toThrow(RecordValidationError);
    expect(validateRecordData(entity, requiredComputed, { base: 1 })).toMatchObject({ maybe: 1 });
  });

  it('rejects non-finite computed results', () => {
    const fields = [
      field('big', 'number', { required: true }),
      field('huge', 'computed', { expression: 'big * big' }),
    ];
    expect(() => validateRecordData(entity, fields, { big: 1e308 })).toThrow(RecordValidationError);
  });

  it('rejects records for unsupported autoNumber fields', () => {
    const fields = [
      field('code', 'autoNumber'),
      field('name', 'text', { required: true }),
    ];
    expect(() => validateRecordData(entity, fields, { name: 'Truck' })).toThrow(RecordValidationError);
  });

  it('rejects client-supplied autoNumber values', () => {
    const fields = [field('code', 'autoNumber')];
    expect(() => validateRecordData(entity, fields, { code: 'A1' })).toThrow(RecordValidationError);
  });
});
