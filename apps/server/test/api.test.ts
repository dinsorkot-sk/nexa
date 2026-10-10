import { afterEach, describe, expect, it } from 'vitest';
import { authRepository, createDb, createTenantContext, identityRepository, organizationRepository, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { app, createApp } from '../hono/app';

const handles: DbHandle[] = [];

async function createTestApp() {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert(tenants).values({
    id: SYSTEM_TENANT_ID,
    slug: 'system',
    name: 'System',
  });
  return createApp({ db });
}

type Api = ReturnType<typeof createApp>;
const jsonHeaders = { 'content-type': 'application/json', origin: 'http://localhost:3000' };

/** Signs a user up and returns the session cookie plus the created user. */
async function signup(api: Api, email: string, password = 'long-password') {
  const response = await api.request('/v1/auth/signup', {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({
      email,
      password,
      displayName: email,
      organization: { name: `${email} organization`, slug: email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
    }),
  });
  const cookie = /nexa_session=([0-9a-f]{64})/.exec(response.headers.get('set-cookie') ?? '')?.[1];
  return { response, cookie: cookie ? `nexa_session=${cookie}` : undefined };
}

const authHeaders = (cookie: string) => ({ ...jsonHeaders, cookie });

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe('Hono API (/v1)', () => {
  it('returns a schema-validated health payload', async () => {
    const response = await app.request('/v1/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      version: '0.0.1',
    });
  });

  it('allows credentialed CORS only from configured web origins', async () => {
    const previousOrigins = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = 'http://localhost:3000,https://builder.example.test';
    const api = createApp();
    try {
      const allowed = await api.request('/v1/health', { headers: { origin: 'https://builder.example.test' } });
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://builder.example.test');
      expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
      const denied = await api.request('/v1/health', { headers: { origin: 'https://evil.example.test' } });
      expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      if (previousOrigins === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = previousOrigins;
    }
  });

  it('returns service information', async () => {
    const response = await app.request('/v1/status');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'nexa-platform',
      framework: 'Hono',
    });
  });

  it('signs up, authenticates, resolves the principal, and logs out', async () => {
    const api = await createTestApp();

    const anonymous = await api.request('/v1/auth/me');
    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toMatchObject({ error: { code: 'AUTH_REQUIRED' } });

    const { response: signupResponse, cookie } = await signup(api, 'admin@example.com');
    expect(signupResponse.status).toBe(201);
    expect(cookie).toBeDefined();
    const signupBody = await signupResponse.json() as { user: { id: string; tenantId: string }; organization: { slug: string; roleIds: string[] } };
    expect(signupBody).toMatchObject({
      user: { email: 'admin@example.com', tenantId: expect.any(String), status: 'active' },
      organization: { slug: 'admin', roleIds: ['owner'] },
    });

    const me = await api.request('/v1/auth/me', { headers: { cookie: cookie! } });
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({ tenantId: signupBody.user.tenantId, roleIds: ['owner'] });

    const organizationsRepo = organizationRepository(handles.at(-1)!);
    const { response: secondSignup } = await signup(api, 'other-owner@example.com');
    const secondOwner = await secondSignup.json() as { user: { tenantId: string } };
    await organizationsRepo.addMember(secondOwner.user.tenantId, signupBody.user.id, 'member');

    const organizations = await api.request('/v1/auth/organizations', { headers: { cookie: cookie! } });
    await expect(organizations.json()).resolves.toMatchObject([
      { id: signupBody.user.tenantId, slug: 'admin', roleIds: ['owner'] },
      { id: secondOwner.user.tenantId, slug: 'other-owner', roleIds: ['member'] },
    ]);
    const switched = await api.request('/v1/auth/organizations/select', {
      method: 'POST', headers: authHeaders(cookie!), body: JSON.stringify({ tenantId: secondOwner.user.tenantId }),
    });
    expect(switched.status).toBe(200);
    await expect((await api.request('/v1/auth/me', { headers: { cookie: cookie! } })).json())
      .resolves.toMatchObject({ tenantId: secondOwner.user.tenantId, roleIds: ['member'] });
    const forbiddenSelection = await api.request('/v1/auth/organizations/select', {
      method: 'POST', headers: authHeaders(cookie!), body: JSON.stringify({ tenantId: SYSTEM_TENANT_ID }),
    });
    expect(forbiddenSelection.status).toBe(403);

    const duplicate = await signup(api, 'admin@example.com');
    expect(duplicate.response.status).toBe(409);
    await expect(duplicate.response.json()).resolves.toMatchObject({ error: { code: 'AUTH_CONFLICT' } });

    const invalidBody = await api.request('/v1/auth/signup', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email: 'nope', password: 'short' }),
    });
    expect(invalidBody.status).toBe(400);

    const badLogin = await api.request('/v1/auth/login', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email: 'admin@example.com', password: 'wrong-password' }),
    });
    expect(badLogin.status).toBe(401);
    await expect(badLogin.json()).resolves.toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });

    const organizationRequired = await api.request('/v1/auth/login', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email: 'admin@example.com', password: 'long-password' }),
    });
    expect(organizationRequired.status).toBe(409);
    await expect(organizationRequired.json()).resolves.toMatchObject({ error: { code: 'ORGANIZATION_REQUIRED' } });

    const login = await api.request('/v1/auth/login', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({
        email: 'ADMIN@example.com',
        password: 'long-password',
        organizationId: signupBody.user.tenantId,
      }),
    });
    expect(login.status).toBe(200);

    const logout = await api.request('/v1/auth/logout', { method: 'POST', headers: { cookie: cookie!, origin: 'http://localhost:3000' } });
    expect(logout.status).toBe(204);
    const afterLogout = await api.request('/v1/auth/me', { headers: { cookie: cookie! } });
    expect(afterLogout.status).toBe(401);
  }, 30000);

  it('disables public organization signup in production until verification is available', async () => {
    const api = await createTestApp();
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await api.request('/v1/auth/signup', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          email: 'production@example.com',
          password: 'long-password',
          organization: { name: 'Production Org', slug: 'production-org' },
        }),
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'SIGNUP_DISABLED' } });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('requires authentication and enforces role-based permissions', async () => {
    const api = await createTestApp();

    const missingTenant = await api.request('/v1/modules');
    expect(missingTenant.status).toBe(401);
    await expect(missingTenant.json()).resolves.toMatchObject({ error: { code: 'AUTH_REQUIRED' } });

    const { cookie: adminCookie } = await signup(api, 'admin@example.com');
    const admin = { ...jsonHeaders, cookie: adminCookie! };
    const created = await api.request('/v1/modules', {
      method: 'POST', headers: admin, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }),
    });
    expect(created.status).toBe(201);

    const { cookie: memberCookie } = await signup(api, 'member@example.com');
    const db = handles.at(-1)!;
    const memberUser = (await identityRepository(db).findUserByEmail('member@example.com'))[0]!;
    const memberAuth = authRepository(db, createTenantContext(memberUser.tenantId));
    await memberAuth.removeRole(memberUser.id, 'owner');
    await memberAuth.assignRole(memberUser.id, 'member');
    const member = { ...jsonHeaders, cookie: memberCookie! };

    const memberReads = await api.request('/v1/modules', { headers: member });
    expect(memberReads.status).toBe(200);

    const forbiddenCreate = await api.request('/v1/modules', {
      method: 'POST', headers: member, body: JSON.stringify({ id: 'other', owner: { id: 'user-2', type: 'user' }, name: 'Other', version: '1.0.0' }),
    });
    expect(forbiddenCreate.status).toBe(403);
    await expect(forbiddenCreate.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });

    const forbiddenDefinition = await api.request('/v1/modules/fleet/entities', {
      method: 'POST', headers: member, body: JSON.stringify({ id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' }),
    });
    expect(forbiddenDefinition.status).toBe(403);

    const allowedDefinition = await api.request('/v1/modules/fleet/entities', {
      method: 'POST', headers: admin, body: JSON.stringify({ id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' }),
    });
    expect(allowedDefinition.status).toBe(201);
  });

  it('creates, lists, reads, updates, and transitions tenant-scoped modules', async () => {
    const api = await createTestApp();
    const { cookie } = await signup(api, 'admin@example.com');
    const headers = authHeaders(cookie!);
    const input = {
      id: 'fleet',
      owner: { id: 'user-1', type: 'user' },
      name: 'Fleet',
      version: '1.0.0',
    };

    const created = await api.request('/v1/modules', {
      method: 'POST', headers, body: JSON.stringify(input),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ id: 'fleet', status: 'draft', tenantId: expect.any(String) });

    const listed = await api.request('/v1/modules?status=draft', { headers });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toHaveLength(1);

    const invalidStatus = await api.request('/v1/modules?status=unknown', { headers });
    expect(invalidStatus.status).toBe(400);
    await expect(invalidStatus.json()).resolves.toMatchObject({ error: { code: 'INVALID_INPUT' } });

    const fetched = await api.request('/v1/modules/fleet', { headers });
    expect(fetched.status).toBe(200);
    await expect(fetched.json()).resolves.toMatchObject({ id: 'fleet', name: 'Fleet' });

    const updated = await api.request('/v1/modules/fleet', {
      method: 'PATCH', headers, body: JSON.stringify({ name: 'Fleet Ops' }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ name: 'Fleet Ops' });

    const transitioned = await api.request('/v1/modules/fleet/transition', {
      method: 'POST', headers, body: JSON.stringify({ to: 'review' }),
    });
    expect(transitioned.status).toBe(200);
    await expect(transitioned.json()).resolves.toMatchObject({ status: 'review' });
  });

  it('maps invalid input, missing modules, and lifecycle conflicts', async () => {
    const api = await createTestApp();
    const { cookie } = await signup(api, 'admin@example.com');
    const headers = authHeaders(cookie!);

    const invalidBody = await api.request('/v1/modules', {
      method: 'POST', headers, body: JSON.stringify({ id: 'invalid' }),
    });
    expect(invalidBody.status).toBe(400);

    const missing = await api.request('/v1/modules/missing', { headers });
    expect(missing.status).toBe(404);

    const missingTransition = await api.request('/v1/modules/missing/transition', {
      method: 'POST', headers, body: JSON.stringify({ to: 'review' }),
    });
    expect(missingTransition.status).toBe(404);

    await api.request('/v1/modules', {
      method: 'POST', headers, body: JSON.stringify({
        id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0',
      }),
    });
    const conflict = await api.request('/v1/modules/fleet/transition', {
      method: 'POST', headers, body: JSON.stringify({ to: 'enabled' }),
    });
    expect(conflict.status).toBe(409);
  });

  it('manages entities, fields, and relations and maps definition errors', async () => {
    const api = await createTestApp();
    const { cookie } = await signup(api, 'admin@example.com');
    const headers = authHeaders(cookie!);
    const send = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await api.request('/v1/modules', {
      method: 'POST', headers, body: JSON.stringify({
        id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0',
      }),
    });

    const vehicle = { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' };
    expect((await send('/entities', 'POST', vehicle)).status).toBe(201);
    expect((await send('/entities', 'POST', vehicle)).status).toBe(409);
    expect((await send('/entities', 'POST', { id: 'bad' })).status).toBe(400);
    expect((await send('/entities/vehicle', 'GET')).status).toBe(200);
    expect((await send('/entities/ghost', 'GET')).status).toBe(404);
    const patched = await send('/entities/vehicle', 'PATCH', { label: 'Car' });
    await expect(patched.json()).resolves.toMatchObject({ label: 'Car' });

    const field = { id: 'plate', name: 'plate', label: 'Plate', type: 'text' };
    expect((await send('/entities/vehicle/fields', 'POST', field)).status).toBe(201);
    expect((await send('/entities/ghost/fields', 'POST', field)).status).toBe(404);
    expect((await send('/entities/vehicle/fields', 'POST', { ...field, id: 'broken', name: 'broken', type: 'select' })).status).toBe(400);
    const listedFields = await send('/fields?entityId=vehicle', 'GET');
    await expect(listedFields.json()).resolves.toHaveLength(1);
    expect((await send('/fields/plate', 'PATCH', { label: 'Plate no.' })).status).toBe(200);

    const relation = { id: 'self', name: 'self', sourceEntityId: 'vehicle', targetEntityId: 'vehicle', type: 'oneToMany' };
    expect((await send('/relations', 'POST', relation)).status).toBe(201);
    expect((await send('/relations', 'POST', { ...relation, id: 'bad', targetEntityId: 'ghost' })).status).toBe(409);
    expect((await send('/schema', 'GET')).status).toBe(200);
    expect((await send('/relations/self', 'DELETE')).status).toBe(204);
    expect((await send('/fields/plate', 'DELETE')).status).toBe(204);
    expect((await send('/entities/vehicle', 'DELETE')).status).toBe(204);
    expect((await api.request('/v1/modules/missing/entities', { headers })).status).toBe(200);
    expect((await api.request('/v1/modules/missing/entities', { method: 'POST', headers, body: JSON.stringify(vehicle) })).status).toBe(404);

    await api.request('/v1/modules/fleet/transition', { method: 'POST', headers, body: JSON.stringify({ to: 'review' }) });
    await api.request('/v1/modules/fleet/transition', { method: 'POST', headers, body: JSON.stringify({ to: 'published' }) });
    expect((await send('/entities', 'POST', vehicle)).status).toBe(409);
  });

  it('serves module-scoped record CRUD and relation links with metadata validation', async () => {
    const api = await createTestApp();
    const { cookie } = await signup(api, 'admin@example.com');
    const headers = authHeaders(cookie!);
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/entities', 'POST', { id: 'part', name: 'part', label: 'Part', pluralLabel: 'Parts' });
    await call('/entities/vehicle/fields', 'POST', { id: 'name', name: 'name', label: 'Name', type: 'text', options: { required: true, hidden: false, searchable: true } });
    await call('/entities/vehicle/fields', 'POST', { id: 'secret', name: 'secret', label: 'Secret', type: 'text', options: { hidden: true, defaultValue: 'classified' } });
    await call('/entities/part/fields', 'POST', { id: 'label', name: 'label', label: 'Label', type: 'text', options: { required: false } });
    await call('/relations', 'POST', { id: 'parts', name: 'parts', sourceEntityId: 'vehicle', targetEntityId: 'part', type: 'manyToMany', onDelete: 'cascade' });
    const rejectedCreate = await call('/entities/vehicle/records', 'POST', { data: { name: 'Truck' } });
    expect(rejectedCreate.status).toBe(409);
    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });
    const created = await call('/entities/vehicle/records', 'POST', { data: { name: 'Truck' } });
    expect(created.status).toBe(201);
    const vehicle = await created.json() as { id: string; data: Record<string, unknown>; version: number };
    expect(vehicle.data).toEqual({ name: 'Truck' });
    const fetchedVehicle = await call(`/entities/vehicle/records/${vehicle.id}`, 'GET');
    const fetchedVehicleBody = await fetchedVehicle.json();
    expect(fetchedVehicleBody).toMatchObject({ id: vehicle.id, version: 1, data: { name: 'Truck' } });
    expect(fetchedVehicleBody.data).not.toHaveProperty('secret');

    const invalid = await call('/entities/vehicle/records', 'POST', { data: {} });
    expect(invalid.status).toBe(422);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    const tooManyFilters = await call('/entities/vehicle/records?filter=' + encodeURIComponent(JSON.stringify(Array.from({ length: 21 }, () => ({ fieldId: 'name', operator: 'eq', value: 'x' })))), 'GET');
    expect(tooManyFilters.status).toBe(400);

    const listed = await call('/entities/vehicle/records?search=Truck&limit=1', 'GET');
    await expect(listed.json()).resolves.toMatchObject({ total: 1, limit: 1, items: [{ data: { name: 'Truck' } }] });
    const stale = await call(`/entities/vehicle/records/${vehicle.id}`, 'PATCH', { data: { name: 'Truck 2' }, version: 2 });
    expect(stale.status).toBe(409);
    const updated = await call(`/entities/vehicle/records/${vehicle.id}`, 'PATCH', { data: { name: 'Truck 2' }, version: 1 });
    expect(updated.status).toBe(200);

    const partResponse = await call('/entities/part/records', 'POST', { data: { label: 'Wheel' } });
    expect(partResponse.status).toBe(201);
    const part = await partResponse.json() as { id: string };
    const relation = await call(`/entities/vehicle/records/${vehicle.id}/relations/parts/${part.id}`, 'POST');
    expect(relation.status).toBe(201);
    expect((await call(`/entities/vehicle/records/${vehicle.id}/relations/parts`, 'GET')).status).toBe(200);
    expect((await call(`/entities/vehicle/records/${vehicle.id}`, 'DELETE')).status).toBe(204);
    expect((await call(`/entities/vehicle/records/${vehicle.id}/relations/parts/${part.id}`, 'DELETE')).status).toBe(404);
  });

  it('exposes record activity with actor names and hidden-field redaction', async () => {
    const api = await createTestApp();
    const { cookie } = await signup(api, 'admin@example.com');
    const headers = authHeaders(cookie!);
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/entities/vehicle/fields', 'POST', { id: 'name', name: 'name', label: 'Name', type: 'text', options: { required: true } });
    await call('/entities/vehicle/fields', 'POST', { id: 'secret', name: 'secret', label: 'Secret', type: 'text', options: { hidden: true, defaultValue: 'classified' } });
    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });

    expect((await call('/entities/vehicle/records/00000000-0000-0000-0000-0000000000aa/activity', 'GET')).status).toBe(404);
    expect((await call('/entities/ghost/records/00000000-0000-0000-0000-0000000000aa/activity', 'GET')).status).toBe(404);

    const created = await call('/entities/vehicle/records', 'POST', { data: { name: 'Truck' } });
    const vehicle = await created.json() as { id: string };
    await call(`/entities/vehicle/records/${vehicle.id}`, 'PATCH', { data: { name: 'Van' } });

    const activity = await call(`/entities/vehicle/records/${vehicle.id}/activity`, 'GET');
    expect(activity.status).toBe(200);
    const body = await activity.json() as { items: Array<{ action: string; actorName: string; changes: Record<string, Record<string, unknown>> }>; total: number };
    expect(body.total).toBe(2);
    expect(body.items.map((entry) => entry.action)).toEqual(['record.updated', 'record.created']);
    expect(body.items[0]!.actorName).toBe('admin@example.com');
    expect(body.items[0]!.changes.after).not.toHaveProperty('secret');
    expect(body.items[0]!.changes.after).toMatchObject({ name: 'Van' });
  });

  it('computes formula and computed fields on record create', async () => {
    const api = await createTestApp();
    const { cookie } = await signup(api, 'admin@example.com');
    const headers = authHeaders(cookie!);
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'order', name: 'order', label: 'Order', pluralLabel: 'Orders' });
    // All definitions are created while the module is still draft: definitions
    // are locked once the module leaves draft/review.
    await call('/entities/order/fields', 'POST', { id: 'quantity', name: 'quantity', label: 'Quantity', type: 'integer', options: { required: true } });
    await call('/entities/order/fields', 'POST', { id: 'price', name: 'price', label: 'Price', type: 'number', options: { required: true } });
    await call('/entities/order/fields', 'POST', { id: 'total', name: 'total', label: 'Total', type: 'computed', options: { expression: 'quantity * price' } });
    await call('/entities/order/fields', 'POST', { id: 'withTax', name: 'withTax', label: 'With tax', type: 'formula', options: { expression: 'ROUND(total * 1.07, 2)' } });
    await call('/entities/order/fields', 'POST', { id: 'capped', name: 'capped', label: 'Capped', type: 'computed', options: { expression: 'quantity * price', max: 50 } });
    await call('/entities/order/fields', 'POST', { id: 'code', name: 'code', label: 'Code', type: 'formula', options: { expression: "'ORD-' + quantity", unique: true } });

    const rejectedField = await call('/entities/order/fields', 'POST', { id: 'bad', name: 'bad', label: 'Bad', type: 'formula', options: { expression: 'ghost * 2' } });
    expect(rejectedField.status).toBe(409);
    await expect(rejectedField.json()).resolves.toMatchObject({ error: { code: 'DEFINITION_CONFLICT' } });

    // autoNumber creation rejected at the schema layer (before any module state matters)
    const auto = await call('/entities/order/fields', 'POST', { id: 'seq', name: 'seq', label: 'Seq', type: 'autoNumber' });
    expect(auto.status).toBe(400);
    await expect(auto.json()).resolves.toMatchObject({ error: { code: 'INVALID_INPUT' } });

    // Cyclic formula graphs are rejected at definition time in a separate
    // module that stays in draft so its definitions remain editable.
    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'ops', owner: { id: 'user-1', type: 'user' }, name: 'Ops', version: '1.0.0' }) });
    const opsCall = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/ops${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await opsCall('/entities', 'POST', { id: 'task', name: 'task', label: 'Task', pluralLabel: 'Tasks' });
    const cyc1 = await opsCall('/entities/task/fields', 'POST', { id: 'cyc1', name: 'cyc1', label: 'Cyc1', type: 'formula', options: { expression: '1' } });
    expect(cyc1.status).toBe(201);
    const cyc2 = await opsCall('/entities/task/fields', 'POST', { id: 'cyc2', name: 'cyc2', label: 'Cyc2', type: 'formula', options: { expression: '1' } });
    expect(cyc2.status).toBe(201);
    const relink = await opsCall('/fields/cyc1', 'PATCH', { options: { expression: 'cyc2 + 1' } });
    expect(relink.status).toBe(200);
    const cyclic2 = await opsCall('/fields/cyc2', 'PATCH', { options: { expression: 'cyc1 + 1' } });
    expect(cyclic2.status).toBe(409);
    await expect(cyclic2.json()).resolves.toMatchObject({ error: { code: 'DEFINITION_CONFLICT' } });

    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });

    const created = await call('/entities/order/records', 'POST', { data: { quantity: 3, price: 4 } });
    expect(created.status).toBe(201);
    const order = await created.json() as { id: string; version: number; data: Record<string, unknown> };
    expect(order.data).toMatchObject({ quantity: 3, price: 4, total: 12, withTax: 12.84, capped: 12, code: 'ORD-3' });

    const tampered = await call('/entities/order/records', 'POST', { data: { quantity: 3, price: 4, total: 999 } });
    expect(tampered.status).toBe(422);

    const updated = await call(`/entities/order/records/${order.id}`, 'PATCH', { data: { price: 10 }, version: order.version });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ data: { quantity: 3, price: 10, total: 30, withTax: 32.1 } });

    // computed result violating the max constraint
    const capped = await call('/entities/order/records', 'POST', { data: { quantity: 3, price: 20 } });
    expect(capped.status).toBe(422);
    await expect(capped.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    // duplicate values from a unique formula field
    const first = await call('/entities/order/records', 'POST', { data: { quantity: 7, price: 1 } });
    expect(first.status).toBe(201);
    const second = await call('/entities/order/records', 'POST', { data: { quantity: 7, price: 2 } });
    expect(second.status).toBe(409);
  });

  it('returns 503 for module routes when the registry database is unavailable', async () => {
    const api = createApp();
    const response = await api.request('/v1/modules');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'DB_UNAVAILABLE' } });
  });
});
