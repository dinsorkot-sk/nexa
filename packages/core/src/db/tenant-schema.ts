import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { EntityStatus, LogicalType } from '@nexa/types';

export interface TenantDatabase {
  meta_entity: MetaEntityTable;
  meta_field: MetaFieldTable;
  meta_relation: MetaRelationTable;
  meta_view: MetaViewTable;
  meta_permission: MetaPermissionTable;
  meta_workflow: MetaWorkflowTable;
  meta_migration: MetaMigrationTable;
  audit_log: AuditLogTable;
}

export interface MetaEntityTable {
  id: string;
  name: string;
  table_name: string;
  version: number;
  status: EntityStatus;
  is_system: boolean;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface MetaFieldTable {
  id: string;
  entity_id: string;
  name: string;
  label: string;
  logical_type: LogicalType;
  physical_name: string;
  nullable: boolean;
  unique: boolean;
  required: boolean;
  is_system: boolean;
  scale: number | null;
  precision: number | null;
  length: number | null;
  default_value: string | null;
  reference_entity: string | null;
  formula: string | null;
  created_at: Generated<string>;
}

export interface MetaRelationTable {
  id: string;
  entity_id: string;
  name: string;
  type: 'oneToMany' | 'manyToMany';
  target_entity: string;
  foreign_key: string;
  junction_table: string | null;
  cascade: 'restrict' | 'cascade' | 'setNull' | null;
  created_at: Generated<string>;
}

export interface MetaViewTable {
  id: string;
  entity_id: string;
  name: string;
  type: 'list' | 'form' | 'kanban' | 'report';
  config: string; // JSON
  created_at: Generated<string>;
}

export interface MetaPermissionTable {
  id: string;
  entity_id: string;
  role: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  field_rules: string; // JSON
  row_filter: string | null; // DSL
  created_at: Generated<string>;
}

export interface MetaWorkflowTable {
  id: string;
  entity_id: string;
  name: string;
  states: string; // JSON array
  transitions: string; // JSON array
  created_at: Generated<string>;
}

export interface MetaMigrationTable {
  id: string;
  entity_id: string | null;
  version: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: string; // JSON
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export interface AuditLogTable {
  id: string;
  tenant_id: string;
  entity: string;
  record_id: string;
  action: 'create' | 'update' | 'delete';
  user_id: string | null;
  before_json: string | null;
  after_json: string | null;
  created_at: Generated<string>;
}