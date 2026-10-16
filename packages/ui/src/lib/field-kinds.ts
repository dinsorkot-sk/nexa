import type { FieldType } from '@nexa/meta';

/**
 * How each field type is edited. This table is exhaustive over FieldType: the compiler rejects a missing key, and a
 * test iterates FieldTypeSchema, so adding a field type to @nexa/meta without deciding how it renders fails the build.
 */
export type InputKind =
  | 'text' | 'longText' | 'email' | 'phone' | 'url' | 'link'
  | 'number' | 'integer' | 'decimal' | 'currency' | 'percentage'
  | 'boolean' | 'date' | 'datetime' | 'time'
  | 'select' | 'multiSelect' | 'reference' | 'json'
  | 'readonly';

export const inputKindByFieldType = {
  text: 'text',
  longText: 'longText',
  number: 'number',
  integer: 'integer',
  decimal: 'decimal',
  currency: 'currency',
  percentage: 'percentage',
  boolean: 'boolean',
  date: 'date',
  datetime: 'datetime',
  time: 'time',
  select: 'select',
  multiSelect: 'multiSelect',
  email: 'email',
  phone: 'phone',
  url: 'url',
  json: 'json',
  // file and image are URL fields: the backend has no upload, so they store a link.
  file: 'link',
  image: 'link',
  reference: 'reference',
  computed: 'readonly',
  formula: 'readonly',
  autoNumber: 'readonly',
} as const satisfies Record<FieldType, InputKind>;

export function inputKindOf(type: FieldType): InputKind {
  return inputKindByFieldType[type];
}
