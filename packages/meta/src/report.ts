import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const ReportDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  name: z.string().trim().min(1).max(120),
  entityId: IdSchema,
  fieldIds: z.array(IdSchema).default([]),
  filters: JsonObjectSchema.default({}),
  groupBy: z.array(IdSchema).default([]),
  sort: z.array(z.object({ fieldId: IdSchema, direction: z.enum(['asc', 'desc']) }).strict()).default([]),
  aggregations: z.array(z.object({ fieldId: IdSchema.optional(), operation: z.enum(['count', 'sum', 'avg', 'min', 'max']), label: z.string().max(120).optional() }).strict()).default([]),
  calculatedColumns: z.array(z.object({ id: IdSchema, label: z.string().min(1), expression: z.string().min(1).max(10000) }).strict()).default([]),
}).strict();
export type ReportDefinition = z.infer<typeof ReportDefinitionSchema>;
