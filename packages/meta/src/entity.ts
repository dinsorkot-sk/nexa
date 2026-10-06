import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

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
