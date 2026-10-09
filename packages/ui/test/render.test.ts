import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@nexa/meta';
import { formatFieldValue, isEditableField, isWritableFieldType } from '../src/render/format';

function makeField(partial: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'field_01',
    entityId: 'entity_01',
    name: 'field',
    label: 'Field',
    type: 'text',
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
    },
    position: 0,
    ...partial,
  } as FieldDefinition;
}

describe('isWritableFieldType', () => {
  it('returns false for system-generated types', () => {
    expect(isWritableFieldType('formula')).toBe(false);
    expect(isWritableFieldType('computed')).toBe(false);
    expect(isWritableFieldType('autoNumber')).toBe(false);
  });

  it('returns true for user-writable types', () => {
    expect(isWritableFieldType('text')).toBe(true);
    expect(isWritableFieldType('number')).toBe(true);
    expect(isWritableFieldType('select')).toBe(true);
    expect(isWritableFieldType('reference')).toBe(true);
  });
});

describe('isEditableField', () => {
  it('returns true for a plain writable field', () => {
    expect(isEditableField(makeField({}))).toBe(true);
  });

  it('returns false for readonly fields', () => {
    const field = makeField({});
    field.options.readonly = true;
    expect(isEditableField(field)).toBe(false);
  });

  it('returns false for hidden fields', () => {
    const field = makeField({});
    field.options.hidden = true;
    expect(isEditableField(field)).toBe(false);
  });

  it('returns false for formula fields even when not readonly', () => {
    expect(isEditableField(makeField({ type: 'formula' }))).toBe(false);
  });
});

describe('formatFieldValue', () => {
  it('returns empty string for null, undefined and empty string', () => {
    const field = makeField({});
    expect(formatFieldValue(field, null)).toBe('');
    expect(formatFieldValue(field, undefined)).toBe('');
    expect(formatFieldValue(field, '')).toBe('');
  });

  it('formats booleans as Yes/No', () => {
    const field = makeField({ type: 'boolean' });
    expect(formatFieldValue(field, true)).toBe('Yes');
    expect(formatFieldValue(field, false)).toBe('No');
  });

  it('formats numbers as strings', () => {
    const field = makeField({ type: 'number' });
    expect(formatFieldValue(field, 42)).toBe('42');
    expect(formatFieldValue(field, 1.5)).toBe('1.5');
  });

  it('appends % to finite percentage numbers', () => {
    const field = makeField({ type: 'percentage' });
    expect(formatFieldValue(field, 25.5)).toBe('25.5%');
    expect(formatFieldValue(field, Number.POSITIVE_INFINITY)).toBe('Infinity');
  });

  it('resolves select choice labels', () => {
    const field = makeField({
      type: 'select',
      options: {
        choices: [
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ],
      },
    } as Partial<FieldDefinition>);
    expect(formatFieldValue(field, 'open')).toBe('Open');
    expect(formatFieldValue(field, 'unknown')).toBe('unknown');
  });

  it('truncates long reference values to 8 chars', () => {
    const field = makeField({ type: 'reference' });
    expect(formatFieldValue(field, 'record_abcdefghij')).toBe('record_a');
    expect(formatFieldValue(field, 'rec_123')).toBe('rec_123');
  });

  it('stringifies other values', () => {
    const field = makeField({ type: 'date' });
    expect(formatFieldValue(field, '2026-10-09')).toBe('2026-10-09');
  });
});
