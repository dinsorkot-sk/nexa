import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { WebhookActionConfig } from '@nexa/meta';

export interface WebhookTransport {
  request(config: WebhookActionConfig, payload: unknown): Promise<{ status: number }>;
}

/** Hard limits on outbound delivery. */
export const webhookLimits = {
  timeoutMs: 5_000,
  maxResponseBytes: 64 * 1024,
} as const;

/** Headers the config may not override: they carry framing, routing, and credentials. */
const protectedHeaders = new Set(['content-type', 'host', 'authorization', 'content-length', 'transfer-encoding']);

/**
 * True when an IP address is loopback, private, link-local, multicast, or unspecified, in IPv4 or IPv6
 * (including IPv4-mapped IPv6). These must never be reachable from a tenant's webhook.
 */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number, number, number];
    return a === 0 || a === 10 || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || a >= 224;
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return lower === '::' || lower === '::1'
      || lower.startsWith('fc') || lower.startsWith('fd')
      || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')
      || lower.startsWith('ff');
  }
  return true;
}

/**
 * Resolves the target host and throws if any address is private. Literal IPs are checked directly.
 * ponytail: DNS rebinding between this check and the fetch is not prevented. Closing that needs the
 * request sent to the resolved IP with the original Host header; that is the upgrade path.
 */
export async function assertPublicTarget(url: string, resolve: typeof lookup = lookup): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Webhook target resolves to a private address');
    return;
  }
  const addresses = await resolve(host, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('Webhook target did not resolve');
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Webhook target resolves to a private address');
  }
}

/** Builds the request headers: fixed framing first, then config headers that are not protected. */
export function buildWebhookHeaders(configHeaders: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  for (const [name, value] of Object.entries(configHeaders)) {
    if (protectedHeaders.has(name.toLowerCase())) continue;
    headers[name] = value;
  }
  return headers;
}

/**
 * Reads until at least `maxBytes` have arrived, then stops and cancels the stream, so a hostile target
 * cannot exhaust memory. The bound is approximate: the last chunk can overshoot it. The content is never returned.
 */
export async function drainLimited(response: Response, maxBytes: number): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) return;
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Default transport: no redirects, a hard timeout, a bounded response, and a public-target check. */
export const fetchTransport: WebhookTransport = {
  async request(config, payload) {
    await assertPublicTarget(config.url);
    const response = await fetch(config.url, {
      method: config.method,
      headers: buildWebhookHeaders(config.headers),
      body: JSON.stringify(payload),
      redirect: 'manual',
      signal: AbortSignal.timeout(webhookLimits.timeoutMs),
    });
    await drainLimited(response, webhookLimits.maxResponseBytes);
    return { status: response.status };
  },
};

/**
 * Delivers a webhook action. Any non-2xx response, including a redirect, or a network failure throws.
 * The automation run records the failure and retry policy decides reattempts.
 */
export async function deliverWebhook(
  config: WebhookActionConfig,
  payload: unknown,
  transport: WebhookTransport = fetchTransport,
): Promise<{ status: number }> {
  const result = await transport.request(config, payload);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Webhook target responded ${result.status}`);
  }
  return result;
}

export const webhookIntegration = {
  name: 'webhook',
  version: '0.0.3',
  deliverWebhook,
};
