import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const ViewTypeSchema = z.enum(['table', 'form', 'kanban', 'detail', 'calendar', 'gallery']);
export const ViewDefinitionSchema = z.object({
  id: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  type: ViewTypeSchema,
  isDefault: z.boolean().default(false),
  columns: z.array(z.object({ fieldId: IdSchema, width: z.number().positive().optional(), visible: z.boolean().default(true) }).strict()).default([]),
  sort: z.array(z.object({ fieldId: IdSchema, direction: z.enum(['asc', 'desc']) }).strict()).default([]),
  filters: JsonObjectSchema.default({}),
  settings: JsonObjectSchema.default({}),
}).strict();
export type ViewDefinition = z.infer<typeof ViewDefinitionSchema>;
