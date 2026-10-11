export interface EmailTransport {
  send(message: { to: string; subject: string; body: string }): Promise<{ id?: string }>;
}

/**
 * Recording transport for development and tests: the automation run row is the delivery record, so it
 * resolves without touching an external provider. It must never be the production default, because it
 * would drop notifications silently.
 */
export const recordingTransport: EmailTransport = {
  async send() {
    return {};
  },
};

/**
 * Sends a notification. In production, an injected transport is required: without one this throws instead
 * of pretending the mail was sent. Callers record the failure on the run; nothing is dropped silently.
 */
export async function sendNotification(
  config: { to: string; subject: string; body: string },
  transport?: EmailTransport,
): Promise<{ id?: string }> {
  if (!transport) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email transport is not configured; refusing to drop the notification');
    }
    return recordingTransport.send(config);
  }
  return transport.send(config);
}

export const emailIntegration = {
  name: 'email',
  version: '0.0.3',
  sendNotification,
};
