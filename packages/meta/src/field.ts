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

type FieldStructure = {
  type: z.infer<typeof FieldTypeSchema>;
  options: z.infer<typeof FieldOptionsSchema>;
};

/**
 * Per-type structural rules shared by field creation inputs and stored
 * definitions, so a field cannot be created through the API schema layer
 * without satisfying the same constraints a stored definition enforces.
 *
 * `creation` gates rules that would otherwise make legacy stored definitions
 * (e.g. autoNumber fields written before generation was deferred) unreadable:
 * the read path must still parse them so validation can report them cleanly.
 */
function checkFieldStructure(field: FieldStructure, ctx: z.RefinementCtx, creation = false) {
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

  // formula/computed require a non-empty expression
  if ((type === 'formula' || type === 'computed') && !options.expression?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${type} field must have an expression`,
      path: ['options', 'expression'],
    });
  }

  if (creation) {
    // autoNumber generation is deferred to a later phase; reject explicit
    // attempts rather than accepting a field record writes cannot populate.
    if (type === 'autoNumber') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'autoNumber fields are not supported yet',
        path: ['type'],
      });
    }
    if (options.defaultValue !== undefined && ['autoNumber', 'formula', 'computed'].includes(type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${type} fields cannot have a defaultValue`,
        path: ['options', 'defaultValue'],
      });
    }
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
}

export const FieldCreateInputSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  type: FieldTypeSchema,
  options: FieldOptionsSchema.default({}),
  position: PositionedSchema.shape.position.default(0),
}).strict().superRefine((field, ctx) => checkFieldStructure(field, ctx, true));
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
}).strict().superRefine(checkFieldStructure);
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;
