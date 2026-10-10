import { describe, expect, it } from 'vitest';
import type { ActionDefinition, AutomationDefinition } from '../../meta/src/index';
import { dispatchAutomations, type DispatchPorts } from './dispatch';

const automation = (partial: Partial<AutomationDefinition> = {}) => ({
  id: 'a1', moduleId: 'm', name: 'n', enabled: true,
  trigger: { type: 'event', event: 'record.created' },
  actions: [{ actionId: 'act', input: {} }],
  retry: { maxAttempts: 1 },
  ...partial,
}) as AutomationDefinition;

function ports(overrides: Partial<DispatchPorts> & { automations?: AutomationDefinition[] } = {}) {
  const log: string[] = [];
  const action = { id: 'act', kind: 'webhook', config: {} } as ActionDefinition;
  const p: DispatchPorts = {
    listAutomations: async () => overrides.automations ?? [automation()],
    listActions: async () => [action],
    runs: {
      start: async () => ({ id: 'run1' }),
      retry: async (id, attempt) => { log.push(`retry:${attempt}`); return id; },
      finish: async (_id, status, lastError) => { log.push(`finish:${status}${lastError ? ':' + lastError : ''}`); },
    },
    deliver: async () => { log.push('deliver'); },
    ...overrides,
  };
  return { p, log };
}

describe('dispatchAutomations', () => {
  it('delivers once and records success', async () => {
    const { p, log } = ports();
    await dispatchAutomations(p, 'm', { type: 'event', eventType: 'record.created' });
    expect(log).toEqual(['deliver', 'finish:succeeded']);
  });

  it('retries a failing delivery up to maxAttempts, then records the failure', async () => {
    const { p, log } = ports({
      automations: [automation({ retry: { maxAttempts: 2 } })],
      deliver: async () => { throw new Error('boom'); },
    });
    await dispatchAutomations(p, 'm', { type: 'event', eventType: 'record.created' });
    expect(log).toEqual(['retry:2', 'retry:3', 'finish:failed:boom']);
  });

  it('does nothing for disabled or non-matching automations', async () => {
    const { p, log } = ports({ automations: [automation({ enabled: false })] });
    await dispatchAutomations(p, 'm', { type: 'event', eventType: 'record.created' });
    expect(log).toEqual([]);
  });
});
