import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import type { ModuleDefinition, ModulePackage } from '@nexa/meta';
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

  it('imports a package into the tenant as a draft module', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (moduleId: string, path: string, method: string, body?: unknown) => api.request(`/v1/modules/${moduleId}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '2.0.0' }) });
    await call('fleet', '/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    const exported = await call('fleet', '/package', 'GET');
    const pkg = await exported.json() as ModulePackage;

    // The package carries the identity of the tenant it was exported from. The
    // server owns the identity of what lands, so that copy is not kept.
    const rekeyed = {
      ...pkg,
      manifest: { ...pkg.manifest, moduleId: 'copy' },
      module: { ...pkg.module, id: 'copy', tenantId: 'tenant-elsewhere', owner: { id: 'someone-else', type: 'user' } },
    };
    const imported = await call('copy', '/package/import', 'POST', rekeyed);
    expect(imported.status).toBe(201);
    await expect(imported.json()).resolves.toMatchObject({ imported: true, module: { id: 'copy', status: 'draft' } });

    const stored = await call('copy', '', 'GET');
    const storedModule = await stored.json() as ModuleDefinition;
    expect(storedModule.tenantId).not.toBe('tenant-elsewhere');
    expect(storedModule.owner.id).not.toBe('someone-else');
    expect(storedModule.status).toBe('draft');
    const entities = await call('copy', '/entities', 'GET');
    await expect(entities.json()).resolves.toMatchObject([{ id: 'vehicle' }]);

    // The module id is taken.
    const again = await call('copy', '/package/import', 'POST', rekeyed);
    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toMatchObject({ error: { code: 'PACKAGE_CONFLICT' } });

    // The manifest has to agree with the URL.
    const mismatched = await call('other', '/package/import', 'POST', rekeyed);
    expect(mismatched.status).toBe(400);

    // A body that is not a package.
    const malformed = await call('copy2', '/package/import', 'POST', { manifest: { formatVersion: 1 } });
    expect(malformed.status).toBe(400);

    // Two definitions of one kind cannot share an id.
    const duplicated = await call('copy3', '/package/import', 'POST', { ...rekeyed, manifest: { ...rekeyed.manifest, moduleId: 'copy3' }, module: { ...rekeyed.module, id: 'copy3' }, entities: [...pkg.entities, ...pkg.entities] });
    expect(duplicated.status).toBe(400);
    await expect(duplicated.json()).resolves.toMatchObject({ error: { code: 'INVALID_INPUT' } });
  });

  it('denies a viewer the right to import a package', async () => {
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

    const response = await api.request('/v1/modules/copy/package/import', {
      method: 'POST', headers: { ...jsonHeaders, cookie: viewerCookie }, body: JSON.stringify({ manifest: { formatVersion: 1, moduleId: 'copy', version: '1.0.0', exportedAt: new Date().toISOString() } }),
    });
    expect(response.status).toBe(403);
  });
});
