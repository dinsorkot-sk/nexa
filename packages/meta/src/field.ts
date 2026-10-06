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

export const FieldCreateInputSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  type: FieldTypeSchema,
  options: FieldOptionsSchema.default({}),
  position: PositionedSchema.shape.position.default(0),
}).strict();
export type FieldCreateInput = z.infer<typeof FieldCreateInputSchema>;

export const FieldUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  options: FieldOptionsSchema.optional(),
  position: PositionedSchema.shape.position.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one field property must be provided');
export type FieldUpdateInput = z.infer<typeof FieldUpdateInputSchema>;

export const FieldDefinitionSchema = z.object({
  id: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  type: FieldTypeSchema,
  options: FieldOptionsSchema.default({}),
  position: PositionedSchema.shape.position,
}).strict().superRefine((field, ctx) => {
  const { type, options } = field;

  // select/multiSelect require non-empty unique choices
  if ((type === 'select' || type === 'multiSelect') && (!options.choices || options.choices.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${type} field must have at least one choice`,
      path: ['options', 'choices'],
    });
  }
  if (options.choices) {
    const values = options.choices.map(c => c.value);
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choice values must be unique',
        path: ['options', 'choices'],
      });
    }
  }

  // reference requires referenceEntityId
  if (type === 'reference' && !options.referenceEntityId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'reference field must specify referenceEntityId',
      path: ['options', 'referenceEntityId'],
    });
  }

  // formula/computed require expression
  if ((type === 'formula' || type === 'computed') && !options.expression) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${type} field must have an expression`,
      path: ['options', 'expression'],
    });
  }

  // numeric types: validate min <= max
  if (['number', 'integer', 'decimal', 'currency', 'percentage'].includes(type)) {
    if (options.min !== undefined && options.max !== undefined && options.min > options.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'min must be <= max',
        path: ['options', 'max'],
      });
    }
  }

  // regex must compile
  if (options.regex) {
    try {
      new RegExp(options.regex);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid regex: ${e instanceof Error ? e.message : String(e)}`,
        path: ['options', 'regex'],
      });
    }
  }
});
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;
