import type { MetaField } from '@nexa/types';

/** Mark a field as soft-deleted: rename physical column, drop constraints. */
export function softDeleteField(field: MetaField, now: string = new Date().toISOString()): MetaField {
  return {
    ...field,
    name: `_deleted_${field.name}`,
    physicalName: `_deleted_${field.physicalName}`,
    nullable: true,
    unique: false,
    required: false,
    deletedAt: now,
  };
}

export function isSoftDeleted(field: MetaField): boolean {
  return field.deletedAt !== null;
}

export function activeFields(fields: MetaField[]): MetaField[] {
  return fields.filter((f) => !isSoftDeleted(f));
}