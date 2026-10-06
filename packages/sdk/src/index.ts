import { hc } from 'hono/client';
import type { Hono } from 'hono';

export interface NexaClientOptions {
  baseUrl: string;
  token?: string;
}

export function createNexaClient<T extends Hono<any, any, any>>(options: NexaClientOptions) {
  return hc<T>(options.baseUrl, {
    headers: options.token
      ? {
          Authorization: `Bearer ${options.token}`,
        }
      : {},
  });
}

export { hc };
