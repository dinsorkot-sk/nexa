import { and, eq, inArray, isNull, sql, desc, asc, count, type SQL } from 'drizzle-orm';
import type { DbHandle } from './client';
import { auditLog, eventLog, recordLinks, records, tenants } from './schema';
import type { FieldDefinition, RelationDefinition } from '@nexa/meta';

function queryValueExpression(field: FieldDefinition) {
  const value = sql`${records.data}->>${field.id}`;
  if (['number', 'integer', 'decimal', 'currency', 'percentage'].includes(field.type)) return sql`NULLIF(${value}, '')::numeric`;
  if (field.type === 'boolean') return sql`NULLIF(${value}, '')::boolean`;
  return value;
}

export const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export interface TenantContext { readonly tenantId: string }
export function createTenantContext(tenantId: string): TenantContext {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) throw new Error('Invalid tenant ID');
  return Object.freeze({ tenantId });
}

export class RecordConflictError extends Error { constructor(message: string) { super(message); this.name = 'RecordConflictError'; } }

/** Drizzle transaction handle passed between repository calls that must commit together. */
export type TenantTransaction = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

/** Joins the caller's transaction when given; otherwise opens a new one for this call. */
function withOptionalTransaction<T>(handle: DbHandle, outer: TenantTransaction | undefined, fn: (tx: TenantTransaction) => Promise<T>): Promise<T> {
  if (outer) return fn(outer);
  return handle.db.transaction(async (tx) => fn(tx));
}

export function tenantRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;
  const scoped = (moduleId: string, entityId: string) => and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), eq(records.entityId, entityId));
  return {
    // Legacy helpers address pre-Phase-5 rows whose moduleId remains null.
    async listRecords(entityId: string) { return handle.db.select().from(records).where(and(eq(records.tenantId, tenantId), eq(records.entityId, entityId), isNull(records.moduleId), isNull(records.deletedAt))); },
    async getRecord(entityId: string, recordId: string) { const [record] = await handle.db.select().from(records).where(and(eq(records.tenantId, tenantId), eq(records.entityId, entityId), eq(records.id, recordId), isNull(records.moduleId), isNull(records.deletedAt))).limit(1); return record; },
    async createRecord(entityId: string, data: Record<string, unknown>, createdBy?: string) {
      return handle.db.transaction(async (tx) => { const [record] = await tx.insert(records).values({ tenantId, entityId, data, createdBy }).returning(); await tx.insert(auditLog).values({ tenantId, actorId: createdBy, action: 'record.created', entityId, recordId: record.id, changes: { after: data } }); return record; });
    },
    async updateRecord(entityId: string, recordId: string, data: Record<string, unknown>) {
      return handle.db.transaction(async (tx) => { const [record] = await tx.update(records).set({ data, version: sql`${records.version} + 1`, updatedAt: new Date() }).where(and(eq(records.tenantId, tenantId), eq(records.entityId, entityId), eq(records.id, recordId), isNull(records.moduleId), isNull(records.deletedAt))).returning(); if (!record) return undefined; await tx.insert(auditLog).values({ tenantId, action: 'record.updated', entityId, recordId, changes: { after: data } }); return record; });
    },
    async deleteRecord(entityId: string, recordId: string) {
      return handle.db.transaction(async (tx) => { const [record] = await tx.update(records).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(records.tenantId, tenantId), eq(records.entityId, entityId), eq(records.id, recordId), isNull(records.moduleId), isNull(records.deletedAt))).returning(); if (record) await tx.insert(auditLog).values({ tenantId, action: 'record.deleted', entityId, recordId, changes: { before: record.data } }); return record; });
    },

    async listScopedRecords(moduleId: string, entityId: string, options: { limit: number; offset: number; orderBy?: { fieldId: string; direction: 'asc' | 'desc' }; filters?: Array<{ fieldId: string; operator: string; value: unknown }>; fields?: FieldDefinition[]; search?: string } = { limit: 25, offset: 0 }) {
      const predicates: SQL[] = [scoped(moduleId, entityId)!, isNull(records.deletedAt)!];
      const byId = new Map((options.fields ?? []).map((field) => [field.id, field]));
      for (const filter of options.filters ?? []) {
        const field = byId.get(filter.fieldId);
        if (!field) throw new RecordConflictError('Unknown query field');
        const path = queryValueExpression(field);
        const value = filter.value;
        if (filter.operator === 'eq') predicates.push(sql`${path} = ${value}`);
        else if (filter.operator === 'ne') predicates.push(sql`${path} <> ${value}`);
        else if (filter.operator === 'contains') predicates.push(sql`${path} ILIKE ${`%${String(value)}%`}`);
        else if (filter.operator === 'in' && Array.isArray(value)) predicates.push(sql`${path} IN (${sql.join(value.map((v) => sql`${v}`), sql`, `)})`);
        else if (filter.operator === 'gt') predicates.push(sql`${path} > ${value}`);
        else if (filter.operator === 'gte') predicates.push(sql`${path} >= ${value}`);
        else if (filter.operator === 'lt') predicates.push(sql`${path} < ${value}`);
        else if (filter.operator === 'lte') predicates.push(sql`${path} <= ${value}`);
      }
      if (options.search) {
        const searchable = (options.fields ?? []).filter((field) => field.options.searchable && !field.options.hidden);
        if (searchable.length) predicates.push(sql`(${sql.join(searchable.map((field) => sql`${records.data}->>${field.id} ILIKE ${`%${options.search}%`}`), sql` OR `)})`);
        else predicates.push(sql`false`);
      }
      const where = and(...predicates);
      const orderField = options.orderBy ? byId.get(options.orderBy.fieldId) : undefined;
      const orderExpr = orderField ? queryValueExpression(orderField) : records.createdAt;
      const order = options.orderBy?.direction === 'desc' ? desc(orderExpr) : asc(orderExpr);
      const [totalRow] = await handle.db.select({ total: count() }).from(records).where(where);
      const items = await handle.db.select().from(records).where(where).orderBy(order, desc(records.createdAt), desc(records.id)).limit(options.limit).offset(options.offset);
      return { items, total: Number(totalRow?.total ?? 0) };
    },
    async getScopedRecord(moduleId: string, entityId: string, recordId: string) { const [record] = await handle.db.select().from(records).where(and(scoped(moduleId, entityId), eq(records.id, recordId), isNull(records.deletedAt))).limit(1); return record; },
    async runInTransaction<T>(fn: (tx: TenantTransaction) => Promise<T>): Promise<T> {
      return handle.db.transaction(async (tx) => fn(tx));
    },
    /** Appends one event; tenant comes from the repository context, never from the caller. */
    async appendEvent(event: { eventType: string; moduleId?: string; entityId?: string; recordId?: string; actorId?: string; correlationId?: string; payload?: Record<string, unknown> }, outer?: TenantTransaction) {
      return withOptionalTransaction(handle, outer, async (tx) => {
        const [row] = await tx.insert(eventLog).values({
          tenantId,
          eventType: event.eventType,
          moduleId: event.moduleId,
          entityId: event.entityId,
          recordId: event.recordId,
          actorId: event.actorId,
          correlationId: event.correlationId,
          payload: event.payload ?? {},
        }).returning();
        return row;
      });
    },
    async createScopedRecord(moduleId: string, entityId: string, data: Record<string, unknown>, createdBy?: string, uniqueFieldIds: string[] = [], outer?: TenantTransaction) {
      return withOptionalTransaction(handle, outer, async (tx) => {
        const lockValues = uniqueFieldIds.flatMap((fieldId) => {
          const value = data[fieldId];
          return value === undefined || value === null ? [] : [{ fieldId, value }];
        }).sort((a, b) => a.fieldId.localeCompare(b.fieldId));
        for (const { fieldId, value } of lockValues) {
          const lockKey = `nexa-unique:${tenantId}:${moduleId}:${entityId}:${fieldId}:${JSON.stringify(value)}`;
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
        }
        for (const fieldId of uniqueFieldIds) {
          const value = data[fieldId];
          if (value === undefined || value === null) continue;
          const [duplicate] = await tx.select({ id: records.id }).from(records).where(and(scoped(moduleId, entityId), isNull(records.deletedAt), sql`${records.data}->>${fieldId} = ${String(value)}`)).limit(1);
          if (duplicate) throw new RecordConflictError(`Field ${fieldId} must be unique`);
        }
        const [record] = await tx.insert(records).values({ tenantId, moduleId, entityId, data, createdBy }).returning();
        await tx.insert(auditLog).values({ tenantId, actorId: createdBy, action: 'record.created', entityId, recordId: record.id, changes: { after: data } });
        return record;
      });
    },
    async assertReferences(moduleId: string, referenceFields: FieldDefinition[], data: Record<string, unknown>) {
      for (const field of referenceFields) {
        const value = data[field.id];
        if (value === undefined || value === null) continue;
        if (typeof value !== 'string') throw new RecordConflictError(`Reference field ${field.id} must contain a record ID`);
        const [target] = await handle.db.select({ id: records.id }).from(records).where(and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), eq(records.entityId, field.options.referenceEntityId!), eq(records.id, value), isNull(records.deletedAt))).limit(1);
        if (!target) throw new RecordConflictError(`Reference target for field ${field.id} not found`);
      }
    },
    async updateScopedRecord(moduleId: string, entityId: string, recordId: string, data: Record<string, unknown>, expectedVersion?: number, actorId?: string, uniqueFieldIds: string[] = [], outer?: TenantTransaction) {
      return withOptionalTransaction(handle, outer, async (tx) => {
        const [before] = await tx.select().from(records).where(and(scoped(moduleId, entityId), eq(records.id, recordId), isNull(records.deletedAt))).limit(1);
        if (!before) return undefined;
        if (expectedVersion !== undefined && before.version !== expectedVersion) throw new RecordConflictError('Record version is stale');
        const lockValues = uniqueFieldIds.flatMap((fieldId) => {
          const value = data[fieldId];
          return value === undefined || value === null ? [] : [{ fieldId, value }];
        }).sort((a, b) => a.fieldId.localeCompare(b.fieldId));
        for (const { fieldId, value } of lockValues) {
          const lockKey = `nexa-unique:${tenantId}:${moduleId}:${entityId}:${fieldId}:${JSON.stringify(value)}`;
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
        }
        for (const fieldId of uniqueFieldIds) {
          const value = data[fieldId];
          if (value === undefined || value === null) continue;
          const [duplicate] = await tx.select({ id: records.id }).from(records).where(and(scoped(moduleId, entityId), isNull(records.deletedAt), sql`${records.data}->>${fieldId} = ${String(value)}`, sql`${records.id} <> ${recordId}`)).limit(1);
          if (duplicate) throw new RecordConflictError(`Field ${fieldId} must be unique`);
        }
        const [record] = await tx.update(records).set({ data, version: sql`${records.version} + 1`, updatedAt: new Date() }).where(and(scoped(moduleId, entityId), eq(records.id, recordId), eq(records.version, before.version), isNull(records.deletedAt))).returning();
        if (!record) throw new RecordConflictError('Record changed during update; retry the operation');
        await tx.insert(auditLog).values({ tenantId, actorId, action: 'record.updated', entityId, recordId, changes: { before: before.data, after: data } });
        return record;
      });
    },
    async deleteScopedRecord(moduleId: string, entityId: string, recordId: string, relations: RelationDefinition[] = [], actorId?: string) {
      return handle.db.transaction(async (tx) => {
        const [record] = await tx.select().from(records).where(and(scoped(moduleId, entityId), eq(records.id, recordId), isNull(records.deletedAt))).limit(1);
        if (!record) return undefined;
        const applicableRelations = relations.filter((relation) => relation.sourceEntityId === entityId || relation.targetEntityId === entityId);
        for (const relation of applicableRelations) {
          const sides = [
            ...(relation.sourceEntityId === entityId ? [{ column: recordLinks.fromRecordId, id: recordId }] : []),
            ...(relation.targetEntityId === entityId ? [{ column: recordLinks.toRecordId, id: recordId }] : []),
          ];
          for (const side of sides) {
            const links = await tx.select().from(recordLinks).where(and(eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relation.id), eq(side.column, side.id)));
            if (links.length && relation.onDelete === 'restrict') throw new RecordConflictError(`Record is referenced by relation ${relation.id}`);
            if (links.length && relation.onDelete === 'cascade') {
              await tx.delete(recordLinks).where(and(eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relation.id), eq(side.column, side.id)));
            }
          }
        }
        const [deleted] = await tx.update(records).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(scoped(moduleId, entityId), eq(records.id, recordId), isNull(records.deletedAt))).returning();
        if (deleted) await tx.insert(auditLog).values({ tenantId, actorId, action: 'record.deleted', entityId, recordId, changes: { before: record.data } });
        return deleted;
      });
    },
    async listRelationTargets(moduleId: string, entityId: string, relation: RelationDefinition, fromRecordId: string) {
      const endpoint = await handle.db.select({ id: records.id }).from(records).where(and(scoped(moduleId, entityId), eq(records.id, fromRecordId), isNull(records.deletedAt))).limit(1);
      if (!endpoint[0]) return undefined;
      const reverse = relation.targetEntityId === entityId && relation.sourceEntityId !== entityId;
      const fromId = reverse ? undefined : fromRecordId;
      const toId = reverse ? fromRecordId : undefined;
      const links = await handle.db.select().from(recordLinks).where(and(
        eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relation.id),
        fromId ? eq(recordLinks.fromRecordId, fromId) : undefined,
        toId ? eq(recordLinks.toRecordId, toId) : undefined,
      ));
      const endpointIds = reverse ? links.map((link) => link.fromRecordId) : links.map((link) => link.toRecordId);
      const liveEndpoints = endpointIds.length ? await handle.db.select({ id: records.id }).from(records).where(and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), eq(records.entityId, reverse ? relation.sourceEntityId : relation.targetEntityId), inArray(records.id, endpointIds), isNull(records.deletedAt))) : [];
      const liveIds = new Set(liveEndpoints.map((row) => row.id));
      const ids = endpointIds.filter((id) => liveIds.has(id));
      if (ids.length !== endpointIds.length) await handle.db.delete(recordLinks).where(and(eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relation.id), inArray(reverse ? recordLinks.fromRecordId : recordLinks.toRecordId, endpointIds.filter((id) => !liveIds.has(id)))));
      if (!ids.length) return [];
      return handle.db.select().from(records).where(and(
        eq(records.tenantId, tenantId), eq(records.moduleId, moduleId),
        eq(records.entityId, reverse ? relation.sourceEntityId : relation.targetEntityId),
        inArray(records.id, ids), isNull(records.deletedAt),
      ));
    },
    async createRelationLink(moduleId: string, relation: RelationDefinition, fromRecordId: string, toRecordId: string) {
      return handle.db.transaction(async (tx) => {
        const [source] = await tx.select({ id: records.id }).from(records).where(and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), eq(records.entityId, relation.sourceEntityId), eq(records.id, fromRecordId), isNull(records.deletedAt))).limit(1);
        const [target] = await tx.select({ id: records.id }).from(records).where(and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), eq(records.entityId, relation.targetEntityId), eq(records.id, toRecordId), isNull(records.deletedAt))).limit(1);
        if (!source || !target) throw new RecordConflictError('Relation endpoints must be live records of the configured entities');
        const lockIds = [...new Set([fromRecordId, toRecordId])].sort();
        await tx.select({ id: records.id }).from(records).where(and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), inArray(records.id, lockIds))).orderBy(records.id).for('update');
        const existing = await tx.select().from(recordLinks).where(and(eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relation.id), eq(recordLinks.fromRecordId, fromRecordId), eq(recordLinks.toRecordId, toRecordId))).limit(1);
        if (existing[0]) return existing[0];
        const uniqueTargets = relation.type === 'oneToOne' || relation.type === 'oneToMany';
        const uniqueSources = relation.type === 'oneToOne' || relation.type === 'manyToOne';
        const sourceUnique = uniqueSources ? [eq(recordLinks.fromRecordId, fromRecordId)] : [];
        const targetUnique = uniqueTargets ? [eq(recordLinks.toRecordId, toRecordId)] : [];
        if (sourceUnique.length || targetUnique.length) {
          const [conflict] = await tx.select().from(recordLinks).where(and(eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relation.id), ...sourceUnique, ...targetUnique)).limit(1);
          if (conflict) throw new RecordConflictError(`Relation ${relation.id} cardinality limit exceeded`);
        } /* Cardinality checks execute after endpoint locks to serialize concurrent links. */
        const [link] = await tx.insert(recordLinks).values({ tenantId, relationId: relation.id, fromRecordId, toRecordId }).returning();
        return link;
      });
    },
    async unlinkRelation(moduleId: string, relation: RelationDefinition, fromRecordId: string, toRecordId: string) {
      const [source] = await handle.db.select({ id: records.id }).from(records).where(and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), eq(records.entityId, relation.sourceEntityId), eq(records.id, fromRecordId))).limit(1);
      if (!source) return undefined;
      const [link] = await handle.db.delete(recordLinks).where(and(eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relation.id), eq(recordLinks.fromRecordId, fromRecordId), eq(recordLinks.toRecordId, toRecordId))).returning();
      return link;
    },
    async listRecordActivity(entityId: string, recordId: string, options: { limit?: number; offset?: number } = {}) {
      const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
      const offset = Math.max(options.offset ?? 0, 0);
      const where = and(eq(auditLog.tenantId, tenantId), eq(auditLog.entityId, entityId), eq(auditLog.recordId, recordId));
      const items = await handle.db.select().from(auditLog).where(where).orderBy(desc(auditLog.occurredAt)).limit(limit).offset(offset);
      const [countRow] = await handle.db.select({ total: count() }).from(auditLog).where(where);
      return { items, total: countRow?.total ?? 0 };
    },
    async createLink(relationId: string, fromRecordId: string, toRecordId: string) { return handle.db.transaction(async (tx) => { const ids = new Set([fromRecordId, toRecordId]); const linked = await tx.select({ id: records.id }).from(records).where(and(eq(records.tenantId, tenantId), inArray(records.id, [...ids]), isNull(records.deletedAt))); if (linked.length !== ids.size) throw new RecordConflictError('Both linked records must belong to the current tenant'); const [link] = await tx.insert(recordLinks).values({ tenantId, relationId, fromRecordId, toRecordId }).returning(); return link; }); },
    async listLinks(relationId: string, fromRecordId: string) { return handle.db.select().from(recordLinks).where(and(eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relationId), eq(recordLinks.fromRecordId, fromRecordId))); },
    async deleteLink(relationId: string, fromRecordId: string, toRecordId: string) { const [link] = await handle.db.delete(recordLinks).where(and(eq(recordLinks.tenantId, tenantId), eq(recordLinks.relationId, relationId), eq(recordLinks.fromRecordId, fromRecordId), eq(recordLinks.toRecordId, toRecordId))).returning(); return link; },
  };
}
export async function ensureSystemTenant(handle: DbHandle): Promise<void> { await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' }).onConflictDoNothing({ target: tenants.id }); }
