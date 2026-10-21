import type { AutomationEvent } from '../../../packages/engine/automation/index';

/** Job kinds stored in the outbox. Defined here so producers and the worker share one constant without a cycle. */
export const automationJobKind = 'automation.dispatch';
/** A scheduled automation that came due. One job per automation per minute. */
export const scheduledAutomationJobKind = 'automation.schedule';

/** Payload stored with each automation job. Plain JSON, so it survives a worker restart. */
export interface AutomationJobPayload {
  tenantId: string;
  moduleId: string;
  event: AutomationEvent;
  actorId?: string;
}

/** Payload stored with a scheduled automation job. */
export interface ScheduledAutomationJobPayload {
  tenantId: string;
  moduleId: string;
  automationId: string;
  /** The instant the schedule matched, as an ISO timestamp. */
  scheduledAt: string;
  actorId?: string;
}
