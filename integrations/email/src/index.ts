export interface EmailTransport {
  send(message: { to: string; subject: string; body: string }): Promise<{ id?: string }>;
}

/**
 * Recording transport: the automation run row is the delivery source of truth,
 * so the default transport resolves without touching an external provider.
 * Production deployments inject a real transport (SMTP, SES, ...) per tenant.
 */
export const recordingTransport: EmailTransport = {
  async send() {
    return {};
  },
};

export async function sendNotification(
  config: { to: string; subject: string; body: string },
  transport: EmailTransport = recordingTransport,
): Promise<{ id?: string }> {
  return transport.send(config);
}

export const emailIntegration = {
  name: 'email',
  version: '0.0.2',
  sendNotification,
};
