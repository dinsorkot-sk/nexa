import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const CrudActionSchema = z.enum(['create', 'read', 'update', 'delete', 'export', 'import']);
export const PermissionDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  roleId: IdSchema,
  resource: z.object({
    type: z.enum(['module', 'entity', 'field', 'record', 'action']),
    id: IdSchema.optional(),
  }).strict(),
  actions: z.array(z.union([CrudActionSchema, z.string().min(1)])).min(1),
  condition: JsonObjectSchema.default({}),
}).strict();
export type PermissionDefinition = z.infer<typeof PermissionDefinitionSchema>;
