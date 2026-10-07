import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  integer,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable('nexa_tenants', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const systemSettings = pgTable('nexa_system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const modules = pgTable('nexa_modules', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.id] }),
  index('nexa_modules_tenant_idx').on(table.tenantId),
]);

export const metadataDefinitions = pgTable('nexa_metadata_definitions', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull(),
  kind: text('kind').notNull(),
  id: text('id').notNull(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.moduleId, table.kind, table.id] }),
  index('nexa_metadata_definitions_module_idx').on(table.tenantId, table.moduleId, table.kind),
]);

export const records = pgTable('nexa_records', {
  id: uuid('id').defaultRandom().notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  moduleId: text('module_id'),
  entityId: text('entity_id').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text('created_by'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.id] }),
  index('nexa_records_tenant_entity_idx').on(table.tenantId, table.entityId),
  index('nexa_records_tenant_module_entity_idx').on(table.tenantId, table.moduleId, table.entityId),
  index('nexa_records_data_gin_idx').using('gin', table.data),
  index('nexa_records_live_idx').on(table.tenantId, table.entityId).where(sql`${table.deletedAt} IS NULL`),
  index('nexa_records_live_module_entity_idx').on(table.tenantId, table.moduleId, table.entityId).where(sql`${table.deletedAt} IS NULL`),
]);

export const recordLinks = pgTable('nexa_record_links', {
  tenantId: uuid('tenant_id').notNull(),
  relationId: text('relation_id').notNull(),
  fromRecordId: uuid('from_record_id').notNull(),
  toRecordId: uuid('to_record_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.relationId, table.fromRecordId, table.toRecordId] }),
  index('nexa_record_links_target_idx').on(table.tenantId, table.toRecordId),
]);

export const auditLog = pgTable('nexa_audit_log', {
  id: uuid('id').defaultRandom().notNull(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityId: text('entity_id'),
  recordId: uuid('record_id'),
  changes: jsonb('changes').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.id] }),
  foreignKey({
    name: 'nexa_audit_log_tenant_fk',
    columns: [table.tenantId],
    foreignColumns: [tenants.id],
  }).onDelete('cascade'),
  foreignKey({
    name: 'nexa_audit_log_tenant_record_fk',
    columns: [table.tenantId, table.recordId],
    foreignColumns: [records.tenantId, records.id],
  }),
  index('nexa_audit_log_tenant_time_idx').on(table.tenantId, table.occurredAt),
]);

export const eventLog = pgTable('nexa_event_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  correlationId: text('correlation_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('nexa_event_log_tenant_time_idx').on(table.tenantId, table.occurredAt),
]);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;
export type ModuleRow = typeof modules.$inferSelect;
export type NewModuleRow = typeof modules.$inferInsert;
export type MetadataDefinitionRow = typeof metadataDefinitions.$inferSelect;
export type NewMetadataDefinitionRow = typeof metadataDefinitions.$inferInsert;
export type RecordRow = typeof records.$inferSelect;
export type NewRecordRow = typeof records.$inferInsert;
export type RecordLink = typeof recordLinks.$inferSelect;
export type NewRecordLink = typeof recordLinks.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type EventLogEntry = typeof eventLog.$inferSelect;
export type NewEventLogEntry = typeof eventLog.$inferInsert;
