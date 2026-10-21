import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';
import { checkFieldStructure, FieldOptionsSchema, FieldTypeSchema } from './field';
import { RelationDefinitionSchema } from './relation';
import { SemanticVersionSchema } from './module';

/**
 * A field inside a metadata template. The rules are the ones a field creation
 * input goes through, so a template cannot carry a field the API would refuse
 * to create.
 */
export const MetadataTemplateFieldSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  type: FieldTypeSchema,
  options: FieldOptionsSchema.default({}),
  position: z.number().int().nonnegative().default(0),
}).strict().superRefine((field, ctx) => checkFieldStructure(field, ctx, true));
export type MetadataTemplateField = z.infer<typeof MetadataTemplateFieldSchema>;

/**
 * An entity inside a metadata template. The fields are nested here, where a
 * template author reads them, and flattened when the template is converted
 * into a module package.
 */
export const MetadataTemplateEntitySchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  pluralLabel: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  icon: z.string().max(100).optional(),
  settings: JsonObjectSchema.default({}),
  fields: z.array(MetadataTemplateFieldSchema).default([]),
}).strict();
export type MetadataTemplateEntity = z.infer<typeof MetadataTemplateEntitySchema>;

/**
 * A metadata template: the module identity, its entities with their fields,
 * and the relations between them. Pure metadata, no domain logic, so a
 * template installs into a tenant as an ordinary draft module.
 */
export const MetadataTemplateSchema = z.object({
  moduleId: IdSchema,
  name: z.string().trim().min(1).max(120),
  version: SemanticVersionSchema,
  description: z.string().max(2000).default(''),
  entities: z.array(MetadataTemplateEntitySchema).default([]),
  relations: z.array(RelationDefinitionSchema).default([]),
}).strict();
export type MetadataTemplate = z.infer<typeof MetadataTemplateSchema>;
