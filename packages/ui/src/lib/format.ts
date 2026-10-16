import type { FieldDefinition } from '@nexa/meta';

const NON_WRITABLE_FIELD_TYPES = new Set(['formula', 'computed', 'autoNumber']);

/** A field type the runtime may accept as record input (not system-generated). */
export function isWritableFieldType(type: string): boolean {
  return !NON_WRITABLE_FIELD_TYPES.has(type);
}

/** A field the runtime may render as an editable input. */
export function isEditableField(field: FieldDefinition): boolean {
  return !field.options.readonly && !field.options.hidden && isWritableFieldType(field.type);
}
