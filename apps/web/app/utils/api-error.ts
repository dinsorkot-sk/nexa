/**
 * Normalizes API failures into a single UI-facing shape.
 *
 * The API returns `{ error: { code, message, status, details? } }`; network
 * failures and malformed bodies fall back to a transport error.
 */
export interface NormalizedApiError {
  code: string;
  message: string;
  status: number;
  /** Field/definition details from the server, when present. */
  details?: unknown;
  /** True when the request never reached the API (network, malformed body). */
  transport: boolean;
}

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'You need to sign in to continue.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  AUTH_CONFLICT: 'That email is already registered.',
  FORBIDDEN: 'Your role does not allow this action.',
  INVALID_INPUT: 'Some values are missing or invalid.',
  VALIDATION_FAILED: 'Some values are missing or invalid.',
  MODULE_NOT_FOUND: 'That module no longer exists.',
  MODULE_CONFLICT: 'This change conflicts with another update. Reload and try again.',
  MODULE_NOT_ENABLED: 'This module is not enabled.',
  DEFINITION_NOT_FOUND: 'That definition no longer exists.',
  DEFINITION_CONFLICT: 'The definition is invalid or conflicts with the current schema.',
  RECORD_CONFLICT: 'This record changed elsewhere. Reload and try again.',
  RECORD_NOT_FOUND: 'That record no longer exists.',
  DB_UNAVAILABLE: 'The database is unavailable. Try again shortly.',
  INTERNAL_ERROR: 'Something went wrong on the server. Try again.',
};

const FALLBACK = 'Something went wrong. Try again.';

export function normalizeApiError(error: unknown): NormalizedApiError {
  if (error instanceof TypeError) {
    return { code: 'NETWORK_ERROR', message: 'Could not reach the API. Check your connection.', status: 0, transport: true };
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const shaped = error as { code: string; message: string; status?: number; details?: unknown; transport?: boolean };
    return {
      code: shaped.code,
      message: MESSAGES[shaped.code] ?? shaped.message,
      status: shaped.status ?? 0,
      details: shaped.details,
      transport: shaped.transport ?? false,
    };
  }
  return { code: 'UNKNOWN', message: FALLBACK, status: 0, transport: true };
}

/** Extracts the API error body from a failed Response, falling back safely. */
export async function apiErrorFromResponse(response: Response): Promise<NormalizedApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { code: 'UNKNOWN', message: FALLBACK, status: response.status, transport: true };
  }
  const error = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
  if (!error?.code) {
    return { code: 'UNKNOWN', message: FALLBACK, status: response.status, transport: true };
  }
  return normalizeApiError({ code: error.code, message: error.message ?? FALLBACK, status: response.status, details: error.details });
}

/** Builds a normalized error directly (used by callers that already have the body). */
export function apiError(code: string, message: string, status = 0, details?: unknown): NormalizedApiError {
  return normalizeApiError({ code, message, status, details });
}
