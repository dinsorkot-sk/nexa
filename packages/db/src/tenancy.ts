import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbHandle } from './client';
import { auditLog, recordLinks, records, tenants } from './schema';

export const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export interface TenantContext {
  readonly tenantId: string;
}

export function createTenantContext(tenantId: string): TenantContext {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error('Invalid tenant ID');
  }
  return Object.freeze({ tenantId });
}

export function tenantRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;
  return {
    async listRecords(entityId: string) {
      return handle.db.select().from(records).where(and(
        eq(records.tenantId, tenantId),
        eq(records.entityId, entityId),
        isNull(records.deletedAt),
      ));
    },
    async getRecord(entityId: string, recordId: string) {
      const [record] = await handle.db.select().from(records).where(and(
        eq(records.tenantId, tenantId),
        eq(records.entityId, entityId),
        eq(records.id, recordId),
        isNull(records.deletedAt),
      )).limit(1);
      return record;
    },
    async createRecord(entityId: string, data: Record<string, unknown>, createdBy?: string) {
      return handle.db.transaction(async (tx) => {
        const [record] = await tx.insert(records).values({ tenantId, entityId, data, createdBy }).returning();
        await tx.insert(auditLog).values({
          tenantId,
          actorId: createdBy,
          action: 'record.created',
          entityId,
          recordId: record.id,
          changes: { after: data },
        });
        return record;
      });
    },
    async updateRecord(entityId: string, recordId: string, data: Record<string, unknown>) {
      return handle.db.transaction(async (tx) => {
        const [record] = await tx.update(records).set({
          data,
          version: sql`${records.version} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(records.tenantId, tenantId),
          eq(records.entityId, entityId),
          eq(records.id, recordId),
          isNull(records.deletedAt),
        )).returning();
        if (!record) return undefined;
        await tx.insert(auditLog).values({
          tenantId,
          action: 'record.updated',
          entityId,
          recordId,
          changes: { after: data },
        });
        return record;
      });
    },
    async deleteRecord(entityId: string, recordId: string) {
      return handle.db.transaction(async (tx) => {
        const [record] = await tx.update(records).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(
          eq(records.tenantId, tenantId),
          eq(records.entityId, entityId),
          eq(records.id, recordId),
          isNull(records.deletedAt),
        )).returning();
        if (record) {
          await tx.insert(auditLog).values({
            tenantId,
            action: 'record.deleted',
            entityId,
            recordId,
            changes: { before: record.data },
          });
        }
        return record;
      });
    },
    async createLink(relationId: string, fromRecordId: string, toRecordId: string) {
      return handle.db.transaction(async (tx) => {
        const requiredIds = new Set([fromRecordId, toRecordId]);
        const linkedRecords = await tx.select({ id: records.id }).from(records).where(and(
          eq(records.tenantId, tenantId),
          inArray(records.id, [...requiredIds]),
          isNull(records.deletedAt),
        ));
        if (linkedRecords.length !== requiredIds.size) throw new Error('Both linked records must belong to the current tenant');
        const [link] = await tx.insert(recordLinks).values({ tenantId, relationId, fromRecordId, toRecordId }).returning();
        return link;
      });
    },
    async getRecordById(recordId: string) {
      const [record] = await handle.db.select().from(records).where(and(
        eq(records.tenantId, tenantId),
        eq(records.id, recordId),
        isNull(records.deletedAt),
      )).limit(1);
      return record;
    },
    async listRecordsByIds(recordIds: string[]) {
      if (recordIds.length === 0) return [];
      return handle.db.select().from(records).where(and(
        eq(records.tenantId, tenantId),
        inArray(records.id, recordIds),
        isNull(records.deletedAt),
      ));
    },
    async listLinks(relationId: string, fromRecordId: string) {
      return handle.db.select().from(recordLinks).where(and(
        eq(recordLinks.tenantId, tenantId),
        eq(recordLinks.relationId, relationId),
        eq(recordLinks.fromRecordId, fromRecordId),
      ));
    },
  };
}

export async function ensureSystemTenant(handle: DbHandle): Promise<void> {
  await handle.db.insert(tenants).values({
    id: SYSTEM_TENANT_ID,
    slug: 'system',
    name: 'System',
  }).onConflictDoNothing({ target: tenants.id });
}
