import { afterEach, describe, expect, it } from 'vitest';
import { createDb, organizationRepository, runMigrations, SYSTEM_TENANT_ID, tenants, users } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { createApp } from '../hono/app';
import { hashPassword } from '../../../packages/auth/src/index';

const handles: DbHandle[] = [];

async function createTestApp() {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  return { api: createApp({ db }), db };
}

type Api = ReturnType<typeof createApp>;
const jsonHeaders = { 'content-type': 'application/json', origin: 'http://localhost:3000' };

async function signup(api: Api, email: string, orgSlug: string) {
  const response = await api.request('/v1/auth/signup', {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({
      email, password: 'long-password', displayName: email,
      organization: { name: `${orgSlug} org`, slug: orgSlug },
    }),
  });
  const body = await response.json() as { user: { id: string; tenantId: string } };
  const cookie = /nexa_session=([0-9a-f]{64})/.exec(response.headers.get('set-cookie') ?? '')?.[1];
  return { cookie: `nexa_session=${cookie}`, userId: body.user.id, tenantId: body.user.tenantId };
}

/** Adds a global identity to a tenant with a role directly through the repo, then signs them in. */
async function addMemberWithRole(api: Api, db: DbHandle, tenantId: string, email: string, roleId: string) {
  const [user] = await db.db.insert(users).values({ email, passwordHash: await hashPassword('long-password'), displayName: email, status: 'active' }).returning();
  await organizationRepository(db).addMember(tenantId, user!.id, roleId);
  const login = await api.request('/v1/auth/login', {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email, password: 'long-password' }),
  });
  return { cookie: login.headers.get('set-cookie')?.split(';')[0] ?? '', userId: user!.id };
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

/** A module with two entities, enabled, so the records can be written. */
async function buildModule(api: Api, cookie: string, userId: string) {
  const headers = { ...jsonHeaders, cookie };
  const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: userId, type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
  await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
  await call('/entities', 'POST', { id: 'invoice', name: 'invoice', label: 'Invoice', pluralLabel: 'Invoices' });
  for (const to of ['review', 'published', 'enabled']) await call('/transition', 'POST', { to });
  return call;
}

describe("a module's own permission definitions", () => {
  it('narrows a role to the actions the module lists for the resource', async () => {
    const { api, db } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const member = await addMemberWithRole(api, db, owner.tenantId, 'member@acme.test', 'member');
    const ownerCall = await buildModule(api, owner.cookie, owner.userId);
    const memberCall = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers: { ...jsonHeaders, cookie: member.cookie }, body: body === undefined ? undefined : JSON.stringify(body),
    });

    // The module lets the member read the vehicles and nothing else.
    const created = await ownerCall('/permissions', 'POST', {
      id: 'member-vehicles', roleId: 'member', resource: { type: 'entity', id: 'vehicle' }, actions: ['read'],
    });
    expect(created.status).toBe(201);

    // The vehicles are readable and not writable.
    expect((await memberCall('/entities/vehicle/records', 'GET')).status).toBe(200);
    expect((await memberCall('/entities/vehicle/records', 'POST', { data: {} })).status).toBe(403);
    // The invoice entity is not covered, so the platform's answer stands and the member may write it.
    expect((await memberCall('/entities/invoice/records', 'POST', { data: {} })).status).toBe(201);
  });

  it('never widens what the platform allows', async () => {
    const { api, db } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const viewer = await addMemberWithRole(api, db, owner.tenantId, 'viewer@acme.test', 'viewer');
    const ownerCall = await buildModule(api, owner.cookie, owner.userId);

    // The module is happy to hand the viewer a write.
    const created = await ownerCall('/permissions', 'POST', {
      id: 'viewer-vehicles', roleId: 'viewer', resource: { type: 'entity', id: 'vehicle' }, actions: ['read', 'create', 'update', 'delete'],
    });
    expect(created.status).toBe(201);

    // The platform does not, and both gates have to pass.
    const response = await api.request('/v1/modules/fleet/entities/vehicle/records', {
      method: 'POST', headers: { ...jsonHeaders, cookie: viewer.cookie }, body: JSON.stringify({ data: {} }),
    });
    expect(response.status).toBe(403);
  });

  it('narrows the package routes with a definition that covers the whole module', async () => {
    const { api, db } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const member = await addMemberWithRole(api, db, owner.tenantId, 'member@acme.test', 'member');
    const ownerCall = await buildModule(api, owner.cookie, owner.userId);

    // The member may read the module but not take its package away.
    const created = await ownerCall('/permissions', 'POST', {
      id: 'member-module', roleId: 'member', resource: { type: 'module' }, actions: ['read'],
    });
    expect(created.status).toBe(201);

    const exported = await api.request('/v1/modules/fleet/package', { headers: { ...jsonHeaders, cookie: member.cookie } });
    expect(exported.status).toBe(403);
    // The owner is not narrowed by it.
    expect((await api.request('/v1/modules/fleet/package', { headers: { ...jsonHeaders, cookie: owner.cookie } })).status).toBe(200);
  });

  it('lets the owner undo the narrowing by editing the definition', async () => {
    const { api, db } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const member = await addMemberWithRole(api, db, owner.tenantId, 'member@acme.test', 'member');
    const ownerCall = await buildModule(api, owner.cookie, owner.userId);
    await ownerCall('/permissions', 'POST', {
      id: 'member-vehicles', roleId: 'member', resource: { type: 'entity', id: 'vehicle' }, actions: ['read'],
    });

    const memberCall = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers: { ...jsonHeaders, cookie: member.cookie }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect((await memberCall('/entities/vehicle/records', 'POST', { data: {} })).status).toBe(403);

    // The owner widens the definition again, and the member may write.
    const updated = await ownerCall('/permissions/member-vehicles', 'PATCH', { actions: ['read', 'create'] });
    expect(updated.status).toBe(200);
    expect((await memberCall('/entities/vehicle/records', 'POST', { data: {} })).status).toBe(201);
  });

  it('leaves a module without permission definitions alone', async () => {
    const { api, db } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const member = await addMemberWithRole(api, db, owner.tenantId, 'member@acme.test', 'member');
    await buildModule(api, owner.cookie, owner.userId);

    const response = await api.request('/v1/modules/fleet/entities/vehicle/records', {
      method: 'POST', headers: { ...jsonHeaders, cookie: member.cookie }, body: JSON.stringify({ data: {} }),
    });
    expect(response.status).toBe(201);
  });
});
