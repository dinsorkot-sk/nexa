import { afterEach, describe, expect, it } from 'vitest';
import { sendNotification } from '../src/index';

const originalEnv = process.env.NODE_ENV;
afterEach(() => { process.env.NODE_ENV = originalEnv; });

describe('email notification delivery (Phase 17, Step H)', () => {
  it('fails closed in production when no transport is configured', async () => {
    process.env.NODE_ENV = 'production';
    await expect(sendNotification({ to: 'ops@example.com', subject: 's', body: 'b' })).rejects.toThrow(/not configured/);
  });

  it('uses the recording transport outside production when none is injected', async () => {
    process.env.NODE_ENV = 'test';
    await expect(sendNotification({ to: 'ops@example.com', subject: 's', body: 'b' })).resolves.toEqual({});
  });

  it('delivers through an injected transport in production', async () => {
    process.env.NODE_ENV = 'production';
    const sent: string[] = [];
    await sendNotification({ to: 'ops@example.com', subject: 's', body: 'b' }, { async send(message) { sent.push(message.to); return { id: '1' }; } });
    expect(sent).toEqual(['ops@example.com']);
  });
});
