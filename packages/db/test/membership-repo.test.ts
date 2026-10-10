import { afterEach, describe, expect, it } from 'vitest';
import { createDb, createTenantContext, membershipRepository, organizationRepository, runMigrations, InvitationError, LastOwnerError, SYSTEM_TENANT_ID, tenants, users } from '../src/index';
import type { DbHandle } from '../src/index';

const handles: DbHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function setup() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const organizations = organizationRepository(handle);
  const owner = await organizations.provisionForOwner({
    name: 'Acme', slug: 'acme', email: 'owner@acme.test', passwordHash: 'h',
    sessionDigest: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60_000),
  });
  const other = await organizations.provisionForOwner({
    name: 'Other', slug: 'other', email: 'owner@other.test', passwordHash: 'h',
    sessionDigest: 'b'.repeat(64), expiresAt: new Date(Date.now() + 60_000),
  });
  const tenantId = owner.tenant.id;
  const repo = membershipRepository(handle, createTenantContext(tenantId));
  return { handle, repo, tenantId, ownerId: owner.user.id, otherTenantId: other.tenant.id, otherOwnerId: other.user.id };
}

/** Creates a global identity and makes it a member of the tenant with the given role. */
async function addUser(handle: DbHandle, tenantId: string, email: string, roleId: string) {
  const [user] = await handle.db.insert(users).values({ email, passwordHash: 'h', displayName: email, status: 'active' }).returning();
  await organizationRepository(handle).addMember(tenantId, user.id, roleId);
  return user.id;
}

describe('membership repository: invitations', () => {
  it('stores only a token hash and accepts a valid invitation once', async () => {
    const { handle, repo, tenantId, ownerId } = await setup();
    const invite = await repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['owner'], email: 'New@Acme.test', roleId: 'member' });
    expect(invite.email).toBe('new@acme.test');
    const stored = await repo.listInvitations();
    expect(JSON.stringify(stored)).not.toContain(invite.token);

    const [invitee] = await handle.db.insert(users).values({ email: 'new@acme.test', passwordHash: 'h', displayName: '', status: 'active' }).returning();
    const { roleId } = await repo.acceptInvitation({ token: invite.token, userId: invitee!.id });
    expect(roleId).toBe('member');
    await expect(repo.acceptInvitation({ token: invite.token, userId: invitee!.id })).rejects.toThrow(InvitationError);
  });

  it('rejects owner invitations and admin invitations of owner', async () => {
    const { repo, ownerId } = await setup();
    await expect(repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['owner'], email: 'a@acme.test', roleId: 'owner' })).rejects.toThrow(InvitationError);
    await expect(repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['admin'], email: 'a@acme.test', roleId: 'owner' })).rejects.toThrow(InvitationError);
  });

  it('denies member and viewer from creating invitations', async () => {
    const { repo, ownerId } = await setup();
    await expect(repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['member'], email: 'a@acme.test', roleId: 'viewer' })).rejects.toThrow(InvitationError);
    await expect(repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['viewer'], email: 'a@acme.test', roleId: 'viewer' })).rejects.toThrow(InvitationError);
  });

  it('rejects expired, revoked, and email-mismatched invitations with the same generic error', async () => {
    const { handle, repo, tenantId, ownerId } = await setup();
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const expired = await repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['owner'], email: 'e@acme.test', roleId: 'member', now: past });
    const eUser = await addUser(handle, tenantId, 'e@acme.test', 'viewer');
    await expect(repo.acceptInvitation({ token: expired.token, userId: eUser })).rejects.toThrow(InvitationError);

    const revoked = await repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['owner'], email: 'r@acme.test', roleId: 'member' });
    expect(await repo.revokeInvitation(revoked.id)).toBe(true);
    const rUser = await addUser(handle, tenantId, 'r@acme.test', 'viewer');
    await expect(repo.acceptInvitation({ token: revoked.token, userId: rUser })).rejects.toThrow(InvitationError);

    const mismatch = await repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['owner'], email: 'bound@acme.test', roleId: 'member' });
    const wrong = await addUser(handle, tenantId, 'wrong@acme.test', 'viewer');
    await expect(repo.acceptInvitation({ token: mismatch.token, userId: wrong })).rejects.toThrow(InvitationError);
  });

  it('does not reveal invitations from another tenant', async () => {
    const { handle, repo, ownerId, otherTenantId } = await setup();
    const otherRepo = membershipRepository(handle, createTenantContext(otherTenantId));
    const invite = await repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['owner'], email: 'iso@acme.test', roleId: 'member' });
    const user = await addUser(handle, otherTenantId, 'iso@acme.test', 'viewer');
    await expect(otherRepo.acceptInvitation({ token: invite.token, userId: user })).rejects.toThrow(InvitationError);
    expect(await otherRepo.listInvitations()).toHaveLength(0);
  });

  it('cannot revoke an accepted invitation, and a second revoke is a no-op', async () => {
    const { handle, repo, ownerId } = await setup();
    const invite = await repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['owner'], email: 'ok@acme.test', roleId: 'member' });
    const [invitee] = await handle.db.insert(users).values({ email: 'ok@acme.test', passwordHash: 'h', displayName: '', status: 'active' }).returning();
    await repo.acceptInvitation({ token: invite.token, userId: invitee!.id });
    expect(await repo.revokeInvitation(invite.id)).toBe(false);

    const pending = await repo.createInvitation({ actorUserId: ownerId, actorRoleIds: ['owner'], email: 'p@acme.test', roleId: 'member' });
    expect(await repo.revokeInvitation(pending.id)).toBe(true);
    expect(await repo.revokeInvitation(pending.id)).toBe(false);
  });
});

describe('membership repository: roles and removal', () => {
  it('lets an admin invite and change roles but not grant owner', async () => {
    const { handle, repo, tenantId } = await setup();
    const adminId = await addUser(handle, tenantId, 'admin@acme.test', 'admin');
    const memberId = await addUser(handle, tenantId, 'member@acme.test', 'member');
    await expect(repo.changeRole({ actorRoleIds: ['admin'], userId: memberId, roleId: 'owner' })).rejects.toThrow(InvitationError);
    await repo.changeRole({ actorRoleIds: ['admin'], userId: memberId, roleId: 'viewer' });
    const members = await repo.listMembers();
    expect(members.find((m) => m.userId === memberId)?.roleIds).toEqual(['viewer']);
    expect(members.find((m) => m.userId === adminId)?.roleIds).toEqual(['admin']);
  });

  it('refuses to demote or remove the last owner', async () => {
    const { repo, ownerId } = await setup();
    await expect(repo.changeRole({ actorRoleIds: ['owner'], userId: ownerId, roleId: 'member' })).rejects.toThrow(LastOwnerError);
    await expect(repo.removeMember({ actorRoleIds: ['owner'], userId: ownerId })).rejects.toThrow(LastOwnerError);
  });

  it('blocks the second demotion once only one owner remains', async () => {
    const { handle, repo, tenantId, ownerId } = await setup();
    const second = await addUser(handle, tenantId, 'second@acme.test', 'owner');
    await repo.changeRole({ actorRoleIds: ['owner'], userId: ownerId, roleId: 'member' });
    await expect(repo.changeRole({ actorRoleIds: ['owner'], userId: second, roleId: 'member' })).rejects.toThrow(LastOwnerError);
  });

  it('serialises concurrent demotions so the last owner survives', async () => {
    const { handle, repo, tenantId, ownerId } = await setup();
    const second = await addUser(handle, tenantId, 'two@acme.test', 'owner');
    const results = await Promise.allSettled([
      repo.changeRole({ actorRoleIds: ['owner'], userId: ownerId, roleId: 'member' }),
      repo.changeRole({ actorRoleIds: ['owner'], userId: second, roleId: 'member' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
    const owners = (await repo.listMembers()).filter((m) => m.roleIds.includes('owner'));
    expect(owners).toHaveLength(1);
  });

  it('denies member and viewer from changing roles or removing members', async () => {
    const { handle, repo, tenantId } = await setup();
    const targetId = await addUser(handle, tenantId, 'target@acme.test', 'viewer');
    await expect(repo.changeRole({ actorRoleIds: ['member'], userId: targetId, roleId: 'member' })).rejects.toThrow(InvitationError);
    await expect(repo.removeMember({ actorRoleIds: ['viewer'], userId: targetId })).rejects.toThrow(InvitationError);
  });

  it('only an owner may remove an owner, and removal revokes membership', async () => {
    const { handle, repo, tenantId } = await setup();
    const second = await addUser(handle, tenantId, 'co@acme.test', 'owner');
    const admin = await addUser(handle, tenantId, 'adm@acme.test', 'admin');
    await expect(repo.removeMember({ actorRoleIds: ['admin'], userId: second })).rejects.toThrow(InvitationError);
    await repo.removeMember({ actorRoleIds: ['admin'], userId: admin });
    expect((await repo.listMembers()).some((m) => m.userId === admin)).toBe(false);
  });
});
