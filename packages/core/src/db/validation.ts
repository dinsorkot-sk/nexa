import { z } from 'zod';
import type { MetaField } from '@nexa/types';

export function buildZodSchema(fields: MetaField[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.deletedAt) continue;
    let schema: z.ZodTypeAny;
    switch (f.logicalType) {
      case 'boolean':
        schema = z.boolean();
        break;
      case 'integer':
      case 'bigint':
        schema = z.number().int();
        break;
      case 'decimal':
        schema = z.number();
        break;
      case 'datetime':
        schema = z.string().datetime().or(z.date());
        break;
      case 'json':
        schema = z.unknown();
        break;
      default:
        schema = z.string();
    }
    if (f.length) schema = (schema as z.ZodString).max?.(f.length) ?? schema;
    if (f.nullable) schema = schema.nullable().optional();
    else if (f.required) schema = schema;
    shape[f.name] = schema;
  }
  return z.object(shape);
}