import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { DbHandle } from './client';
import type { TenantContext } from './tenancy';
import { auditLog, automationRuns, eventLog, modules, records } from './schema';

/**
 * Read-only audit and observability access. All queries are tenant-scoped and
 * bounded; this surface never exposes another tenant's rows.
 */
export function auditRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;

  return {
    async listAuditLog(options: { action?: string; entityId?: string; recordId?: string; actorId?: string; limit?: number; offset?: number } = {}) {
      const predicates = [eq(auditLog.tenantId, tenantId)];
      if (options.action) predicates.push(eq(auditLog.action, options.action));
      if (options.entityId) predicates.push(eq(auditLog.entityId, options.entityId));
      if (options.recordId) predicates.push(eq(auditLog.recordId, options.recordId));
      if (options.actorId) predicates.push(eq(auditLog.actorId, options.actorId));
      const where = and(...predicates);
      const [totalRow] = await handle.db.select({ total: sql<number>`count(*)::int` }).from(auditLog).where(where);
      const items = await handle.db.select().from(auditLog).where(where)
        .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
        .limit(Math.min(options.limit ?? 50, 200)).offset(options.offset ?? 0);
      return { items, total: Number(totalRow?.total ?? 0) };
    },

    async listEvents(options: { eventType?: string; moduleId?: string; limit?: number; offset?: number } = {}) {
      const predicates = [eq(eventLog.tenantId, tenantId)];
      if (options.eventType) predicates.push(eq(eventLog.eventType, options.eventType));
      if (options.moduleId) predicates.push(eq(eventLog.moduleId, options.moduleId));
      const where = and(...predicates);
      const [totalRow] = await handle.db.select({ total: sql<number>`count(*)::int` }).from(eventLog).where(where);
      const items = await handle.db.select().from(eventLog).where(where)
        .orderBy(desc(eventLog.occurredAt), desc(eventLog.id))
        .limit(Math.min(options.limit ?? 50, 200)).offset(options.offset ?? 0);
      return { items, total: Number(totalRow?.total ?? 0) };
    },

    /** Aggregated operational counters for the tenant; each count is bounded by one indexed scan. */
    async operationsStats(since?: Date) {
      const sinceClause = since ? gte(auditLog.occurredAt, since) : undefined;
      const [modulesRow] = await handle.db.select({ total: sql<number>`count(*)::int` }).from(modules).where(eq(modules.tenantId, tenantId));
      const [recordsRow] = await handle.db.select({ total: sql<number>`count(*)::int` }).from(records).where(and(eq(records.tenantId, tenantId), sql`${records.deletedAt} IS NULL`));
      const [auditRow] = await handle.db.select({ total: sql<number>`count(*)::int` }).from(auditLog).where(sinceClause ? and(eq(auditLog.tenantId, tenantId), sinceClause) : eq(auditLog.tenantId, tenantId));
      const [eventsRow] = await handle.db.select({ total: sql<number>`count(*)::int` }).from(eventLog).where(eq(eventLog.tenantId, tenantId));
      const automationFailures = await handle.db.select({ automationId: automationRuns.automationId, failures: sql<number>`count(*)::int` })
        .from(automationRuns)
        .where(and(eq(automationRuns.tenantId, tenantId), eq(automationRuns.status, 'failed')))
        .groupBy(automationRuns.automationId);
      return {
        modules: Number(modulesRow?.total ?? 0),
        records: Number(recordsRow?.total ?? 0),
        auditEntries: Number(auditRow?.total ?? 0),
        events: Number(eventsRow?.total ?? 0),
        failedAutomations: automationFailures.map((row) => ({ automationId: row.automationId, failures: Number(row.failures) })),
      };
    },
  };
}
