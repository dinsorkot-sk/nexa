import { afterEach, describe, expect, it } from 'vitest';
import { authRepository, createDb, createTenantContext, identityRepository, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { createApp } from '../hono/app';

const handles: DbHandle[] = [];

async function createTestApp() {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  return createApp({ db });
}

type Api = ReturnType<typeof createApp>;
const jsonHeaders = { 'content-type': 'application/json' };

async function signup(api: Api, email: string) {
  const response = await api.request('/v1/auth/signup', {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({
      email,
      password: 'long-password',
      displayName: email,
      organization: { name: `${email} organization`, slug: email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
    }),
  });
  const cookie = /nexa_session=([0-9a-f]{64})/.exec(response.headers.get('set-cookie') ?? '')?.[1];
  return `nexa_session=${cookie}`;
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe('workflow and action HTTP surface', () => {
  it('runs a transition and an action against a record, rejecting stale versions and wrong states', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/entities/vehicle/fields', 'POST', { id: 'status', name: 'status', label: 'Status', type: 'select', options: { choices: [{ value: 'draft', label: 'Draft' }, { value: 'done', label: 'Done' }] } });
    expect((await call('/actions', 'POST', {
      id: 'mark-done', moduleId: 'fleet', entityId: 'vehicle', name: 'mark-done', label: 'Mark done', kind: 'updateRecord', config: { set: { status: 'done' } },
    })).status).toBe(201);
    expect((await call('/workflows', 'POST', {
      id: 'lifecycle', moduleId: 'fleet', entityId: 'vehicle', name: 'Lifecycle', stateFieldId: 'status',
      states: [{ id: 'draft', name: 'draft', label: 'Draft', initial: true }, { id: 'done', name: 'done', label: 'Done', terminal: true }],
      transitions: [{ id: 'finish', from: 'draft', to: 'done', label: 'Finish', actions: [{ actionId: 'mark-done', input: {} }] }],
    })).status).toBe(201);
    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });

    const created = await call('/entities/vehicle/records', 'POST', { data: { status: 'draft' } });
    const record = await created.json() as { id: string; version: number };

    const missingTransition = await call(`/entities/vehicle/records/${record.id}/transitions/ghost`, 'POST', {});
    expect(missingTransition.status).toBe(404);

    const staleTransition = await call(`/entities/vehicle/records/${record.id}/transitions/finish`, 'POST', { version: 99 });
    expect(staleTransition.status).toBe(409);

    const transitioned = await call(`/entities/vehicle/records/${record.id}/transitions/finish`, 'POST', { version: record.version });
    expect(transitioned.status).toBe(200);
    await expect(transitioned.json()).resolves.toMatchObject({ data: { status: 'done' } });

    const wrongState = await call(`/entities/vehicle/records/${record.id}/transitions/finish`, 'POST', {});
    expect(wrongState.status).toBe(409);
    await expect(wrongState.json()).resolves.toMatchObject({ error: { code: 'TRANSITION_STATE_MISMATCH' } });

    const activity = await call(`/entities/vehicle/records/${record.id}/activity`, 'GET');
    const trail = await activity.json() as { items: Array<{ action: string }> };
    expect(trail.items.map((entry) => entry.action)).toEqual(expect.arrayContaining(['record.updated', 'record.created']));
  });

  it('forbids a viewer from running transitions and actions', async () => {
    const db = createDb({ dataDir: 'memory://' });
    handles.push(db);
    await runMigrations(db);
    await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const api = createApp({ db });
    const adminCookie = await signup(api, 'admin@example.com');
    const viewerCookie = await signup(api, 'viewer@example.com');
    const viewer = (await identityRepository(db).findUserByEmail('viewer@example.com'))[0]!;
    const auth = authRepository(db, createTenantContext(viewer.tenantId));
    await auth.removeRole(viewer.id, 'owner');
    await auth.assignRole(viewer.id, 'viewer');
    const adminHeaders = { ...jsonHeaders, cookie: adminCookie };
    await api.request('/v1/modules', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    const response = await api.request('/v1/modules/fleet/entities/vehicle/records/00000000-0000-0000-0000-000000000001/transitions/finish', {
      method: 'POST', headers: { ...jsonHeaders, cookie: viewerCookie }, body: '{}',
    });
    expect(response.status).toBe(403);
  });
});
