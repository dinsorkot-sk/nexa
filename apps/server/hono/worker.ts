import { automationRepository, createTenantContext, definitionRepository, outboxRepository, type DbHandle } from '@nexa/db';
import type { OutboxRow } from '@nexa/db';
import { dispatchAutomations } from '../../../packages/engine/automation/dispatch';
import { deliverWebhook } from '../../../integrations/webhook/src/index';
import { sendNotification } from '../../../integrations/email/src/index';
import { NotificationActionConfigSchema, WebhookActionConfigSchema, type ActionDefinition, type WebhookActionConfig } from '@nexa/meta';
import type { AppDependencies } from './shared';
import { automationJobKind, type AutomationJobPayload } from './jobs';

/**
 * Processes one job. Returns the job's outcome; never throws, so one bad row cannot stop the loop.
 * Delivery is at-least-once: a crash after a webhook is sent but before `complete` will resend it.
 * Receivers dedupe on the X-Nexa-Delivery-Id header, which carries the outbox id.
 */
export async function processOutboxRow(db: DbHandle, row: OutboxRow, deps: AppDependencies): Promise<'done' | 'retry' | 'dead'> {
  const outbox = outboxRepository(db);
  try {
    if (row.kind !== automationJobKind) throw new Error(`Unknown job kind "${row.kind}"`);
    const job = row.payload as unknown as AutomationJobPayload;
    if (job.tenantId !== row.tenantId) throw new Error('Job tenant does not match its outbox row');

    const ctx = createTenantContext(job.tenantId);
    const defs = definitionRepository(db, ctx);
    const runs = automationRepository(db, ctx);
    await dispatchAutomations({
      listAutomations: (moduleId) => defs.listAutomations(moduleId),
      listActions: (moduleId) => defs.listActions(moduleId),
      runs,
      deliver: async (action: ActionDefinition, context) => {
        if (action.kind === 'webhook') {
          const parsed: WebhookActionConfig = WebhookActionConfigSchema.parse(action.config);
          // The outbox id is the delivery id: receivers dedupe on it, which makes at-least-once delivery safe.
          const config: WebhookActionConfig = { ...parsed, headers: { ...parsed.headers, 'X-Nexa-Delivery-Id': row.id } };
          await deliverWebhook(config, {
            event: context.event,
            automationId: context.automationId,
            actorId: context.actorId,
          }, deps.webhookTransport);
        } else if (action.kind === 'notification') {
          await sendNotification(NotificationActionConfigSchema.parse(action.config), deps.emailTransport);
        }
      },
    }, job.moduleId, job.event, job.actorId);

    await outbox.complete({ tenantId: row.tenantId, id: row.id });
    return 'done';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outcome = await outbox.fail({ tenantId: row.tenantId, id: row.id, error: message });
    return outcome === 'dead' ? 'dead' : 'retry';
  }
}

/** Claims and processes one batch. Returns how many rows were handled. */
export async function runWorkerOnce(db: DbHandle, deps: AppDependencies, limit = 10): Promise<number> {
  const rows = await outboxRepository(db).claim({ limit });
  for (const row of rows) await processOutboxRow(db, row, deps);
  return rows.length;
}

/** Polls until `signal` aborts. Sleeps only when idle, so a busy queue drains without waiting. */
export async function runWorkerLoop(db: DbHandle, deps: AppDependencies, signal: AbortSignal, idleMs = 1_000): Promise<void> {
  while (!signal.aborted) {
    const handled = await runWorkerOnce(db, deps);
    if (handled === 0) await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, idleMs);
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}
