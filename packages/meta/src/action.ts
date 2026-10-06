import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const ActionKindSchema = z.enum([
  'createRecord', 'updateRecord', 'deleteRecord', 'changeStatus', 'notification', 'webhook', 'formula', 'documentGeneration',
]);
export const ActionDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  entityId: IdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  kind: ActionKindSchema,
  config: JsonObjectSchema.default({}),
}).strict();
export type ActionKind = z.infer<typeof ActionKindSchema>;
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;
