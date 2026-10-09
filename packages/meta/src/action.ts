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
