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
