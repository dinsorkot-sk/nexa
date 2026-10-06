import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const EntityCreateInputSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  pluralLabel: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  icon: z.string().max(100).optional(),
  settings: JsonObjectSchema.default({}),
}).strict();
export type EntityCreateInput = z.infer<typeof EntityCreateInputSchema>;

export const EntityUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  pluralLabel: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(100).nullable().optional(),
  settings: JsonObjectSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one entity property must be provided');
export type EntityUpdateInput = z.infer<typeof EntityUpdateInputSchema>;

export const EntityDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  pluralLabel: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  icon: z.string().max(100).optional(),
  settings: JsonObjectSchema.default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
}).strict();
export type EntityDefinition = z.infer<typeof EntityDefinitionSchema>;
