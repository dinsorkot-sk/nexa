import { z } from 'zod';

export const SemanticVersionSchema = z.string().regex(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
  'Expected a semantic version',
);

export const ModuleStatusSchema = z.enum([
  'draft',
  'review',
  'published',
  'enabled',
  'disabled',
  'archived',
]);
export type ModuleStatus = z.infer<typeof ModuleStatusSchema>;

export const ModuleOwnerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['user', 'system']),
}).strict();

export const ModuleDependencySchema = z.object({
  moduleId: z.string().min(1),
  version: z.string().min(1),
}).strict();

export const ModuleCreateInputSchema = z.object({
  id: z.string().trim().min(1).max(120),
  owner: ModuleOwnerSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''),
  icon: z.string().max(100).optional(),
  version: SemanticVersionSchema,
  settings: z.record(z.unknown()).default({}),
  dependencies: z.array(ModuleDependencySchema).default([]),
}).strict().superRefine((input, ctx) => {
  if (input.dependencies.some((dependency) => dependency.moduleId === input.id)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A module cannot depend on itself', path: ['dependencies'] });
  }
});
export type ModuleCreateInput = z.infer<typeof ModuleCreateInputSchema>;

export const ModuleUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(100).nullable().optional(),
  version: SemanticVersionSchema.optional(),
  settings: z.record(z.unknown()).optional(),
  dependencies: z.array(ModuleDependencySchema).optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one module property must be provided');
export type ModuleUpdateInput = z.infer<typeof ModuleUpdateInputSchema>;

export const ModuleTransitionInputSchema = z.object({
  to: ModuleStatusSchema,
}).strict();
export type ModuleTransitionInput = z.infer<typeof ModuleTransitionInputSchema>;

export const ModuleDefinitionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  owner: ModuleOwnerSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''),
  icon: z.string().max(100).optional(),
  version: SemanticVersionSchema,
  status: ModuleStatusSchema,
  settings: z.record(z.unknown()).default({}),
  dependencies: z.array(ModuleDependencySchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type ModuleDefinition = z.infer<typeof ModuleDefinitionSchema>;

const allowedTransitions: Record<ModuleStatus, readonly ModuleStatus[]> = {
  draft: ['review', 'archived'],
  review: ['draft', 'published', 'archived'],
  published: ['enabled', 'disabled', 'archived'],
  enabled: ['disabled', 'archived'],
  disabled: ['enabled', 'archived'],
  archived: [],
};

export function canTransitionModuleStatus(from: ModuleStatus, to: ModuleStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function transitionModuleStatus(from: ModuleStatus, to: ModuleStatus): ModuleStatus {
  if (!canTransitionModuleStatus(from, to)) {
    throw new Error(`Invalid module status transition: ${from} -> ${to}`);
  }
  return to;
}
