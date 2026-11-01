import type { MetaEntity, MetaField, MetaRelation, MetaView, MetaPermission } from './metadata';

export interface ModuleDefinition {
  name: string;
  version: string;
  entities: MetaEntity[];
  fields: MetaField[];
  relations: MetaRelation[];
  views: MetaView[];
  permissions: MetaPermission[];
  /** Migration steps to apply when installing/upgrading. */
  migrations: { version: string; steps: string[] }[];
}

export interface ModuleOverride {
  moduleId: string;
  tenantId: string;
  viewOverrides: Record<string, Partial<MetaView>>;
  permissionOverrides: Record<string, Partial<MetaPermission>>;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface MigrationJob {
  id: string;
  tenantId: string;
  moduleId: string;
  fromVersion: string;
  toVersion: string;
  status: JobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}