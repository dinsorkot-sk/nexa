import { z } from 'zod'

/**
 * Request/response contracts of the generic engine API (`/api/model/:model/<method>`, `/api/ui/...`).
 * Limits keep a single request bounded; the engine still validates every field and value.
 */
const MAX_IDS = 1000
const MAX_DOMAIN_TERMS = 200

export const MAX_PAGE_SIZE = 1000
export const DEFAULT_PAGE_SIZE = 80

const id = z.number().int().positive()
const ids = z.array(id).max(MAX_IDS)
const fieldName = z.string().regex(/^[a-z][a-z0-9_]*$/)
const values = z.record(z.string(), z.unknown())
const fieldList = z.array(fieldName).max(200)
const modelContext = z.strictObject({
  lang: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
  activeTest: z.boolean().optional(),
  defaults: z.record(fieldName, z.unknown()).refine((defaults) => Object.keys(defaults).length <= 200).optional(),
}).optional()

/** Leaf values: scalars, bounded lists, or nested domains (for any / not any). */
const domainValue: z.ZodType = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number(), z.string().max(10_000),
  z.array(z.union([z.null(), z.boolean(), z.number(), z.string().max(10_000)])).max(MAX_IDS),
  domainSchema,
]))

export const domainSchema: z.ZodType<unknown[]> = z
  .array(z.union([z.enum(['&', '|', '!']), z.tuple([z.string().min(1).max(200), z.string().min(1).max(20), domainValue])]))
  .max(MAX_DOMAIN_TERMS)

export const searchReadRequestSchema = z.object({
  domain: domainSchema.default([]),
  fields: z.array(fieldName).max(200).optional(),
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  order: z.string().max(200).optional(),
  context: modelContext,
})

export const searchCountRequestSchema = z.object({ domain: domainSchema.default([]), context: modelContext })
export const readRequestSchema = z.object({ ids, fields: fieldList.optional(), context: modelContext })
export const createRequestSchema = z.object({ values: z.union([values, z.array(values).min(1).max(MAX_IDS)]), context: modelContext })
export const nameSearchRequestSchema = z.object({
  name: z.string().max(200).default(''),
  domain: domainSchema.default([]),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  context: modelContext,
})
export const readGroupRequestSchema = z.object({
  domain: domainSchema.default([]),
  groupBy: z.array(z.string().regex(/^[a-z][a-z0-9_]*(?::(?:day|week|month|quarter|year))?$/)).max(8).default([]),
  aggregates: z.array(z.object({
    field: fieldName,
    op: z.enum(['sum', 'avg', 'min', 'max', 'count', 'count_distinct']),
  })).max(30).default([]),
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  context: modelContext,
})
export const fieldsGetRequestSchema = z.object({ fields: fieldList.optional(), context: modelContext })
export const defaultGetRequestSchema = z.object({ fields: fieldList, context: modelContext })
export const copyRequestSchema = z.object({ id, defaults: values.optional(), context: modelContext })
export type ModelRequestContext = z.infer<typeof modelContext>
export const writeRequestSchema = z.object({ ids: ids.min(1), values, context: modelContext })
export const unlinkRequestSchema = z.object({ ids: ids.min(1) })
export const callRequestSchema = z.object({ ids: ids.default([]), args: z.array(z.unknown()).max(20).default([]) })
export const onchangeRequestSchema = z.object({ values, field: fieldName, context: modelContext })

export const errorTypes = ['access', 'validation', 'missing', 'user', 'bad_request', 'unauthorized', 'internal'] as const

export const errorResponseSchema = z.object({
  error: z.object({ type: z.enum(errorTypes), message: z.string() }),
})

export type Domain = z.infer<typeof domainSchema>
export type SearchReadRequest = z.input<typeof searchReadRequestSchema>
export type ReadRequest = z.input<typeof readRequestSchema>
export type CreateRequest = z.input<typeof createRequestSchema>
export type WriteRequest = z.input<typeof writeRequestSchema>
export type UnlinkRequest = z.input<typeof unlinkRequestSchema>
export type CallRequest = z.input<typeof callRequestSchema>
export type OnchangeRequest = z.input<typeof onchangeRequestSchema>
export type ErrorResponse = z.infer<typeof errorResponseSchema>

/** Headers of the development authentication (replaced by real sessions later). */
export const TENANT_HEADER = 'x-nexa-tenant'
export const UID_HEADER = 'x-nexa-uid'
