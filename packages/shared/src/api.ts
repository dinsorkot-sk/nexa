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
})

export const searchCountRequestSchema = z.object({ domain: domainSchema.default([]) })
export const readRequestSchema = z.object({ ids, fields: z.array(fieldName).max(200).optional() })
export const createRequestSchema = z.object({ values: z.union([values, z.array(values).min(1).max(MAX_IDS)]) })
export const writeRequestSchema = z.object({ ids: ids.min(1), values })
export const unlinkRequestSchema = z.object({ ids: ids.min(1) })
export const callRequestSchema = z.object({ ids: ids.default([]), args: z.array(z.unknown()).max(20).default([]) })
export const onchangeRequestSchema = z.object({ values, field: fieldName })

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
