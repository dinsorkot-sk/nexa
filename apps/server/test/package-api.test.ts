import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import type { ModulePackage } from '@nexa/meta';
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

describe('module package HTTP surface', () => {
  it('exports a package and rejects a downgrade upgrade', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '2.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });

    const exported = await call('/package', 'GET');
    expect(exported.status).toBe(200);
    const pkg = await exported.json() as ModulePackage;
    expect(pkg.manifest).toMatchObject({ formatVersion: 1, moduleId: 'fleet', version: '2.0.0' });
    expect(pkg.entities.map((entity) => entity.id)).toEqual(['vehicle']);

    const downgrade = await call('/package/upgrade', 'POST', { ...pkg, manifest: { ...pkg.manifest, version: '1.0.0' }, module: { ...pkg.module, version: '1.0.0' } });
    expect(downgrade.status).toBe(409);
    await expect(downgrade.json()).resolves.toMatchObject({ error: { code: 'VERSION_NOT_UPGRADE' } });

    const upgrade = await call('/package/upgrade', 'POST', { ...pkg, manifest: { ...pkg.manifest, version: '2.1.0' }, module: { ...pkg.module, version: '2.1.0' } });
    expect(upgrade.status).toBe(200);
    await expect(upgrade.json()).resolves.toMatchObject({ upgraded: true, module: { version: '2.1.0' } });

    const mismatch = await call('/package/upgrade', 'POST', { ...pkg, manifest: { ...pkg.manifest, moduleId: 'other' }, module: { ...pkg.module, id: 'other' } });
    expect(mismatch.status).toBe(400);
  });
});
