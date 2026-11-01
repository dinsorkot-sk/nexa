import { z } from 'zod';
import type { FieldSpec } from '@nexa/types';

const urlRe = /^https?:\/\/.+/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^\d{2}:\d{2}(:\d{2})?$/;
const integerRe = /^-?\d+$/;
const decimalRe = /^-?\d+(\.\d+)?$/;

function stringSchema(f: FieldSpec): z.ZodString {
  let s = z.string();
  if (f.logicalType === 'email') s = s.email();
  else if (f.logicalType === 'url') s = s.regex(urlRe);
  if (f.pattern) s = s.regex(new RegExp(f.pattern));
  if (f.minLength != null) s = s.min(f.minLength);
  if (f.maxLength != null) s = s.max(f.maxLength);
  if (f.required && !f.nullable) s = s.min(1, 'required');
  return s;
}

export function buildSchema(fields: FieldSpec[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.hidden) continue;
    let schema: z.ZodTypeAny;
    switch (f.logicalType) {
      case 'text':
      case 'longText':
      case 'email':
      case 'phone':
      case 'url':
      case 'select':
      case 'reference':
        schema = stringSchema(f);
        break;
      case 'multiSelect':
        schema = z.array(z.string());
        break;
      case 'integer':
        schema = z.union([z.number().int(), z.string().regex(integerRe)]);
        break;
      case 'number':
      case 'decimal':
      case 'currency':
      case 'percentage':
        schema = z.union([z.number(), z.string().regex(decimalRe)]);
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'date':
        schema = z.string().regex(dateRe);
        break;
      case 'datetime':
        schema = z.union([z.string().datetime(), z.string().regex(dateRe)]);
        break;
      case 'time':
        schema = z.string().regex(timeRe);
        break;
      case 'file':
      case 'image':
        schema = z.string();
        break;
      case 'json':
        schema = z.unknown();
        break;
      case 'autoNumber':
      case 'formula':
      case 'computed':
        schema = z.unknown().optional();
        break;
      default:
        schema = z.unknown();
    }
    if (f.nullable) schema = schema.nullable().optional();
    else if (!f.required) schema = schema.optional();
    shape[f.name] = schema;
  }
  return z.object(shape);
}

export function toSnakeCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function mapKeys<T>(value: T, fn: (key: string) => string): T {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v, fn)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [fn(k), mapKeys(v, fn)]),
    ) as T;
  }
  return value;
}
