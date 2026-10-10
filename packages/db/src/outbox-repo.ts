import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbHandle } from './client';
import type { TenantTransaction } from './tenancy';
import { outbox, type OutboxRow } from './schema';

/** Lease length for a claimed row. A worker that dies mid-job loses the lease and the row is reclaimed. */
export const outboxLeaseMs = 60_000;
/** Backoff: base * 2^attempts, capped. */
export const outboxBackoffBaseMs = 1_000;
export const outboxBackoffCapMs = 15 * 60_000;

export function backoffDelayMs(attempts: number): number {
  return Math.min(outboxBackoffCapMs, outboxBackoffBaseMs * 2 ** Math.max(0, attempts));
}

/**
 * Durable outbox. `enqueue` takes the caller's transaction so the job commits or rolls back with the
 * change that produced it. `claim` locks ready rows with FOR UPDATE SKIP LOCKED so concurrent workers
 * never receive the same job, and the lease lets a crashed worker's rows be reclaimed later.
 */
export function outboxRepository(handle: DbHandle) {
  return {
    /**
     * Inserts a job. A repeated dedupeKey for the same tenant is a no-op, so retrying the producing
     * request cannot enqueue the same automation run twice.
     */
    async enqueue(
      tx: TenantTransaction | DbHandle['db'],
      input: { tenantId: string; kind: string; payload: Record<string, unknown>; dedupeKey: string; maxAttempts?: number },
    ): Promise<{ inserted: boolean }> {
      const rows = await tx.insert(outbox).values({
        tenantId: input.tenantId,
        kind: input.kind,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
        maxAttempts: input.maxAttempts ?? 5,
      }).onConflictDoNothing({ target: [outbox.tenantId, outbox.dedupeKey] }).returning();
      return { inserted: rows.length > 0 };
    },

    /**
     * Claims up to `limit` ready rows across all tenants. Ready means pending and due, or processing with an
     * expired lease. This is platform-level work, so the worker reads every tenant and each row keeps its own
     * tenantId for delivery. Rows are locked during the claim and leased for `outboxLeaseMs` afterwards.
     */
    async claim(input: { limit: number; now?: Date }): Promise<OutboxRow[]> {
      const now = input.now ?? new Date();
      return handle.db.transaction(async (tx) => {
        const candidates = await tx.select({ id: outbox.id, tenantId: outbox.tenantId }).from(outbox)
          .where(and(
            sql`(${outbox.status} = 'pending' AND ${outbox.availableAt} <= ${now}) OR (${outbox.status} = 'processing' AND ${outbox.lockedUntil} <= ${now})`,
          ))
          .orderBy(asc(outbox.availableAt), asc(outbox.id))
          .limit(input.limit)
          .for('update', { skipLocked: true });
        if (!candidates.length) return [];

        const leaseUntil = new Date(now.getTime() + outboxLeaseMs);
        const claimed: OutboxRow[] = [];
        for (const candidate of candidates) {
          const [row] = await tx.update(outbox).set({
            status: 'processing',
            lockedUntil: leaseUntil,
            updatedAt: now,
          }).where(and(eq(outbox.tenantId, candidate.tenantId), eq(outbox.id, candidate.id))).returning();
          if (row) claimed.push(row);
        }
        return claimed;
      });
    },

    /**
     * Marks a claimed job done. Only a row still leased to this worker can complete: if the lease expired
     * and another worker reclaimed the job, this call returns false and the row is left alone.
     */
    async complete(input: { tenantId: string; id: string; now?: Date }): Promise<boolean> {
      const now = input.now ?? new Date();
      const rows = await handle.db.update(outbox).set({ status: 'done', lockedUntil: null, updatedAt: now })
        .where(and(
          eq(outbox.tenantId, input.tenantId),
          eq(outbox.id, input.id),
          eq(outbox.status, 'processing'),
          sql`${outbox.lockedUntil} > ${now}`,
        ))
        .returning();
      return rows.length > 0;
    },

    /**
     * Records a failed attempt. Schedules a retry with capped exponential backoff, or moves the row to
     * `dead` once it has used `maxAttempts`. Dead rows are kept for inspection, never deleted.
     */
    async fail(input: { tenantId: string; id: string; error: string; now?: Date }): Promise<'retry' | 'dead' | 'missing'> {
      const now = input.now ?? new Date();
      return handle.db.transaction(async (tx) => {
        const [row] = await tx.select().from(outbox)
          .where(and(eq(outbox.tenantId, input.tenantId), eq(outbox.id, input.id)))
          .for('update').limit(1);
        if (!row) return 'missing';
        const attempts = row.attempts + 1;
        if (attempts >= row.maxAttempts) {
          await tx.update(outbox).set({ status: 'dead', attempts, lastError: input.error, lockedUntil: null, updatedAt: now })
            .where(and(eq(outbox.tenantId, input.tenantId), eq(outbox.id, input.id)));
          return 'dead';
        }
        await tx.update(outbox).set({
          status: 'pending',
          attempts,
          lastError: input.error,
          lockedUntil: null,
          availableAt: new Date(now.getTime() + backoffDelayMs(attempts)),
          updatedAt: now,
        }).where(and(eq(outbox.tenantId, input.tenantId), eq(outbox.id, input.id)));
        return 'retry';
      });
    },

    /** Read-only view for operations and tests. Filtering by status keeps it bounded. */
    async listByStatus(statuses: Array<'pending' | 'processing' | 'done' | 'dead'>, limit = 100) {
      return handle.db.select().from(outbox).where(inArray(outbox.status, statuses)).orderBy(asc(outbox.createdAt)).limit(limit);
    },
  };
}
