import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const CrudActionSchema = z.enum(['create', 'read', 'update', 'delete', 'export', 'import']);
export type CrudAction = z.infer<typeof CrudActionSchema>;

export const PermissionResourceSchema = z.object({
  type: z.enum(['module', 'entity', 'field', 'record', 'action']),
  id: IdSchema.optional(),
}).strict();

export const PermissionCreateInputSchema = z.object({
  id: IdSchema,
  roleId: IdSchema,
  resource: PermissionResourceSchema,
  actions: z.array(z.union([CrudActionSchema, z.string().min(1)])).min(1),
  condition: JsonObjectSchema.default({}),
}).strict();
export type PermissionCreateInput = z.infer<typeof PermissionCreateInputSchema>;

export const PermissionUpdateInputSchema = z.object({
  roleId: IdSchema.optional(),
  resource: PermissionResourceSchema.optional(),
  actions: z.array(z.union([CrudActionSchema, z.string().min(1)])).min(1).optional(),
  condition: JsonObjectSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one permission property must be provided');
export type PermissionUpdateInput = z.infer<typeof PermissionUpdateInputSchema>;

export const PermissionDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  roleId: IdSchema,
  resource: PermissionResourceSchema,
  actions: z.array(z.union([CrudActionSchema, z.string().min(1)])).min(1),
  condition: JsonObjectSchema.default({}),
}).strict();
export type PermissionDefinition = z.infer<typeof PermissionDefinitionSchema>;
