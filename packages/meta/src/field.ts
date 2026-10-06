import { z } from 'zod';
import { IdSchema, JsonObjectSchema, PositionedSchema } from './common';

export const FieldTypeSchema = z.enum([
  'text', 'longText', 'number', 'integer', 'decimal', 'currency', 'percentage',
  'boolean', 'date', 'datetime', 'time', 'select', 'multiSelect', 'email', 'phone',
  'url', 'json', 'file', 'image', 'reference', 'computed', 'formula', 'autoNumber',
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const FieldOptionsSchema = z.object({
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  readonly: z.boolean().default(false),
  hidden: z.boolean().default(false),
  searchable: z.boolean().default(false),
  sortable: z.boolean().default(true),
  filterable: z.boolean().default(true),
  indexed: z.boolean().default(false),
  precision: z.number().int().min(0).max(12).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  regex: z.string().max(1000).optional(),
  helpText: z.string().max(2000).optional(),
  isStatus: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  referenceEntityId: IdSchema.optional(),
  expression: z.string().max(10000).optional(),
  choices: z.array(z.object({ value: z.string(), label: z.string() }).strict()).optional(),
  ui: JsonObjectSchema.default({}),
}).strict();

export const FieldDefinitionSchema = z.object({
  id: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  type: FieldTypeSchema,
  options: FieldOptionsSchema.default({}),
  position: PositionedSchema.shape.position,
}).strict();
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;
