import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from './client';
import type { TenantContext } from './tenancy';
import { invitations, organizationMemberships, roleAssignments, userRoleMemberships, users } from './schema';
import { InvitableRoleIdSchema, type InvitableRoleId } from '@nexa/meta';

export class MembershipNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MembershipNotFoundError';
  }
}

export class LastOwnerError extends Error {
  constructor(message = 'Organization must keep at least one owner') {
    super(message);
    this.name = 'LastOwnerError';
  }
}

export class InvitationError extends Error {
  constructor(message = 'Invitation is not valid') {
    super(message);
    this.name = 'InvitationError';
  }
}

/** Roles an invitation may grant. Owner is excluded so invitations cannot escalate privilege. Source of truth: meta. */
export const invitableRoleIds = InvitableRoleIdSchema.options;

/** Owners may assign any role; admins may assign only non-owner roles. */
const assignableByAdmin = invitableRoleIds;

export const invitationTtlMs = 7 * 24 * 60 * 60 * 1000;

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isInvitableRole(roleId: string): roleId is InvitableRoleId {
  return (invitableRoleIds as readonly string[]).includes(roleId);
}

/**
 * Tenant-scoped membership and invitation operations. Every query is filtered by the
 * context's tenantId, so a caller cannot touch another organization by passing its id.
 */
export function membershipRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;

  /** Serializes owner-changing writes for this tenant. Concurrent changes wait here, then re-read. */
  const lockTenantMemberships = async (tx: Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0]) => {
    await tx.select({ userId: organizationMemberships.userId }).from(organizationMemberships)
      .where(eq(organizationMemberships.tenantId, tenantId))
      .for('update');
  };

  const ownerCount = async (tx: Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0]) => {
    const rows = await tx.select({ userId: userRoleMemberships.userId }).from(userRoleMemberships)
      .innerJoin(organizationMemberships, and(
        eq(organizationMemberships.tenantId, userRoleMemberships.tenantId),
        eq(organizationMemberships.userId, userRoleMemberships.userId),
      ))
      .where(and(
        eq(userRoleMemberships.tenantId, tenantId),
        eq(userRoleMemberships.roleId, 'owner'),
        eq(organizationMemberships.status, 'active'),
      ));
    return new Set(rows.map((row) => row.userId)).size;
  };

  return {
    /** Lists active members with their role ids. */
    async listMembers() {
      const rows = await handle.db.select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        roleId: userRoleMemberships.roleId,
      }).from(organizationMemberships)
        .innerJoin(users, eq(users.id, organizationMemberships.userId))
        .leftJoin(userRoleMemberships, and(
          eq(userRoleMemberships.tenantId, organizationMemberships.tenantId),
          eq(userRoleMemberships.userId, organizationMemberships.userId),
        ))
        .where(and(eq(organizationMemberships.tenantId, tenantId), eq(organizationMemberships.status, 'active')))
        .orderBy(asc(users.email));

      const members = new Map<string, { userId: string; email: string; displayName: string; roleIds: string[] }>();
      for (const row of rows) {
        const member = members.get(row.userId) ?? { userId: row.userId, email: row.email, displayName: row.displayName, roleIds: [] };
        if (row.roleId && !member.roleIds.includes(row.roleId)) member.roleIds.push(row.roleId);
        members.set(row.userId, member);
      }
      return [...members.values()];
    },

    /**
     * Replaces a member's role. Callers pass `actorRoleIds` so the rules can be checked here,
     * not only in routes: admins cannot grant or remove owner, and the last owner cannot be demoted.
     */
    async changeRole(input: { actorRoleIds: string[]; userId: string; roleId: string }): Promise<void> {
      const actorIsOwner = input.actorRoleIds.includes('owner');
      const actorIsAdmin = input.actorRoleIds.includes('admin');
      if (!actorIsOwner && !actorIsAdmin) throw new InvitationError('Insufficient permission to change roles');
      if (input.roleId === 'owner' && !actorIsOwner) throw new InvitationError('Only an owner can grant the owner role');
      if (!actorIsOwner && !(assignableByAdmin as readonly string[]).includes(input.roleId)) {
        throw new InvitationError('Admins can only assign non-owner roles');
      }

      await handle.db.transaction(async (tx) => {
        await lockTenantMemberships(tx);
        const [role] = await tx.select({ id: roleAssignments.id }).from(roleAssignments)
          .where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.id, input.roleId))).limit(1);
        if (!role) throw new MembershipNotFoundError('Role does not exist in this organization');

        const [membership] = await tx.select({ userId: organizationMemberships.userId }).from(organizationMemberships)
          .where(and(eq(organizationMemberships.tenantId, tenantId), eq(organizationMemberships.userId, input.userId), eq(organizationMemberships.status, 'active')))
          .limit(1);
        if (!membership) throw new MembershipNotFoundError('User is not a member of this organization');

        const currentRoles = await tx.select({ roleId: userRoleMemberships.roleId }).from(userRoleMemberships)
          .where(and(eq(userRoleMemberships.tenantId, tenantId), eq(userRoleMemberships.userId, input.userId)));
        const currentlyOwner = currentRoles.some((row) => row.roleId === 'owner');
        if (currentlyOwner && input.roleId !== 'owner' && !actorIsOwner) {
          throw new InvitationError('Only an owner can change another owner');
        }
        if (currentlyOwner && input.roleId !== 'owner' && (await ownerCount(tx)) <= 1) {
          throw new LastOwnerError();
        }

        await tx.delete(userRoleMemberships).where(and(eq(userRoleMemberships.tenantId, tenantId), eq(userRoleMemberships.userId, input.userId)));
        await tx.insert(userRoleMemberships).values({ tenantId, userId: input.userId, roleId: input.roleId });
      });
    },

    /** Removes a member's organization membership and roles. Blocks removal of the last owner. */
    async removeMember(input: { actorRoleIds: string[]; userId: string }): Promise<void> {
      const actorIsOwner = input.actorRoleIds.includes('owner');
      const actorIsAdmin = input.actorRoleIds.includes('admin');
      if (!actorIsOwner && !actorIsAdmin) throw new InvitationError('Insufficient permission to remove members');

      await handle.db.transaction(async (tx) => {
        await lockTenantMemberships(tx);
        const currentRoles = await tx.select({ roleId: userRoleMemberships.roleId }).from(userRoleMemberships)
          .where(and(eq(userRoleMemberships.tenantId, tenantId), eq(userRoleMemberships.userId, input.userId)));
        const targetIsOwner = currentRoles.some((row) => row.roleId === 'owner');
        if (targetIsOwner && !actorIsOwner) throw new InvitationError('Only an owner can remove an owner');
        if (targetIsOwner && (await ownerCount(tx)) <= 1) throw new LastOwnerError();

        const removed = await tx.delete(organizationMemberships).where(and(
          eq(organizationMemberships.tenantId, tenantId),
          eq(organizationMemberships.userId, input.userId),
        )).returning();
        if (!removed.length) throw new MembershipNotFoundError('User is not a member of this organization');
      });
    },

    /** Creates an invitation. Only the token hash is stored; the raw token is returned once to the caller. */
    async createInvitation(input: { actorUserId: string; actorRoleIds: string[]; email: string; roleId: string; now?: Date }) {
      const actorIsOwner = input.actorRoleIds.includes('owner');
      const actorIsAdmin = input.actorRoleIds.includes('admin');
      if (!actorIsOwner && !actorIsAdmin) throw new InvitationError('Insufficient permission to invite members');
      if (!isInvitableRole(input.roleId)) throw new InvitationError('Invitations cannot grant this role');
      if (!actorIsOwner && !(assignableByAdmin as readonly string[]).includes(input.roleId)) {
        throw new InvitationError('Admins can only invite non-owner roles');
      }

      const token = randomBytes(32).toString('hex');
      const now = input.now ?? new Date();
      const [row] = await handle.db.insert(invitations).values({
        tenantId,
        email: input.email.trim().toLowerCase(),
        roleId: input.roleId,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + invitationTtlMs),
        createdBy: input.actorUserId,
      }).returning();
      return { id: row.id, email: row.email, roleId: row.roleId, expiresAt: row.expiresAt, token };
    },

    /** Revokes an invitation that has not been accepted. Returns false when nothing matched. */
    async revokeInvitation(invitationId: string, now: Date = new Date()): Promise<boolean> {
      const rows = await handle.db.update(invitations).set({ revokedAt: now })
        .where(and(
          eq(invitations.tenantId, tenantId),
          eq(invitations.id, invitationId),
          sql`${invitations.acceptedAt} IS NULL`,
          sql`${invitations.revokedAt} IS NULL`,
        )).returning();
      return rows.length > 0;
    },

    /**
     * Accepts an invitation for a signed-in user. Every failure throws the same InvitationError so
     * the response does not reveal which check failed.
     */
    async acceptInvitation(input: { token: string; userId: string; now?: Date }): Promise<{ roleId: string }> {
      const now = input.now ?? new Date();
      const tokenHash = hashInvitationToken(input.token);
      return handle.db.transaction(async (tx) => {
        // The email comes from the account, never from the caller, so a token cannot be redeemed by a different address.
        const [account] = await tx.select({ email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1);
        if (!account) throw new InvitationError();
        const [invitation] = await tx.select().from(invitations)
          .where(and(eq(invitations.tenantId, tenantId), eq(invitations.tokenHash, tokenHash)))
          .for('update')
          .limit(1);
        if (!invitation) throw new InvitationError();
        if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now) throw new InvitationError();
        if (invitation.email !== account.email.trim().toLowerCase()) throw new InvitationError();
        if (!isInvitableRole(invitation.roleId)) throw new InvitationError();

        const [existing] = await tx.select({ userId: organizationMemberships.userId }).from(organizationMemberships)
          .where(and(eq(organizationMemberships.tenantId, tenantId), eq(organizationMemberships.userId, input.userId)))
          .limit(1);
        if (existing) throw new InvitationError();

        await tx.insert(organizationMemberships).values({ tenantId, userId: input.userId });
        await tx.insert(userRoleMemberships).values({ tenantId, userId: input.userId, roleId: invitation.roleId });
        await tx.update(invitations).set({ acceptedAt: now })
          .where(and(eq(invitations.tenantId, tenantId), eq(invitations.id, invitation.id)));
        return { roleId: invitation.roleId };
      });
    },

    /** Lists this organization's invitations, newest first. Token hashes are never returned. */
    async listInvitations() {
      return handle.db.select({
        id: invitations.id,
        email: invitations.email,
        roleId: invitations.roleId,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        createdAt: invitations.createdAt,
      }).from(invitations)
        .where(eq(invitations.tenantId, tenantId))
        .orderBy(asc(invitations.createdAt));
    },
  };
}
