import { z } from 'zod';

export const IdSchema = z.string().trim().min(1).max(200);
export const JsonObjectSchema = z.record(z.unknown());
export const MetadataScopeSchema = z.object({
  tenantId: IdSchema,
  moduleId: IdSchema,
}).strict();
export const PositionedSchema = z.object({ position: z.number().int().nonnegative().default(0) });
export const MetadataVersionSchema = z.string().min(1).max(64);
