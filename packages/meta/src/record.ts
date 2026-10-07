import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const RecordDataSchema = JsonObjectSchema;
export const RecordCreateInputSchema = z.object({ data: RecordDataSchema }).strict();
export const RecordUpdateInputSchema = z.object({
  data: RecordDataSchema,
  version: z.number().int().positive().optional(),
}).strict();
export const RecordFilterOperatorSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']);
export const RecordFilterSchema = z.object({
  fieldId: IdSchema,
  operator: RecordFilterOperatorSchema,
  value: z.unknown(),
}).strict();
export const RecordSortSchema = z.object({ fieldId: IdSchema, direction: z.enum(['asc', 'desc']).default('asc') }).strict();
export const RecordQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.string().optional(),
  filter: z.string().optional(),
  search: z.string().max(200).optional(),
}).strict();
export const RecordListResponseSchema = z.object({
  items: z.array(z.record(z.unknown())), total: z.number().int().nonnegative(), limit: z.number(), offset: z.number(),
}).strict();
export type RecordCreateInput = z.infer<typeof RecordCreateInputSchema>;
export type RecordUpdateInput = z.infer<typeof RecordUpdateInputSchema>;
export type RecordFilter = z.infer<typeof RecordFilterSchema>;
export type RecordSort = z.infer<typeof RecordSortSchema>;
