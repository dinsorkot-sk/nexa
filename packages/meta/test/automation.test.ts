import { describe, expect, it } from 'vitest';
import { AutomationDefinitionSchema, NotificationActionConfigSchema, WebhookActionConfigSchema } from '../src/index';

describe('automation and delivery action schemas', () => {
  it('accepts an event-triggered automation with a notification action', () => {
    const automation = AutomationDefinitionSchema.parse({
      id: 'notify-done', moduleId: 'fleet', name: 'Notify done', enabled: true,
      trigger: { type: 'event', event: 'workflow.transitioned' },
      actions: [{ actionId: 'notify', input: {} }],
    });
    expect(automation.retry.maxAttempts).toBe(3);
  });

  it('accepts record and workflow triggers and validates the trigger shape', () => {
    expect(AutomationDefinitionSchema.safeParse({
      id: 'a', moduleId: 'm', name: 'n', trigger: { type: 'record', entityId: 'vehicle', operation: 'created' },
      actions: [{ actionId: 'x', input: {} }],
    }).success).toBe(true);
    expect(AutomationDefinitionSchema.safeParse({
      id: 'a', moduleId: 'm', name: 'n', trigger: { type: 'record', entityId: 'vehicle', operation: 'touched' },
      actions: [{ actionId: 'x', input: {} }],
    }).success).toBe(false);
    expect(AutomationDefinitionSchema.safeParse({
      id: 'a', moduleId: 'm', name: 'n', trigger: { type: 'event', event: 'x' }, actions: [],
    }).success).toBe(false);
  });

  it('validates notification and webhook configs', () => {
    expect(NotificationActionConfigSchema.safeParse({ to: 'ops@example.com', subject: 'Done', body: 'hi' }).success).toBe(true);
    expect(NotificationActionConfigSchema.safeParse({ to: '', subject: 'Done', body: 'hi' }).success).toBe(false);
    const webhook = WebhookActionConfigSchema.parse({ url: 'https://example.com/hook' });
    expect(webhook.method).toBe('POST');
    expect(WebhookActionConfigSchema.safeParse({ url: 'not-a-url' }).success).toBe(false);
  });
});
