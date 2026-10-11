import { hc } from 'hono/client';
import type { Hono } from 'hono';

export interface NexaClientOptions {
  baseUrl: string;
  /**
   * Opaque bearer token. Optional: browser callers authenticate with the HttpOnly session
   * cookie instead, which the server resolves per request.
   */
  token?: string;
}

/**
 * Typed Hono RPC client. Requests carry the session cookie (`credentials: 'same-origin'`, the
 * default for same-origin fetches) so `@nexa/sdk` works in the browser without a token; when a
 * token is given, an Authorization header is added on top. The same-origin default must not be
 * changed to 'include' silently: cross-origin cookie use needs a deliberate CSRF story.
 */
export function createNexaClient<T extends Hono<any, any, any>>(options: NexaClientOptions) {
  return hc<T>(options.baseUrl, {
    headers: options.token
      ? {
          Authorization: `Bearer ${options.token}`,
        }
      : {},
    init: {
      credentials: 'same-origin',
    },
  });
}

export { hc };
