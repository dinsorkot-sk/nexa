import type { FieldDefinition } from '@nexa/meta';

const NON_WRITABLE_FIELD_TYPES = new Set(['formula', 'computed', 'autoNumber']);

const NUMERIC_FIELD_TYPES = new Set(['number', 'integer', 'decimal', 'currency', 'percentage']);

/** A field type the runtime may accept as record input (not system-generated). */
export function isWritableFieldType(type: string): boolean {
  return !NON_WRITABLE_FIELD_TYPES.has(type);
}

/** A field the runtime may render as an editable input. */
export function isEditableField(field: FieldDefinition): boolean {
  return !field.options.readonly && !field.options.hidden && isWritableFieldType(field.type);
}

/**
 * @deprecated English-only, and it truncates reference ids. Use `formatFieldDisplay` from `./display`, which follows the
 * user's language, formats dates, numbers and currency by locale, and resolves references to labels. Kept so existing
 * callers keep their behaviour; nothing in this package uses it any more.
 */
export function formatFieldValue(field: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (field.type === 'boolean') {
    return value === true || value === 'true' ? 'Yes' : 'No';
  }
  if (NUMERIC_FIELD_TYPES.has(field.type)) {
    if (field.type === 'percentage' && typeof value === 'number' && Number.isFinite(value)) {
      return `${value}%`;
    }
    return String(value);
  }
  if (field.type === 'select' && field.options.choices) {
    const match = field.options.choices.find((choice) => choice.value === value);
    return match ? match.label : String(value);
  }
  if (field.type === 'reference') {
    const text = String(value);
    return text.length > 12 ? text.slice(0, 8) : text;
  }
  return String(value);
}
