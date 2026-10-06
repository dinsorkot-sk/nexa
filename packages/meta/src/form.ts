import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const FormDefinitionSchema = z.object({
  id: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  sections: z.array(z.object({
    id: IdSchema,
    label: z.string().trim().min(1).max(200),
    fieldIds: z.array(IdSchema).default([]),
    columns: z.number().int().min(1).max(4).default(1),
    visibility: JsonObjectSchema.default({}),
  }).strict()).default([]),
  settings: JsonObjectSchema.default({}),
}).strict();
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;
