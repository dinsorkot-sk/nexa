import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../app/composables/useApi';
import { useSession, type Session } from '../app/composables/useSession';

/**
 * `useSession` reads `api`, `ApiError` and `useState` as Nuxt auto-imports, so under node the bare
 * identifiers resolve to the globals: the tests hand them the real api pieces and a tiny ref-shaped
 * state, because `{ value }` is all the composable needs to read and write the session.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const owner: Session = { userId: 'u1', tenantId: 't1', name: 'Owner', roleIds: ['owner'] };

/** A stubbed app runtime: the api mock, the real `ApiError`, and one `useState` box per key. */
function stubSession(api: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>) {
  vi.stubGlobal('api', api);
  vi.stubGlobal('ApiError', ApiError);
  const boxes = new Map<string, { value: unknown }>();
  vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
    if (!boxes.has(key)) boxes.set(key, { value: init ? init() : undefined });
    return boxes.get(key)!;
  });
}

describe('useSession', () => {
  it('loads the session once and keeps it for the next load', async () => {
    const api = vi.fn((path: string) => {
      expect(path).toBe('/auth/me');
      return Promise.resolve(owner);
    });
    stubSession(api);
    const { session, load } = useSession();
    await expect(load()).resolves.toEqual(owner);
    expect(session.value).toEqual(owner);
    await expect(load()).resolves.toEqual(owner);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('resolves to null on the missing session and keeps loading', async () => {
    const api = vi.fn(() => Promise.reject(new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required')));
    stubSession(api);
    const { session, load } = useSession();
    await expect(load()).resolves.toBeNull();
    expect(session.value).toBeNull();
  });

  it('throws the api error of anything but a missing session', async () => {
    const api = vi.fn(() => Promise.reject(new ApiError(503, 'DB_UNAVAILABLE', 'Database is unavailable')));
    stubSession(api);
    const { load } = useSession();
    await expect(load()).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
  });

  it('signs in and loads the session again', async () => {
    const calls: string[] = [];
    const api = vi.fn((path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      return path === '/auth/me' ? Promise.resolve(owner) : Promise.resolve(undefined);
    });
    stubSession(api);
    const { login } = useSession();
    await expect(login('owner@nexa.local', 'long-password')).resolves.toBeNull();
    expect(calls).toEqual(['POST /auth/login', 'GET /auth/me']);
  });

  it('returns the organization list the 409 carries', async () => {
    const choices = [
      { id: 't1', slug: 'acme', name: 'Acme', roleIds: ['owner'] },
      { id: 't2', slug: 'globex', name: 'Globex', roleIds: ['admin'] },
    ];
    const api = vi.fn(() => Promise.reject(new ApiError(409, 'ORGANIZATION_REQUIRED', 'Select an organization to continue', choices)));
    stubSession(api);
    const { login } = useSession();
    await expect(login('owner@nexa.local', 'long-password')).resolves.toEqual(choices);
    expect(api.mock.calls[0]?.[0]).toBe('/auth/login');
  });

  it('clears the stored session on logout', async () => {
    const api = vi.fn((path: string) => (path === '/auth/me' ? Promise.resolve(owner) : Promise.resolve(undefined)));
    stubSession(api);
    const { session, load, logout } = useSession();
    await load();
    expect(session.value).toEqual(owner);
    await expect(logout()).resolves.toBeUndefined();
    expect(session.value).toBeNull();
    expect(api).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
  });
});
