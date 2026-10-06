import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const WorkflowStateSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  initial: z.boolean().default(false),
  terminal: z.boolean().default(false),
}).strict();

export const WorkflowTransitionSchema = z.object({
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  label: z.string().trim().min(1).max(200),
  condition: JsonObjectSchema.default({}),
  requiredRoleIds: z.array(IdSchema).default([]),
}).strict();

export const WorkflowDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  states: z.array(WorkflowStateSchema).min(1),
  transitions: z.array(WorkflowTransitionSchema).default([]),
}).strict().superRefine((workflow, ctx) => {
  const stateIds = new Set(workflow.states.map((state) => state.id));
  const initialCount = workflow.states.filter((state) => state.initial).length;
  if (initialCount !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A workflow must have exactly one initial state', path: ['states'] });
  }
  workflow.transitions.forEach((transition, index) => {
    if (!stateIds.has(transition.from)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown source state: ${transition.from}`, path: ['transitions', index, 'from'] });
    }
    if (!stateIds.has(transition.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown target state: ${transition.to}`, path: ['transitions', index, 'to'] });
    }
  });
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
