import type { WebhookActionConfig } from '@nexa/meta';

export interface WebhookTransport {
  request(config: WebhookActionConfig, payload: unknown): Promise<{ status: number }>;
}

/** Default transport uses global fetch; tests inject a fake instead of hitting the network. */
export const fetchTransport: WebhookTransport = {
  async request(config, payload) {
    const response = await fetch(config.url, {
      method: config.method,
      headers: { 'content-type': 'application/json', ...config.headers },
      body: JSON.stringify(payload),
    });
    return { status: response.status };
  },
};

/**
 * Delivers a webhook action. Any non-2xx response or network failure throws;
 * the automation run records the failure and retry policy decides reattempts.
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
  version: '0.0.2',
  deliverWebhook,
};
