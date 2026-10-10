import { afterEach, describe, expect, it } from 'vitest';
import { createDb, membershipRepository, createTenantContext, organizationRepository, runMigrations, SYSTEM_TENANT_ID, tenants, users } from '@nexa/db';
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

describe('membership HTTP surface (Phase 17, Step E)', () => {
  it('requires authentication for management endpoints', async () => {
    const { api } = await createTestApp();
    expect((await api.request('/v1/members')).status).toBe(401);
    expect((await api.request('/v1/invitations')).status).toBe(401);
    expect((await api.request('/v1/organizations', { method: 'POST', headers: jsonHeaders, body: '{}' })).status).toBe(401);
  });

  it('ignores a caller-supplied x-tenant-id header and uses the session tenant', async () => {
    const { api } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const other = await signup(api, 'owner@other.test', 'other');
    const response = await api.request('/v1/members', { headers: { cookie: owner.cookie, 'x-tenant-id': other.tenantId } });
    expect(response.status).toBe(200);
    const members = await response.json() as Array<{ userId: string }>;
    expect(members.map((m) => m.userId)).toEqual([owner.userId]);
  });

  it('lets an owner invite, and the invited user accept into the chosen organization', async () => {
    const { api, db } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const invite = await api.request('/v1/invitations', {
      method: 'POST', headers: { ...jsonHeaders, cookie: owner.cookie }, body: JSON.stringify({ email: 'new@acme.test', roleId: 'member' }),
    });
    expect(invite.status).toBe(201);
    const { token } = await invite.json() as { token: string };

    const invitee = await signup(api, 'new@acme.test', 'newco');
    const accept = await api.request('/v1/invitations/accept', {
      method: 'POST', headers: { ...jsonHeaders, cookie: invitee.cookie }, body: JSON.stringify({ token, tenantId: owner.tenantId }),
    });
    expect(accept.status).toBe(200);
    expect(await accept.json()).toMatchObject({ tenantId: owner.tenantId, roleId: 'member' });
    expect((await membershipRepository(db, createTenantContext(owner.tenantId)).listMembers()).map((m) => m.email)).toContain('new@acme.test');
  });

  it('returns the same 404 for an accept with the wrong email, a reused token, or a bad token', async () => {
    const { api } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const invite = await api.request('/v1/invitations', {
      method: 'POST', headers: { ...jsonHeaders, cookie: owner.cookie }, body: JSON.stringify({ email: 'bound@acme.test', roleId: 'viewer' }),
    });
    const { token } = await invite.json() as { token: string };

    const wrong = await signup(api, 'stranger@acme.test', 'strangers');
    const mismatch = await api.request('/v1/invitations/accept', {
      method: 'POST', headers: { ...jsonHeaders, cookie: wrong.cookie }, body: JSON.stringify({ token, tenantId: owner.tenantId }),
    });
    const badToken = await api.request('/v1/invitations/accept', {
      method: 'POST', headers: { ...jsonHeaders, cookie: wrong.cookie }, body: JSON.stringify({ token: 'b'.repeat(64), tenantId: owner.tenantId }),
    });
    expect(mismatch.status).toBe(404);
    expect(badToken.status).toBe(404);
    expect((await mismatch.json()).error.code).toBe((await badToken.json()).error.code);
  });

  it('rejects an owner invitation at the schema layer', async () => {
    const { api } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const response = await api.request('/v1/invitations', {
      method: 'POST', headers: { ...jsonHeaders, cookie: owner.cookie }, body: JSON.stringify({ email: 'x@acme.test', roleId: 'owner' }),
    });
    expect(response.status).toBe(400);
  });

  it('denies viewers and members from managing members or inviting', async () => {
    const { api, db } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const viewer = await addMemberWithRole(api, db, owner.tenantId, 'viewer@acme.test', 'viewer');
    const member = await addMemberWithRole(api, db, owner.tenantId, 'member@acme.test', 'member');
    for (const session of [viewer, member]) {
      expect((await api.request('/v1/members', { headers: { cookie: session.cookie } })).status).toBe(403);
      expect((await api.request('/v1/invitations', {
        method: 'POST', headers: { ...jsonHeaders, cookie: session.cookie }, body: JSON.stringify({ email: 'a@acme.test', roleId: 'viewer' }),
      })).status).toBe(403);
    }
  });

  it('refuses to demote the last owner over HTTP with 409 LAST_OWNER', async () => {
    const { api } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const response = await api.request(`/v1/members/${owner.userId}`, {
      method: 'PATCH', headers: { ...jsonHeaders, cookie: owner.cookie }, body: JSON.stringify({ roleId: 'member' }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('LAST_OWNER');
  });

  it('rejects a malformed userId with 400 rather than a database error', async () => {
    const { api } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const response = await api.request('/v1/members/not-a-uuid', {
      method: 'PATCH', headers: { ...jsonHeaders, cookie: owner.cookie }, body: JSON.stringify({ roleId: 'member' }),
    });
    expect(response.status).toBe(400);
  });

  it('creates a second organization for an existing user, who becomes its owner', async () => {
    const { api } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const response = await api.request('/v1/organizations', {
      method: 'POST', headers: { ...jsonHeaders, cookie: owner.cookie }, body: JSON.stringify({ name: 'Second Org', slug: 'second-org' }),
    });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: string; roleIds: string[] };
    expect(created.roleIds).toEqual(['owner']);
    const orgs = await api.request('/v1/auth/organizations', { headers: { cookie: owner.cookie } });
    expect((await orgs.json() as Array<{ id: string }>).map((o) => o.id)).toEqual(expect.arrayContaining([owner.tenantId, created.id]));
  });

  it('revokes a pending invitation and then rejects its acceptance', async () => {
    const { api } = await createTestApp();
    const owner = await signup(api, 'owner@acme.test', 'acme');
    const invite = await api.request('/v1/invitations', {
      method: 'POST', headers: { ...jsonHeaders, cookie: owner.cookie }, body: JSON.stringify({ email: 'gone@acme.test', roleId: 'member' }),
    });
    const { id, token } = await invite.json() as { id: string; token: string };
    expect((await api.request(`/v1/invitations/${id}/revoke`, { method: 'POST', headers: { cookie: owner.cookie, origin: 'http://localhost:3000' } })).status).toBe(204);

    const invitee = await signup(api, 'gone@acme.test', 'gonecorp');
    const accept = await api.request('/v1/invitations/accept', {
      method: 'POST', headers: { ...jsonHeaders, cookie: invitee.cookie }, body: JSON.stringify({ token, tenantId: owner.tenantId }),
    });
    expect(accept.status).toBe(404);
  });
});
