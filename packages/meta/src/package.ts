import { z } from 'zod';
import { EntityDefinitionSchema } from './entity';
import { FieldDefinitionSchema } from './field';
import { RelationDefinitionSchema } from './relation';
import { ViewDefinitionSchema } from './view';
import { FormDefinitionSchema } from './form';
import { WorkflowDefinitionSchema } from './workflow';
import { ActionDefinitionSchema } from './action';
import { AutomationDefinitionSchema } from './automation';
import { ReportDefinitionSchema } from './report';
import { DashboardDefinitionSchema } from './dashboard';
import { ModuleDefinitionSchema, SemanticVersionSchema } from './module';

export const ModulePackageManifestSchema = z.object({
  formatVersion: z.literal(1),
  moduleId: z.string().min(1),
  version: SemanticVersionSchema,
  dependencies: z.array(z.object({ moduleId: z.string().min(1), version: z.string().min(1) }).strict()).default([]),
  exportedAt: z.string().datetime(),
}).strict();

export const ModulePackageSchema = z.object({
  manifest: ModulePackageManifestSchema,
  module: ModuleDefinitionSchema,
  entities: z.array(EntityDefinitionSchema).default([]),
  fields: z.array(FieldDefinitionSchema).default([]),
  relations: z.array(RelationDefinitionSchema).default([]),
  views: z.array(ViewDefinitionSchema).default([]),
  forms: z.array(FormDefinitionSchema).default([]),
  workflows: z.array(WorkflowDefinitionSchema).default([]),
  actions: z.array(ActionDefinitionSchema).default([]),
  automations: z.array(AutomationDefinitionSchema).default([]),
  reports: z.array(ReportDefinitionSchema).default([]),
  dashboards: z.array(DashboardDefinitionSchema).default([]),
}).strict().superRefine((pkg, ctx) => {
  if (pkg.manifest.moduleId !== pkg.module.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Manifest moduleId must match module.id', path: ['manifest', 'moduleId'] });
  }
  if (pkg.manifest.version !== pkg.module.version) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Manifest version must match module.version', path: ['manifest', 'version'] });
  }
});
export type ModulePackageManifest = z.infer<typeof ModulePackageManifestSchema>;
export type ModulePackage = z.infer<typeof ModulePackageSchema>;
