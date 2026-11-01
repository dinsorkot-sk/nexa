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
  formula: string | null;
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
  cascade: 'restrict' | 'cascade' | 'setNull' | null;
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

// UI-level field types (23). These map onto LogicalType (physical) via the
// dialect adapter: currency/percentage → decimal, email/phone/url → text, etc.
export type FieldLogicalType =
  | 'text'
  | 'longText'
  | 'email'
  | 'phone'
  | 'url'
  | 'integer'
  | 'number'
  | 'decimal'
  | 'currency'
  | 'percentage'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'multiSelect'
  | 'reference'
  | 'file'
  | 'image'
  | 'json'
  | 'autoNumber'
  | 'formula'
  | 'computed';

export interface FieldOption {
  value: string;
  label: string;
  color?: string;
}

// Metadata-driven field description consumed by NxFieldInput / NxFieldValue.
// Superset of MetaField with the UI-level flags from the design system.
export interface FieldSpec {
  id: string;
  entityId?: string;
  name: string;
  label: string;
  logicalType: FieldLogicalType;
  required?: boolean;
  unique?: boolean;
  hidden?: boolean;
  readOnly?: boolean;
  nullable?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
  scale?: number | null;
  precision?: number | null;
  length?: number | null;
  referenceEntity?: string | null;
  formula?: string | null;
  options?: FieldOption[];
  default?: unknown;
  description?: string | null;
}

export const FIELD_TYPE_GROUPS: { name: string; types: FieldLogicalType[] }[] = [
  { name: 'TEXT', types: ['text', 'longText', 'email', 'phone', 'url'] },
  { name: 'NUMBER', types: ['integer', 'number', 'decimal', 'currency', 'percentage'] },
  { name: 'DATE & TIME', types: ['date', 'datetime', 'time'] },
  { name: 'CHOICE', types: ['select', 'multiSelect'] },
  { name: 'RELATION', types: ['reference'] },
  { name: 'CALCULATED', types: ['autoNumber', 'formula', 'computed'] },
  { name: 'MEDIA', types: ['file', 'image'] },
  { name: 'ADVANCED', types: ['json', 'boolean'] },
];

export const READONLY_FIELD_TYPES: FieldLogicalType[] = ['autoNumber', 'formula', 'computed'];