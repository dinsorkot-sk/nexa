import type { ActionDefinition, AutomationDefinition } from '../../meta/src/index';

export interface AutomationEvent {
  type: 'event' | 'record' | 'workflow';
  eventType?: string;
  entityId?: string;
  recordId?: string;
  operation?: 'created' | 'updated' | 'deleted';
  workflowId?: string;
  transitionId?: string;
  moduleId?: string;
  actorId?: string;
  payload?: Record<string, unknown>;
}

/** Returns automations whose trigger matches the event. Scheduled triggers never match runtime events. */
export function selectAutomations(automations: AutomationDefinition[], event: AutomationEvent): AutomationDefinition[] {
  return automations.filter((automation) => {
    if (!automation.enabled) return false;
    const trigger = automation.trigger;
    if (trigger.type === 'scheduled') return false;
    if (trigger.type === 'event') return event.type === 'event' && trigger.event === event.eventType;
    if (trigger.type === 'record') {
      return event.type === 'record'
        && trigger.entityId === event.entityId
        && trigger.operation === event.operation;
    }
    if (event.type === 'workflow') {
      return trigger.workflowId === event.workflowId
        && (trigger.transitionId === undefined || trigger.transitionId === event.transitionId);
    }
    return false;
  });
}

/** Delivery action kinds executed this phase; others are skipped until their phase. */
export const supportedDeliveryKinds = ['notification', 'webhook'] as const;

export function deliveryError(action: ActionDefinition, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Action "${action.id}" (${action.kind}) failed: ${message}`;
}
