import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from './client';
import type { TenantContext } from './tenancy';
import { automationRuns } from './schema';

export type AutomationRunStatus = 'succeeded' | 'failed' | 'skipped';

/** Records one execution attempt of an automation, including retries, as the delivery source of truth. */
export function automationRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;
  const db = handle.db;

  async function start(input: { moduleId: string; automationId: string; triggerType: string; recordId?: string; correlationId?: string }) {
    const [row] = await db.insert(automationRuns).values({
      tenantId,
      moduleId: input.moduleId,
      automationId: input.automationId,
      triggerType: input.triggerType,
      status: 'running',
      attempts: 1,
      correlationId: input.correlationId,
      recordId: input.recordId,
    }).returning();
    return row;
  }

  async function finish(id: string, status: AutomationRunStatus, lastError?: string) {
    const [row] = await db.update(automationRuns).set({
      status,
      lastError: lastError ?? null,
      updatedAt: new Date(),
    }).where(and(eq(automationRuns.tenantId, tenantId), eq(automationRuns.id, id))).returning();
    return row;
  }

  return {
    start,
    finish,
    /**
     * Closes runs left `running` by an earlier worker that died mid-job. Scoped to one job id, which the
     * run stores as its correlation id, so unrelated runs are untouched. Returns how many runs were closed.
     */
    async closeOrphans(jobId: string, reason: string): Promise<number> {
      const rows = await db.update(automationRuns).set({
        status: 'failed',
        lastError: reason,
        updatedAt: new Date(),
      }).where(and(
        eq(automationRuns.tenantId, tenantId),
        eq(automationRuns.correlationId, jobId),
        eq(automationRuns.status, 'running'),
      )).returning();
      return rows.length;
    },
    /** Records a retry attempt against the same run row. */
    async retry(id: string, attempt: number, lastError?: string) {
      const [row] = await db.update(automationRuns).set({
        attempts: attempt,
        lastError: lastError ?? null,
        updatedAt: new Date(),
      }).where(and(eq(automationRuns.tenantId, tenantId), eq(automationRuns.id, id))).returning();
      return row;
    },
    async list(moduleId: string, options: { automationId?: string; limit?: number; offset?: number } = {}) {
      const where = and(
        eq(automationRuns.tenantId, tenantId),
        eq(automationRuns.moduleId, moduleId),
        ...(options.automationId ? [eq(automationRuns.automationId, options.automationId)] : []),
      );
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(automationRuns).where(where);
      const items = await db.select().from(automationRuns).where(where)
        .orderBy(desc(automationRuns.createdAt), desc(automationRuns.id))
        .limit(Math.min(options.limit ?? 50, 200)).offset(options.offset ?? 0);
      return { items, total: Number(total ?? 0) };
    },
    async get(moduleId: string, id: string) {
      const [row] = await db.select().from(automationRuns)
        .where(and(eq(automationRuns.tenantId, tenantId), eq(automationRuns.moduleId, moduleId), eq(automationRuns.id, id)))
        .limit(1);
      return row;
    },
  };
}

/** Test/in-memory transport sink so integrations can record deliveries without a network call. */
export interface AutomationDeliveries {
  record(delivery: { kind: 'webhook' | 'notification'; target: string; payload: unknown }): Promise<void>;
}
