import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const ActionKindSchema = z.enum([
  'createRecord', 'updateRecord', 'deleteRecord', 'changeStatus', 'notification', 'webhook', 'formula', 'documentGeneration', 'emitEvent',
]);

/** `updateRecord` sets fields on the target record; values are validated by the engine like a PATCH. */
export const UpdateRecordActionConfigSchema = z.object({
  set: z.record(IdSchema, z.unknown()).refine((value) => Object.keys(value).length > 0, 'set must contain at least one field'),
}).strict();

/** `emitEvent` appends one event row scoped to the target record. */
export const EmitEventActionConfigSchema = z.object({
  eventType: z.string().trim().min(1).max(120).regex(/^[a-z][a-z0-9_.]*$/, 'eventType must be lowercase dot/underscore separated'),
  payload: JsonObjectSchema.default({}),
}).strict();

export const ActionDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  entityId: IdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  kind: ActionKindSchema,
  config: JsonObjectSchema.default({}),
}).strict();
export type ActionKind = z.infer<typeof ActionKindSchema>;
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

/** `notification` records an outbound notification delivery (transport is pluggable; the row is the source of truth). */
export const NotificationActionConfigSchema = z.object({
  to: z.string().trim().min(3).max(320),
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(10_000),
}).strict();

/** `webhook` POSTs the payload to the target URL; the delivery row records the outcome. */
export const WebhookActionConfigSchema = z.object({
  url: z.string().url().max(2000),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  headers: z.record(z.string().min(1).max(120), z.string().max(1000)).default({}),
}).strict();

export type WebhookActionConfig = z.infer<typeof WebhookActionConfigSchema>;
export type NotificationActionConfig = z.infer<typeof NotificationActionConfigSchema>;
