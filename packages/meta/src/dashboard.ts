import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const DashboardWidgetSchema = z.object({
  id: IdSchema,
  type: z.enum(['kpi', 'table', 'bar', 'line', 'pie', 'area']),
  reportId: IdSchema.optional(),
  title: z.string().trim().min(1).max(200),
  layout: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  settings: JsonObjectSchema.default({}),
}).strict();

export const DashboardDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  name: z.string().trim().min(1).max(120),
  ownerId: IdSchema.optional(),
  widgets: z.array(DashboardWidgetSchema).default([]),
  filters: JsonObjectSchema.default({}),
}).strict();
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;
export type DashboardDefinition = z.infer<typeof DashboardDefinitionSchema>;
