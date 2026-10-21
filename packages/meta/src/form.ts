import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const FormSectionSchema = z.object({
  id: IdSchema,
  label: z.string().trim().min(1).max(200),
  fieldIds: z.array(IdSchema).default([]),
  columns: z.number().int().min(1).max(4).default(1),
  visibility: JsonObjectSchema.default({}),
}).strict();

export const FormCreateInputSchema = z.object({
  id: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  sections: z.array(FormSectionSchema).default([]),
  settings: JsonObjectSchema.default({}),
}).strict();
export type FormCreateInput = z.infer<typeof FormCreateInputSchema>;

export const FormUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sections: z.array(FormSectionSchema).optional(),
  settings: JsonObjectSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one form property must be provided');
export type FormUpdateInput = z.infer<typeof FormUpdateInputSchema>;

export const FormDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  sections: z.array(FormSectionSchema).default([]),
  settings: JsonObjectSchema.default({}),
}).strict();
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;
