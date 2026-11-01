export class ApiError extends Error {
  status: number;
  requestId: string | null;
  details?: unknown;

  constructor(message: string, status: number, requestId: string | null, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }

  static from(e: unknown): ApiError {
    const err = e as { status?: number; data?: { error?: string; requestId?: string }; message?: string; response?: { headers?: Headers } };
    const status = err.status ?? 0;
    const bodyMessage = typeof err.data === 'object' && err.data !== null && 'error' in err.data ? String(err.data.error) : undefined;
    const requestId =
      (typeof err.data === 'object' && err.data !== null && 'requestId' in err.data ? String(err.data.requestId) : null) ??
      (err.response instanceof Headers ? err.response.headers.get('x-correlation-id') : null) ??
      (err.response?.headers instanceof Headers ? err.response.headers.get('x-correlation-id') : null);
    return new ApiError(bodyMessage ?? err.message ?? 'Request failed', status, requestId, (err.data as { details?: unknown })?.details);
  }
}
