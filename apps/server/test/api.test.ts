import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { app, createApp } from '../hono/app';

const handles: DbHandle[] = [];

async function createTestApp() {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert((await import('@nexa/db')).tenants).values({
    id: SYSTEM_TENANT_ID,
    slug: 'system',
    name: 'System',
  });
  return createApp({ db });
}

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

  it('returns service information', async () => {
    const response = await app.request('/v1/status');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'nexa-platform',
      framework: 'Nuxt + Hono',
    });
  });

  it('requires a valid tenant header for module routes but not health checks', async () => {
    const api = await createTestApp();

    const missingTenant = await api.request('/v1/modules');
    expect(missingTenant.status).toBe(400);
    await expect(missingTenant.json()).resolves.toMatchObject({ error: { code: 'TENANT_REQUIRED' } });

    const invalidTenant = await api.request('/v1/modules', {
      headers: { 'x-tenant-id': 'not-a-uuid' },
    });
    expect(invalidTenant.status).toBe(400);
    await expect(invalidTenant.json()).resolves.toMatchObject({ error: { code: 'INVALID_TENANT' } });

    expect((await api.request('/v1/health')).status).toBe(200);
  }, 15000);

  it('creates, lists, reads, updates, and transitions tenant-scoped modules', async () => {
    const api = await createTestApp();
    const headers = { 'content-type': 'application/json', 'x-tenant-id': SYSTEM_TENANT_ID };
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
    await expect(created.json()).resolves.toMatchObject({ id: 'fleet', status: 'draft', tenantId: SYSTEM_TENANT_ID });

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
    const headers = { 'content-type': 'application/json', 'x-tenant-id': SYSTEM_TENANT_ID };

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
    const headers = { 'content-type': 'application/json', 'x-tenant-id': SYSTEM_TENANT_ID };
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
    const headers = { 'content-type': 'application/json', 'x-tenant-id': SYSTEM_TENANT_ID };
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

  it('returns 503 for module routes when the registry database is unavailable', async () => {
    const api = createApp();
    const response = await api.request('/v1/modules');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'DB_UNAVAILABLE' } });
  });
});
