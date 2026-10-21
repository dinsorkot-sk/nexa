import { describe, expect, it } from 'vitest';
import type { AutomationDefinition } from '../../meta/src/index';
import { selectAutomations, type AutomationEvent } from './index';

function automation(partial: Partial<AutomationDefinition>): AutomationDefinition {
  return {
    id: 'a1', moduleId: 'm', name: 'n', enabled: true,
    trigger: { type: 'event', event: 'record.created' },
    actions: [{ actionId: 'act', input: {} }],
    retry: { maxAttempts: 3 },
    ...partial,
  } as AutomationDefinition;
}

describe('selectAutomations', () => {
  const event: AutomationEvent = { type: 'event', eventType: 'record.created' };

  it('matches event triggers only when enabled and the event type equals', () => {
    const automations = [
      automation({ id: 'match' }),
      automation({ id: 'off', enabled: false }),
      automation({ id: 'other', trigger: { type: 'event', event: 'record.updated' } }),
      automation({ id: 'sched', trigger: { type: 'scheduled', cron: '* * * * *', timezone: 'UTC' } }),
    ];
    expect(selectAutomations(automations, event).map((a) => a.id)).toEqual(['match']);
  });

  it('matches record triggers on entity and operation', () => {
    const record: AutomationEvent = { type: 'record', entityId: 'vehicle', operation: 'created' };
    const automations = [
      automation({ id: 'hit', trigger: { type: 'record', entityId: 'vehicle', operation: 'created' } }),
      automation({ id: 'wrong-op', trigger: { type: 'record', entityId: 'vehicle', operation: 'updated' } }),
      automation({ id: 'wrong-entity', trigger: { type: 'record', entityId: 'other', operation: 'created' } }),
    ];
    expect(selectAutomations(automations, record).map((a) => a.id)).toEqual(['hit']);
  });

  it('matches workflow triggers with optional transition filter', () => {
    const wf: AutomationEvent = { type: 'workflow', workflowId: 'lifecycle', transitionId: 'finish' };
    const automations = [
      automation({ id: 'any', trigger: { type: 'workflow', workflowId: 'lifecycle' } }),
      automation({ id: 'same', trigger: { type: 'workflow', workflowId: 'lifecycle', transitionId: 'finish' } }),
      automation({ id: 'diff', trigger: { type: 'workflow', workflowId: 'lifecycle', transitionId: 'start' } }),
    ];
    expect(selectAutomations(automations, wf).map((a) => a.id)).toEqual(['any', 'same']);
  });
});
