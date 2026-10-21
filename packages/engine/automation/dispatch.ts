import type { ActionDefinition, AutomationDefinition } from '../../meta/src/index';
import { selectAutomations, type AutomationEvent } from './index';

/** Ports the engine needs. Callers supply persistence and delivery so the engine stays free of integrations. */
export interface DispatchPorts {
  listAutomations(moduleId: string): Promise<AutomationDefinition[]>;
  listActions(moduleId: string): Promise<ActionDefinition[]>;
  runs: {
    start(input: { moduleId: string; automationId: string; triggerType: string; recordId?: string; correlationId?: string }): Promise<{ id: string }>;
    retry(id: string, attempt: number, lastError?: string): Promise<unknown>;
    finish(id: string, status: 'succeeded' | 'failed', lastError?: string): Promise<unknown>;
  };
  deliver(action: ActionDefinition, context: { event: AutomationEvent; automationId: string; actorId?: string }): Promise<void>;
}

/**
 * Runs one automation: one run, its deliveries retried up to `retry.maxAttempts`,
 * and the outcome recorded. Never throws.
 */
async function runAutomation(
  ports: DispatchPorts,
  automation: AutomationDefinition,
  actions: ActionDefinition[],
  context: { moduleId: string; event: AutomationEvent; actorId?: string; correlationId?: string },
): Promise<void> {
  const run = await ports.runs.start({
    moduleId: context.moduleId,
    automationId: automation.id,
    triggerType: automation.trigger.type,
    recordId: context.event.recordId,
    correlationId: context.correlationId,
  });
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= automation.retry.maxAttempts + 1; attempt += 1) {
    try {
      for (const ref of automation.actions) {
        const action = actions.find((candidate) => candidate.id === ref.actionId);
        if (!action) continue;
        await ports.deliver(action, { event: context.event, automationId: automation.id, actorId: context.actorId });
      }
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt <= automation.retry.maxAttempts) await ports.runs.retry(run.id, attempt + 1, lastError);
    }
  }
  await ports.runs.finish(run.id, lastError === undefined ? 'succeeded' : 'failed', lastError);
}

/**
 * Fires automations for an event. Each matched automation is one run; failed deliveries
 * are retried up to `retry.maxAttempts` and recorded. Never throws.
 */
export async function dispatchAutomations(ports: DispatchPorts, moduleId: string, event: AutomationEvent, actorId?: string, jobId?: string) {
  const [automations, actions] = await Promise.all([ports.listAutomations(moduleId), ports.listActions(moduleId)]);
  const matched = selectAutomations(automations, { ...event, moduleId, actorId });
  for (const automation of matched) {
    await runAutomation(ports, automation, actions, { moduleId, event: { ...event, moduleId, actorId }, actorId, correlationId: jobId });
  }
}

/**
 * Fires one scheduled automation. The scheduler decided that the schedule
 * matched, so the cron is not checked again here: the job may be delivered a
 * moment after the minute it was scheduled for.
 */
export async function dispatchScheduledAutomation(ports: DispatchPorts, moduleId: string, automationId: string, at: Date, actorId?: string, jobId?: string) {
  const [automations, actions] = await Promise.all([ports.listAutomations(moduleId), ports.listActions(moduleId)]);
  const automation = automations.find((candidate) => candidate.id === automationId);
  if (!automation || !automation.enabled) return 0;
  const event: AutomationEvent = { type: 'scheduled', scheduledAt: at.toISOString(), moduleId };
  await runAutomation(ports, automation, actions, { moduleId, event, actorId, correlationId: jobId });
  return 1;
}
