import { describe, expect, it } from 'vitest';
import type { EntityDefinition, FieldDefinition } from '@nexa/meta';
import { RecordValidationError, validateRecordData } from './index';

const entity: EntityDefinition = { id: 'vehicle', moduleId: 'fleet', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', description: '', settings: {} };
const field = (id: string, type: FieldDefinition['type'], options: FieldDefinition['options'] = {}): FieldDefinition => ({ id, entityId: 'vehicle', name: id, label: id, type, position: 0, options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...options } });

describe('validateRecordData', () => {
  it('applies defaults and validates required fields and types', () => {
    const fields = [field('name', 'text', { required: true }), field('active', 'boolean', { defaultValue: true })];
    expect(validateRecordData(entity, fields, { name: 'Van' })).toEqual({ name: 'Van', active: true });
    expect(() => validateRecordData(entity, fields, {})).toThrow(RecordValidationError);
    expect(() => validateRecordData(entity, fields, { name: 2 })).toThrow(RecordValidationError);
  });

  it('rejects unknown and readonly fields', () => {
    expect(() => validateRecordData(entity, [field('name', 'text', { readonly: true })], { name: 'Van' })).toThrow(/validation/);
    expect(() => validateRecordData(entity, [field('name', 'text')], { bad: 'x' })).toThrow(RecordValidationError);
  });

  it('merges patches and enforces bounds and choices', () => {
    const fields = [field('name', 'text', { required: true }), field('year', 'integer', { min: 1990, max: 2030 }), field('state', 'select', { choices: [{ value: 'new', label: 'New' }] })];
    expect(validateRecordData(entity, fields, { year: 2020 }, { mode: 'update', existing: { name: 'Van' } })).toMatchObject({ name: 'Van', year: 2020 });
    expect(() => validateRecordData(entity, fields, { year: 2050 }, { mode: 'update', existing: { name: 'Van' } })).toThrow(RecordValidationError);
  });
});
