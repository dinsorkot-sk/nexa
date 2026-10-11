import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, createTenantContext, authRepository, identityRepository, organizationRepository, AuthConflictError, OrganizationConflictError, tenants } from '../src/index';

const handles: Array<ReturnType<typeof createDb>> = [];

function createTestDb() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  return handle;
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe('@nexa/db auth repository', () => {
  it('creates users, enforces unique email, and manages roles/memberships', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const tenant = createTenantContext(SYSTEM_TENANT_ID);
    const auth = authRepository(handle, tenant);
    const identity = identityRepository(handle);

    const user = await auth.createUser({ email: 'Alice@example.com', passwordHash: 'hash', displayName: 'Alice' });
    expect(user.email).toBe('alice@example.com');
    await expect(auth.createUser({ email: 'alice@example.com', passwordHash: 'hash' })).rejects.toBeInstanceOf(AuthConflictError);

    expect((await identity.findUserByEmail('ALICE@EXAMPLE.COM'))).toHaveLength(1);
    expect(await identity.getUser(user.tenantId, user.id)).toMatchObject({ email: 'alice@example.com' });

    await auth.createRole({ id: 'admin', name: 'Administrator', isSystemRole: true });
    await auth.createRole({ id: 'member', name: 'Member', isSystemRole: false });
    await auth.assignRole(user.id, 'admin');
    await auth.assignRole(user.id, 'member');
    await auth.assignRole(user.id, 'member'); // idempotent

    const roles = await auth.listRoles();
    expect(roles.map((r) => r.id).sort()).toEqual(['admin', 'member']);
    expect((await identity.listRoleIds(user.tenantId, user.id)).sort()).toEqual(['admin', 'member']);
    expect((await auth.listMemberships(user.id)).map((m) => m.roleId).sort()).toEqual(['admin', 'member']);
  });

  it('creates and manages sessions securely', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const tenant = createTenantContext(SYSTEM_TENANT_ID);
    const auth = authRepository(handle, tenant);
    const identity = identityRepository(handle);

    const user = await auth.createUser({ email: 'bob@example.com', passwordHash: 'hash' });
    const digest = 'a'.repeat(64);
    const expiresAt = new Date(Date.now() + 60_000);
    const session = await auth.createSession(user.id, digest, expiresAt);
    expect(await identity.getActiveSession(digest)).toMatchObject({ id: session.id });
    expect(await identity.getSessionByDigest(digest)).toMatchObject({ id: session.id });

    await expect(auth.createSession(user.id, 'b'.repeat(65), expiresAt)).rejects.toThrow('Invalid session token digest');
    await expect(auth.createSession(user.id, digest, new Date(Date.now() - 1000))).rejects.toThrow('Session expiry must be in the future');

    await auth.revokeSession(digest);
    expect(await identity.getActiveSession(digest)).toBeUndefined();

    await auth.createSession(user.id, 'c'.repeat(64), new Date(Date.now() + 120_000));
    await auth.revokeAllForUser(user.id);
    expect(await identity.getActiveSession('c'.repeat(64))).toBeUndefined();

    const s3 = await auth.createSession(user.id, 'd'.repeat(64), new Date(Date.now() + 120_000));
    await auth.touchSession(s3.id);
  }, 15000);

  it('supports one identity in multiple organizations with tenant-scoped roles and sessions', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    const organizations = organizationRepository(handle);
    const first = await organizations.provisionForOwner({
      name: 'First Organization',
      slug: 'first-org',
      email: 'owner@example.com',
      passwordHash: 'hash',
      sessionDigest: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const second = await organizations.provisionForOwner({
      name: 'Second Organization',
      slug: 'second-org',
      email: 'second-owner@example.com',
      passwordHash: 'hash',
      sessionDigest: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await organizations.addMember(second.tenant.id, first.user.id, 'member');
    const memberships = await organizations.listForUser(first.user.id);
    expect(memberships).toHaveLength(2);
    expect(memberships.map(({ slug, roleIds }) => ({ slug, roleIds }))).toEqual([
      { slug: 'first-org', roleIds: ['owner'] },
      { slug: 'second-org', roleIds: ['member'] },
    ]);

    expect(await organizations.selectForSession({
      sessionId: first.session.id,
      userId: first.user.id,
      currentTenantId: first.tenant.id,
      tenantId: second.tenant.id,
    })).toBe(true);
    await expect(identityRepository(handle).getActiveSession('a'.repeat(64))).resolves.toMatchObject({ tenantId: second.tenant.id });

    expect(await organizations.selectForSession({
      sessionId: first.session.id,
      userId: first.user.id,
      currentTenantId: second.tenant.id,
      tenantId: SYSTEM_TENANT_ID,
    })).toBe(false);
    await expect(organizations.provisionForOwner({
      name: 'Duplicate Email Organization',
      slug: 'duplicate-email-org',
      email: 'OWNER@example.com',
      passwordHash: 'hash',
      sessionDigest: 'c'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toBeInstanceOf(AuthConflictError);
    await expect(organizations.provisionForOwner({
      name: 'Duplicate Slug Organization',
      slug: 'first-org',
      email: 'different-owner@example.com',
      passwordHash: 'hash',
      sessionDigest: 'd'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toBeInstanceOf(OrganizationConflictError);
    await expect(authRepository(handle, createTenantContext(first.tenant.id)).createUser({
      email: 'owner@example.com',
      passwordHash: 'hash',
    })).rejects.toBeInstanceOf(AuthConflictError);
  });
});
