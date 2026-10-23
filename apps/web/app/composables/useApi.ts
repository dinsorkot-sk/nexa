export interface ApiErrorBody {
  code: string;
  message: string;
  status: number;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Same-origin call to `/v1`; the session travels as the HttpOnly cookie, never as a header. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/v1${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => undefined) as { error?: ApiErrorBody } | undefined;
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(response.status, error?.code ?? 'UNKNOWN', error?.message ?? response.statusText, error?.details);
  }
  return payload as T;
}
