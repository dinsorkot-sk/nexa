import { createTenantContext, definitionRepository, moduleRepository, organizationRepository, outboxRepository, type DbHandle } from '@nexa/db';
import { selectScheduledAutomations } from '../../../packages/engine/automation/index';
import { scheduledAutomationJobKind, type ScheduledAutomationJobPayload } from './jobs';

/**
 * Enqueues the automations whose schedule matches the given instant.
 *
 * The work is enqueued rather than run here, so it goes through the same
 * durable outbox as every other automation: a crash between the schedule
 * matching and the delivery leaves the job pending, and the worker picks it
 * up. The dedupe key carries the minute, so the same automation cannot be
 * enqueued twice for one minute, however often the scheduler runs.
 *
 * A minute that passes while the scheduler is down is not made up for: a
 * schedule that missed its minute is late, not repeated.
 */
export async function runSchedulerOnce(db: DbHandle, at = new Date()): Promise<number> {
  const outbox = outboxRepository(db);
  const minute = at.toISOString().slice(0, 16);
  let enqueued = 0;
  for (const tenantId of await organizationRepository(db).listTenantIds()) {
    const context = createTenantContext(tenantId);
    const definitions = definitionRepository(db, context);
    for (const module of await moduleRepository(db, context).list()) {
      const automations = await definitions.listAutomations(module.id);
      for (const automation of selectScheduledAutomations(automations, at)) {
        const payload: ScheduledAutomationJobPayload = {
          tenantId,
          moduleId: module.id,
          automationId: automation.id,
          scheduledAt: at.toISOString(),
        };
        const result = await outbox.enqueue(db.db, {
          tenantId,
          kind: scheduledAutomationJobKind,
          payload: payload as unknown as Record<string, unknown>,
          dedupeKey: `schedule:${module.id}:${automation.id}:${minute}`,
        });
        if (result.inserted) enqueued += 1;
      }
    }
  }
  return enqueued;
}

/**
 * Runs the scheduler on every minute boundary, and skips the minutes that
 * have already been covered. The loop the worker runs is driven by the queue,
 * so the scheduler cannot wait for it.
 */
export function startScheduler(db: DbHandle, signal: AbortSignal, now: () => Date = () => new Date()): { stop: () => void } {
  let lastMinute = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (signal.aborted) return;
    const at = now();
    const minute = at.toISOString().slice(0, 16);
    if (minute !== lastMinute) {
      lastMinute = minute;
      try {
        await runSchedulerOnce(db, at);
      } catch (error) {
        console.error('Scheduler pass failed', error);
      }
    }
    const delay = 60_000 - (at.getUTCSeconds() * 1_000 + at.getUTCMilliseconds());
    timer = setTimeout(() => { void tick(); }, delay);
    signal.addEventListener('abort', () => { if (timer) clearTimeout(timer); }, { once: true });
  };
  void tick();
  return { stop: () => { if (timer) clearTimeout(timer); } };
}
