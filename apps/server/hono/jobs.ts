import type { AutomationEvent } from '../../../packages/engine/automation/index';

/** Job kinds stored in the outbox. Defined here so producers and the worker share one constant without a cycle. */
export const automationJobKind = 'automation.dispatch';

/** Payload stored with each automation job. Plain JSON, so it survives a worker restart. */
export interface AutomationJobPayload {
  tenantId: string;
  moduleId: string;
  event: AutomationEvent;
  actorId?: string;
}
