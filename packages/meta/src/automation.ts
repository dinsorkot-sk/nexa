import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const AutomationTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('event'), event: z.string().min(1) }).strict(),
  z.object({ type: z.literal('record'), entityId: IdSchema, operation: z.enum(['created', 'updated', 'deleted']) }).strict(),
  z.object({ type: z.literal('workflow'), workflowId: IdSchema, transitionId: IdSchema.optional() }).strict(),
  z.object({ type: z.literal('scheduled'), cron: z.string().min(1).max(100), timezone: z.string().max(100).default('UTC') }).strict(),
]);

export const AutomationDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(false),
  trigger: AutomationTriggerSchema,
  condition: JsonObjectSchema.default({}),
  actions: z.array(z.object({ actionId: IdSchema, input: JsonObjectSchema.default({}) }).strict()).min(1),
  retry: z.object({ maxAttempts: z.number().int().min(0).max(10).default(3) }).strict().default({}),
}).strict();
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;
export type AutomationDefinition = z.infer<typeof AutomationDefinitionSchema>;
