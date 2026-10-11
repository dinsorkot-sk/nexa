import { describe, expect, it } from 'vitest';
import { WebhookActionConfigSchema } from '@nexa/meta';
import { assertPublicTarget, buildWebhookHeaders, deliverWebhook, drainLimited, isPrivateAddress, webhookLimits } from '../src/index';

describe('webhook delivery guards (Phase 17, Step H)', () => {
  it('accepts only https targets at save time', () => {
    expect(WebhookActionConfigSchema.safeParse({ url: 'https://example.com/hook' }).success).toBe(true);
    expect(WebhookActionConfigSchema.safeParse({ url: 'http://example.com/hook' }).success).toBe(false);
    expect(WebhookActionConfigSchema.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false);
  });

  it('classifies private, loopback, link-local, and unspecified addresses as private', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('classifies public addresses as public', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('refuses a literal private IP target before any network call', async () => {
    await expect(assertPublicTarget('https://169.254.169.254/latest')).rejects.toThrow(/private address/);
    await expect(assertPublicTarget('https://[::1]/hook')).rejects.toThrow(/private address/);
  });

  it('refuses a hostname that resolves to any private address', async () => {
    const resolve = async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }];
    await expect(assertPublicTarget('https://mixed.example.test/hook', resolve as never)).rejects.toThrow(/private address/);
  });

  it('allows a hostname that resolves only to public addresses', async () => {
    const resolve = async () => [{ address: '93.184.216.34', family: 4 }];
    await expect(assertPublicTarget('https://public.example.test/hook', resolve as never)).resolves.toBeUndefined();
  });

  it('does not let config headers override framing, routing, or credentials', () => {
    const headers = buildWebhookHeaders({
      'Content-Type': 'text/plain',
      host: 'evil.example.test',
      Authorization: 'Bearer stolen',
      'content-length': '1',
      'X-Signature': 'abc',
    });
    expect(headers['content-type']).toBe('application/json');
    expect(headers).not.toHaveProperty('host');
    expect(headers).not.toHaveProperty('Authorization');
    expect(headers).not.toHaveProperty('content-length');
    expect(headers['X-Signature']).toBe('abc');
  });

  it('caps how much of a response body is read', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(16 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 1000) controller.close();
        else controller.enqueue(chunk);
      },
    });
    await drainLimited(new Response(stream), webhookLimits.maxResponseBytes);
    expect(pulled).toBeLessThan(10);
  });

  it('treats a redirect response as a failure', async () => {
    const transport = { async request() { return { status: 302 }; } };
    await expect(deliverWebhook({ url: 'https://example.com/hook', method: 'POST', headers: {} }, {}, transport)).rejects.toThrow('302');
  });

  it('uses a bounded timeout', () => {
    expect(webhookLimits.timeoutMs).toBeLessThanOrEqual(10_000);
  });
});
