import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const ViewTypeSchema = z.enum(['table', 'form', 'kanban', 'detail', 'calendar', 'gallery']);
export type ViewType = z.infer<typeof ViewTypeSchema>;

export const ViewColumnSchema = z.object({
  fieldId: IdSchema,
  width: z.number().positive().optional(),
  visible: z.boolean().default(true),
}).strict();

export const ViewSortSchema = z.object({
  fieldId: IdSchema,
  direction: z.enum(['asc', 'desc']),
}).strict();

export const ViewCreateInputSchema = z.object({
  id: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  type: ViewTypeSchema,
  isDefault: z.boolean().default(false),
  columns: z.array(ViewColumnSchema).default([]),
  sort: z.array(ViewSortSchema).default([]),
  filters: JsonObjectSchema.default({}),
  settings: JsonObjectSchema.default({}),
}).strict();
export type ViewCreateInput = z.infer<typeof ViewCreateInputSchema>;

export const ViewUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: ViewTypeSchema.optional(),
  isDefault: z.boolean().optional(),
  columns: z.array(ViewColumnSchema).optional(),
  sort: z.array(ViewSortSchema).optional(),
  filters: JsonObjectSchema.optional(),
  settings: JsonObjectSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one view property must be provided');
export type ViewUpdateInput = z.infer<typeof ViewUpdateInputSchema>;

export const ViewDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  type: ViewTypeSchema,
  isDefault: z.boolean().default(false),
  columns: z.array(ViewColumnSchema).default([]),
  sort: z.array(ViewSortSchema).default([]),
  filters: JsonObjectSchema.default({}),
  settings: JsonObjectSchema.default({}),
}).strict();
export type ViewDefinition = z.infer<typeof ViewDefinitionSchema>;
