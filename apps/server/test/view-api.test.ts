import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import type { ModulePackage, ViewDefinition } from '@nexa/meta';
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
const jsonHeaders = { 'content-type': 'application/json', origin: 'http://localhost:3000' };

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

async function moduleWithEntity(api: Api, headers: Record<string, string>) {
  await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
  await api.request('/v1/modules/fleet/entities', { method: 'POST', headers, body: JSON.stringify({ id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' }) });
  await api.request('/v1/modules/fleet/entities/vehicle/fields', { method: 'POST', headers, body: JSON.stringify({ id: 'plate', name: 'plate', label: 'Plate', type: 'text' }) });
}

describe('view and form HTTP surface', () => {
  it('creates, lists, reads, updates and deletes a view', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await moduleWithEntity(api, headers);

    const created = await call('/views', 'POST', { id: 'all-vehicles', entityId: 'vehicle', name: 'All vehicles', type: 'table', isDefault: true, columns: [{ fieldId: 'plate' }], sort: [{ fieldId: 'plate', direction: 'asc' }] });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ id: 'all-vehicles', moduleId: 'fleet', entityId: 'vehicle', type: 'table', isDefault: true });

    const listed = await call('/views', 'GET');
    await expect(listed.json()).resolves.toMatchObject([{ id: 'all-vehicles' }]);
    const byEntity = await call('/views?entityId=vehicle', 'GET');
    expect((await byEntity.json() as ViewDefinition[]).length).toBe(1);
    const byOther = await call('/views?entityId=other', 'GET');
    expect((await byOther.json() as ViewDefinition[]).length).toBe(0);

    const read = await call('/views/all-vehicles', 'GET');
    await expect(read.json()).resolves.toMatchObject({ id: 'all-vehicles' });

    const updated = await call('/views/all-vehicles', 'PATCH', { name: 'Every vehicle' });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ name: 'Every vehicle', isDefault: true });

    const removed = await call('/views/all-vehicles', 'DELETE');
    expect(removed.status).toBe(204);
    const empty = await call('/views', 'GET');
    expect((await empty.json() as ViewDefinition[]).length).toBe(0);
  });

  it('creates, reads, updates and deletes a form', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await moduleWithEntity(api, headers);

    const created = await call('/forms', 'POST', { id: 'vehicle-form', entityId: 'vehicle', name: 'Vehicle form', sections: [{ id: 'main', label: 'Main', fieldIds: ['plate'], columns: 2 }] });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ id: 'vehicle-form', moduleId: 'fleet', entityId: 'vehicle' });

    const listed = await call('/forms', 'GET');
    await expect(listed.json()).resolves.toMatchObject([{ id: 'vehicle-form' }]);
    const read = await call('/forms/vehicle-form', 'GET');
    await expect(read.json()).resolves.toMatchObject({ id: 'vehicle-form' });

    const updated = await call('/forms/vehicle-form', 'PATCH', { name: 'Vehicle details' });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ name: 'Vehicle details' });

    const removed = await call('/forms/vehicle-form', 'DELETE');
    expect(removed.status).toBe(204);
  });

  it('refuses a view or a form that names something the module does not have', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await moduleWithEntity(api, headers);

    const unknownEntity = await call('/views', 'POST', { id: 'v', entityId: 'ghost', name: 'Ghost', type: 'table' });
    expect(unknownEntity.status).toBe(404);

    const unknownField = await call('/views', 'POST', { id: 'v', entityId: 'vehicle', name: 'Bad column', type: 'table', columns: [{ fieldId: 'ghost' }] });
    expect(unknownField.status).toBe(409);
    await expect(unknownField.json()).resolves.toMatchObject({ error: { code: 'DEFINITION_CONFLICT' } });

    const unknownSort = await call('/views', 'POST', { id: 'v', entityId: 'vehicle', name: 'Bad sort', type: 'table', sort: [{ fieldId: 'ghost', direction: 'asc' }] });
    expect(unknownSort.status).toBe(409);

    // A view that lays itself out by a field the entity does not have would leave the renderer with nothing to show.
    const unknownGroup = await call('/views', 'POST', { id: 'v', entityId: 'vehicle', name: 'Bad group', type: 'kanban', groupBy: 'ghost' });
    expect(unknownGroup.status).toBe(409);
    await expect(unknownGroup.json()).resolves.toMatchObject({ error: { code: 'DEFINITION_CONFLICT' } });

    const unknownDate = await call('/views', 'POST', { id: 'v', entityId: 'vehicle', name: 'Bad date', type: 'calendar', dateField: 'ghost' });
    expect(unknownDate.status).toBe(409);

    const unknownFormField = await call('/forms', 'POST', { id: 'f', entityId: 'vehicle', name: 'Bad form', sections: [{ id: 'main', label: 'Main', fieldIds: ['ghost'] }] });
    expect(unknownFormField.status).toBe(409);

    // An entity has one default view.
    await call('/views', 'POST', { id: 'default-1', entityId: 'vehicle', name: 'Default', type: 'table', isDefault: true });
    const second = await call('/views', 'POST', { id: 'default-2', entityId: 'vehicle', name: 'Another default', type: 'table', isDefault: true });
    expect(second.status).toBe(409);
  });

  it('carries the views and forms through a package round trip', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (moduleId: string, path: string, method: string, body?: unknown) => api.request(`/v1/modules/${moduleId}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await moduleWithEntity(api, headers);
    await call('fleet', '/views', 'POST', { id: 'all-vehicles', entityId: 'vehicle', name: 'All vehicles', type: 'table' });
    await call('fleet', '/forms', 'POST', { id: 'vehicle-form', entityId: 'vehicle', name: 'Vehicle form' });

    const exported = await call('fleet', '/package', 'GET');
    const pkg = await exported.json() as ModulePackage;
    expect(pkg.views.map((view) => view.id)).toEqual(['all-vehicles']);
    expect(pkg.forms.map((form) => form.id)).toEqual(['vehicle-form']);

    const rekeyed = {
      ...pkg,
      manifest: { ...pkg.manifest, moduleId: 'copy' },
      module: { ...pkg.module, id: 'copy' },
    };
    const imported = await call('copy', '/package/import', 'POST', rekeyed);
    expect(imported.status).toBe(201);

    // The definitions belong to the module they were imported into.
    const views = await call('copy', '/views', 'GET');
    await expect(views.json()).resolves.toMatchObject([{ id: 'all-vehicles', moduleId: 'copy' }]);
    const forms = await call('copy', '/forms', 'GET');
    await expect(forms.json()).resolves.toMatchObject([{ id: 'vehicle-form', moduleId: 'copy' }]);
  });

  it('carries the permissions through a package round trip', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (moduleId: string, path: string, method: string, body?: unknown) => api.request(`/v1/modules/${moduleId}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await moduleWithEntity(api, headers);

    const created = await call('fleet', '/permissions', 'POST', { id: 'viewers-can-read', roleId: 'viewer', resource: { type: 'entity', id: 'vehicle' }, actions: ['read'] });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ id: 'viewers-can-read', moduleId: 'fleet', roleId: 'viewer' });

    const listed = await call('fleet', '/permissions', 'GET');
    await expect(listed.json()).resolves.toMatchObject([{ id: 'viewers-can-read' }]);
    const read = await call('fleet', '/permissions/viewers-can-read', 'GET');
    await expect(read.json()).resolves.toMatchObject({ id: 'viewers-can-read' });

    // A permission that names a resource the module does not have grants nothing.
    const unknown = await call('fleet', '/permissions', 'POST', { id: 'bad', roleId: 'viewer', resource: { type: 'entity', id: 'ghost' }, actions: ['read'] });
    expect(unknown.status).toBe(409);

    const updated = await call('fleet', '/permissions/viewers-can-read', 'PATCH', { actions: ['read', 'export'] });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ actions: ['read', 'export'] });

    const exported = await call('fleet', '/package', 'GET');
    const pkg = await exported.json() as ModulePackage;
    expect(pkg.permissions.map((permission) => permission.id)).toEqual(['viewers-can-read']);

    const rekeyed = { ...pkg, manifest: { ...pkg.manifest, moduleId: 'copy' }, module: { ...pkg.module, id: 'copy' } };
    const imported = await call('copy', '/package/import', 'POST', rekeyed);
    expect(imported.status).toBe(201);
    const permissions = await call('copy', '/permissions', 'GET');
    await expect(permissions.json()).resolves.toMatchObject([{ id: 'viewers-can-read', moduleId: 'copy' }]);

    const removed = await call('fleet', '/permissions/viewers-can-read', 'DELETE');
    expect(removed.status).toBe(204);
  });

  it('denies a viewer the right to write a view', async () => {
    const db = createDb({ dataDir: 'memory://' });
    handles.push(db);
    await runMigrations(db);
    await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const api = createApp({ db });
    const viewerCookie = await signup(api, 'viewer@example.com');
    const { authRepository, createTenantContext, identityRepository } = await import('@nexa/db');
    const viewer = (await identityRepository(db).findUserByEmail('viewer@example.com'))[0]!;
    const auth = authRepository(db, createTenantContext(viewer.tenantId));
    await auth.removeRole(viewer.id, 'owner');
    await auth.assignRole(viewer.id, 'viewer');

    const denied = await api.request('/v1/modules/fleet/views', {
      method: 'POST', headers: { ...jsonHeaders, cookie: viewerCookie }, body: JSON.stringify({ id: 'v', entityId: 'vehicle', name: 'View', type: 'table' }),
    });
    expect(denied.status).toBe(403);
  });
});
