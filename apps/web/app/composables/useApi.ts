import { createApiClient } from '../utils/api-client';

/** Browser API client with session cookies enabled. */
export function useApiClient() {
  const config = useRuntimeConfig();
  return createApiClient(String(config.public.apiBaseUrl));
}

export type { NexaApiClient } from '../utils/api-client';
