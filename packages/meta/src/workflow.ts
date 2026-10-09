import { z } from 'zod';
import { IdSchema, JsonObjectSchema } from './common';

export const WorkflowStateSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  initial: z.boolean().default(false),
  terminal: z.boolean().default(false),
}).strict();

export const WorkflowActionRefSchema = z.object({
  actionId: IdSchema,
  input: JsonObjectSchema.default({}),
}).strict();

export const WorkflowTransitionSchema = z.object({
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  label: z.string().trim().min(1).max(200),
  condition: JsonObjectSchema.default({}),
  requiredRoleIds: z.array(IdSchema).default([]),
  actions: z.array(WorkflowActionRefSchema).default([]),
}).strict();

export const WorkflowDefinitionSchema = z.object({
  id: IdSchema,
  moduleId: IdSchema,
  entityId: IdSchema,
  name: z.string().trim().min(1).max(120),
  /** Select field on the entity that holds the current state id; existence is checked by the engine. */
  stateFieldId: IdSchema,
  states: z.array(WorkflowStateSchema).min(1),
  transitions: z.array(WorkflowTransitionSchema).default([]),
}).strict().superRefine((workflow, ctx) => {
  const stateIndex = new Map(workflow.states.map((state, index) => [state.id, index]));
  const initialCount = workflow.states.filter((state) => state.initial).length;
  if (initialCount !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A workflow must have exactly one initial state', path: ['states'] });
  }
  if (workflow.states.length > 0 && !workflow.states[0]!.initial) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The initial state must be the first state in a linear workflow', path: ['states'] });
  }
  const outgoing = new Set<string>();
  workflow.transitions.forEach((transition, index) => {
    const from = stateIndex.get(transition.from);
    const to = stateIndex.get(transition.to);
    if (from === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown source state: ${transition.from}`, path: ['transitions', index, 'from'] });
    }
    if (to === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown target state: ${transition.to}`, path: ['transitions', index, 'to'] });
    }
    if (from !== undefined && to !== undefined && to <= from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Linear workflows only allow forward transitions', path: ['transitions', index, 'to'] });
    }
    if (from !== undefined && to !== undefined && to !== from + 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Linear workflows only allow transitions to the next state', path: ['transitions', index, 'to'] });
    }
    if (outgoing.has(transition.from)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `State ${transition.from} has more than one outgoing transition`, path: ['transitions', index, 'from'] });
    }
    outgoing.add(transition.from);
  });
  workflow.states.forEach((state, index) => {
    if (state.terminal && outgoing.has(state.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Terminal state ${state.id} cannot have outgoing transitions`, path: ['states', index, 'terminal'] });
    }
  });
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;
