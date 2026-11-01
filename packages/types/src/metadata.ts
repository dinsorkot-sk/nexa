export type LogicalType =
  | 'boolean'
  | 'decimal'
  | 'json'
  | 'datetime'
  | 'text'
  | 'uuid'
  | 'integer'
  | 'bigint';

export type EntityStatus = 'draft' | 'published' | 'archived';

export interface MetaEntity {
  id: string;
  name: string;
  tableName: string;
  version: number;
  status: EntityStatus;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MetaField {
  id: string;
  entityId: string;
  name: string; // logical/API name (x_ prefix for tenant-added)
  label: string;
  logicalType: LogicalType;
  physicalName: string; // engine-generated
  nullable: boolean;
  unique: boolean;
  required: boolean;
  isSystem: boolean;
  scale: number | null; // for decimal
  precision: number | null;
  length: number | null;
  default: unknown;
  referenceEntity: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface MetaRelation {
  id: string;
  entityId: string;
  name: string;
  type: 'oneToMany' | 'manyToMany';
  targetEntity: string;
  foreignKey: string;
  junctionTable: string | null;
  createdAt: string;
}

export interface MetaView {
  id: string;
  entityId: string;
  name: string;
  type: 'list' | 'form' | 'kanban' | 'report';
  config: Record<string, unknown>;
  createdAt: string;
}

export interface MetaPermission {
  id: string;
  entityId: string;
  role: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  fieldRules: Record<string, { read: boolean; write: boolean }>;
  rowFilter: string | null; // DSL, not raw SQL
  createdAt: string;
}

export interface MetaWorkflow {
  id: string;
  entityId: string;
  name: string;
  states: string[];
  transitions: { from: string; to: string; guard?: string }[];
  createdAt: string;
}

export interface MetaMigration {
  id: string;
  entityId: string | null;
  version: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: { id: string; status: 'pending' | 'completed' | 'failed'; sql: string }[];
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  entity: string;
  recordId: string;
  action: 'create' | 'update' | 'delete';
  userId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}