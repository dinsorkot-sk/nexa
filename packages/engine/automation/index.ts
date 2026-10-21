import type { ActionDefinition, AutomationDefinition } from '../../meta/src/index';
import { matchesCron } from './cron';

export interface AutomationEvent {
  type: 'event' | 'record' | 'workflow' | 'scheduled';
  eventType?: string;
  entityId?: string;
  recordId?: string;
  operation?: 'created' | 'updated' | 'deleted';
  workflowId?: string;
  transitionId?: string;
  moduleId?: string;
  actorId?: string;
  /** The instant a schedule fired, for a scheduled event. */
  scheduledAt?: string;
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

/**
 * Returns the enabled automations whose schedule matches the given instant.
 * A trigger whose cron expression is malformed never matches; the scheduler
 * records the failure rather than firing it.
 */
export function selectScheduledAutomations(automations: AutomationDefinition[], at: Date): AutomationDefinition[] {
  return automations.filter((automation) => {
    if (!automation.enabled) return false;
    const trigger = automation.trigger;
    if (trigger.type !== 'scheduled') return false;
    try {
      return matchesCron(trigger.cron, at, trigger.timezone);
    } catch {
      return false;
    }
  });
}

/** Delivery action kinds executed this phase; others are skipped until their phase. */
export const supportedDeliveryKinds = ['notification', 'webhook'] as const;

export function deliveryError(action: ActionDefinition, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Action "${action.id}" (${action.kind}) failed: ${message}`;
}
