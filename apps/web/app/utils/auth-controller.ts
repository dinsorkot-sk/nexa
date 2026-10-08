import { normalizeApiError } from './api-error';

/** Canonical principal resolved from GET /v1/auth/me. */
export interface Principal {
  userId: string;
  tenantId: string;
  name: string | null;
  roleIds: string[];
}

/** Minimal auth surface the controller needs — implemented by the API client. */
export interface AuthApi {
  me(): Promise<Response>;
  signup(input: { email: string; password: string; displayName?: string }): Promise<Response>;
  login(input: { email: string; password: string }): Promise<Response>;
  logout(): Promise<Response>;
}

export type PrincipalState = Principal | null;

/**
 * Framework-free auth controller: manages the principal around the four auth
 * endpoints. An unauthenticated `/me` is a signed-out state, not an error.
 */
export function createAuthController(api: AuthApi) {
  let principal: PrincipalState = null;

  async function parseError(response: Response) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return normalizeApiError(undefined);
    }
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    if (!error?.code) return normalizeApiError(undefined);
    return normalizeApiError({ code: error.code, message: error.message ?? 'Request failed', status: response.status, details: error.details });
  }

  function userFromResponse(user: unknown): PrincipalState {
    const shaped = user as { id: string; tenantId: string; displayName: string } | undefined;
    return shaped ? { userId: shaped.id, tenantId: shaped.tenantId, name: shaped.displayName || null, roleIds: [] } : null;
  }

  return {
    get principal() {
      return principal;
    },

    /** GET /me → principal, or null when signed out (401) or the API is down. */
    async refresh(): Promise<PrincipalState> {
      try {
        const response = await api.me();
        if (!response.ok) {
          principal = null;
          return null;
        }
        const body = (await response.json()) as { userId: string; tenantId: string; name: string | null; roleIds: string[] };
        principal = { userId: body.userId, tenantId: body.tenantId, name: body.name, roleIds: body.roleIds };
      } catch {
        principal = null;
      }
      return principal;
    },

    /** POST /signup, then resolve the canonical principal via /me. */
    async signup(input: { email: string; password: string; displayName?: string }): Promise<PrincipalState> {
      const response = await api.signup(input);
      if (!response.ok) throw await parseError(response);
      const body = (await response.json()) as { user: unknown };
      const user = userFromResponse(body.user);
      const resolved = await this.refresh();
      return resolved ?? user;
    },

    /** POST /login, then resolve the canonical principal via /me. */
    async login(input: { email: string; password: string }): Promise<PrincipalState> {
      const response = await api.login(input);
      if (!response.ok) throw await parseError(response);
      const body = (await response.json()) as { user: unknown };
      const user = userFromResponse(body.user);
      const resolved = await this.refresh();
      return resolved ?? user;
    },

    /** POST /logout; clears local state even when the request fails. */
    async logout(): Promise<void> {
      try {
        await api.logout();
      } finally {
        principal = null;
      }
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
