import { describe, expect, it } from 'vitest';
import { createApiClient } from '../app/utils/api-client';
import { normalizeApiError } from '../app/utils/api-error';
import { createAuthController } from '../app/utils/auth-controller';
import { availableModuleTransitions, entityFields, moduleCreateInput } from '../app/utils/module-builder';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('web API helpers', () => {
  it('targets the API origin and includes cookies on requests', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createApiClient('https://api.example.test/', async (input, init) => {
      calls.push({ input, init });
      return response([]);
    });
    await client.modules.$get();
    await client.modules[':moduleId'].entities.$post({ param: { moduleId: 'fleet' }, json: { id: 'vehicle' } });
    expect(calls[0]?.input).toBe('https://api.example.test/v1/modules');
    expect(calls.every((call) => call.init?.credentials === 'include')).toBe(true);
    expect(calls[1]?.input).toBe('https://api.example.test/v1/modules/fleet/entities');
  });

  it('maps API codes to actionable messages and treats network errors as transport failures', () => {
    expect(normalizeApiError({ code: 'INVALID_CREDENTIALS', message: 'server detail', status: 401 })).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.', status: 401, transport: false });
    expect(normalizeApiError(new TypeError('failed fetch'))).toMatchObject({ code: 'NETWORK_ERROR', transport: true });
  });

  it('resolves a canonical principal after login and clears it on logout', async () => {
    let loggedIn = false;
    const controller = createAuthController({
      me: async () => loggedIn ? response({ userId: 'u1', tenantId: 't1', name: 'Ada', roleIds: ['admin'] }) : response({ error: { code: 'AUTH_REQUIRED' } }, 401),
      login: async () => { loggedIn = true; return response({ user: { id: 'u1', tenantId: 't1', displayName: 'Ada' } }); },
      signup: async () => { loggedIn = true; return response({ user: { id: 'u1', tenantId: 't1', displayName: 'Ada' } }, 201); },
      logout: async () => { loggedIn = false; return new Response(null, { status: 204 }); },
    });
    await expect(controller.login({ email: 'ada@example.com', password: 'long-password' })).resolves.toMatchObject({ userId: 'u1', roleIds: ['admin'] });
    expect(controller.principal).toMatchObject({ tenantId: 't1' });
    await controller.logout();
    expect(controller.principal).toBeNull();
  });

  it('keeps unauthenticated refresh as a signed-out state', async () => {
    const controller = createAuthController({ me: async () => response({ error: { code: 'AUTH_REQUIRED' } }, 401), login: async () => response({}, 200), signup: async () => response({}, 201), logout: async () => response({}, 204) });
    await expect(controller.refresh()).resolves.toBeNull();
  });

  it('surfaces ORGANIZATION_REQUIRED with the membership list, then logs in with a selection', async () => {
    const logins: Array<{ organizationId?: string }> = [];
    const controller = createAuthController({
      me: async () => response({ userId: 'u1', tenantId: 't2', name: 'Ada', roleIds: ['admin'] }),
      login: async ({ organizationId }) => {
        logins.push({ organizationId });
        if (!organizationId) return response({ error: { code: 'ORGANIZATION_REQUIRED', message: 'Select an organization to continue', details: [{ id: 't1', slug: 'acme', name: 'Acme', roleIds: ['a'] }, { id: 't2', slug: 'glob', name: 'Globex', roleIds: ['b'] }] } }, 409);
        return response({ user: { id: 'u1', tenantId: organizationId, displayName: 'Ada' } });
      },
      signup: async () => response({}, 201),
      logout: async () => new Response(null, { status: 204 }),
    });
    await expect(controller.login({ email: 'ada@example.com', password: 'long-password' })).rejects.toMatchObject({
      code: 'ORGANIZATION_REQUIRED',
      status: 409,
      details: [{ id: 't1' }, { id: 't2' }],
      transport: false,
    });
    await expect(controller.login({ email: 'ada@example.com', password: 'long-password', organizationId: 't2' })).resolves.toMatchObject({ userId: 'u1', tenantId: 't2' });
    expect(logins).toEqual([{ organizationId: undefined }, { organizationId: 't2' }]);
  });

  it('builds owner-scoped module input and exposes valid transitions', () => {
    expect(moduleCreateInput({ id: 'crm', name: 'CRM', version: '1.0.0' }, 'user-1')).toMatchObject({ owner: { id: 'user-1', type: 'user' }, dependencies: [] });
    expect(availableModuleTransitions('draft')).toEqual(['review', 'archived']);
    expect(availableModuleTransitions('archived')).toEqual([]);
  });

  it('sorts fields for an entity by position', () => {
    const fields = entityFields({ entities: [], relations: [], fields: [
      { id: 'b', entityId: 'e', name: 'b', label: 'B', type: 'text', options: {}, position: 2 },
      { id: 'a', entityId: 'e', name: 'a', label: 'A', type: 'text', options: {}, position: 1 },
    ] }, 'e');
    expect(fields.map((field) => field.id)).toEqual(['a', 'b']);
  });
});
