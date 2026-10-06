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

  it('returns 503 for module routes when the registry database is unavailable', async () => {
    const api = createApp();
    const response = await api.request('/v1/modules');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'DB_UNAVAILABLE' } });
  });
});
