import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbHandle } from './client';
import { organizationMemberships, roleAssignments, sessions, tenants, userRoleMemberships, users } from './schema';
import { AuthConflictError } from './auth-repo';

export class OrganizationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationConflictError';
  }
}

export class MembershipConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MembershipConflictError';
  }
}

function uniqueConstraint(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== '23505') return undefined;
  return 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : '';
}

const organizationRoles = [
  { id: 'owner', name: 'Owner' },
  { id: 'admin', name: 'Administrator' },
  { id: 'member', name: 'Member' },
  { id: 'viewer', name: 'Viewer' },
] as const;

/** Seeds the four system roles for a new organization. Shared by signup and organization creation. */
async function seedOrganizationRoles(tx: { insert: DbHandle['db']['insert'] }, tenantId: string) {
  await tx.insert(roleAssignments).values(organizationRoles.map((role) => ({
    tenantId,
    ...role,
    description: '',
    isSystemRole: 'true',
  })));
}

export function organizationRepository(handle: DbHandle) {
  return {
    /**
     * Every tenant on the platform. The scheduler walks them, because a
     * scheduled automation belongs to a tenant and the outbox is platform
     * level work.
     */
    async listTenantIds(): Promise<string[]> {
      const rows = await handle.db.select({ id: tenants.id }).from(tenants);
      return rows.map((row) => row.id);
    },

    async provisionForOwner(input: {
      name: string;
      slug: string;
      email: string;
      passwordHash: string;
      displayName?: string;
      sessionDigest: string;
      expiresAt: Date;
    }) {
      if (input.sessionDigest.length !== 64 || !/^[0-9a-f]+$/i.test(input.sessionDigest)) throw new Error('Invalid session token digest');
      if (input.expiresAt.getTime() <= Date.now()) throw new Error('Session expiry must be in the future');

      try {
        return await handle.db.transaction(async (tx) => {
          const [user] = await tx.insert(users).values({
            email: input.email.trim().toLowerCase(),
            passwordHash: input.passwordHash,
            displayName: input.displayName ?? '',
            status: 'active',
          }).returning();
          const [tenant] = await tx.insert(tenants).values({ id: randomUUID(), slug: input.slug, name: input.name }).returning();
          await seedOrganizationRoles(tx, tenant.id);
          await tx.insert(organizationMemberships).values({ tenantId: tenant.id, userId: user.id });
          await tx.insert(userRoleMemberships).values({ tenantId: tenant.id, userId: user.id, roleId: 'owner' });
          const [session] = await tx.insert(sessions).values({
            tenantId: tenant.id,
            userId: user.id,
            tokenDigest: input.sessionDigest.toLowerCase(),
            expiresAt: input.expiresAt,
          }).returning();
          return { tenant, user, session };
        });
      } catch (error) {
        const constraint = uniqueConstraint(error);
        if (constraint === 'nexa_users_email_uq') throw new AuthConflictError('Email already registered');
        if (constraint === 'nexa_tenants_slug_unique') throw new OrganizationConflictError('Organization slug already exists');
        throw error;
      }
    },

    /** Creates an organization owned by an existing user. The creator becomes its only owner. */
    async createForUser(input: { userId: string; name: string; slug: string }) {
      try {
        return await handle.db.transaction(async (tx) => {
          const [tenant] = await tx.insert(tenants).values({ id: randomUUID(), slug: input.slug, name: input.name }).returning();
          await seedOrganizationRoles(tx, tenant.id);
          await tx.insert(organizationMemberships).values({ tenantId: tenant.id, userId: input.userId });
          await tx.insert(userRoleMemberships).values({ tenantId: tenant.id, userId: input.userId, roleId: 'owner' });
          return tenant;
        });
      } catch (error) {
        if (uniqueConstraint(error) === 'nexa_tenants_slug_unique') throw new OrganizationConflictError('Organization slug already exists');
        throw error;
      }
    },

    async listForUser(userId: string) {
      const rows = await handle.db.select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        status: tenants.status,
        createdAt: tenants.createdAt,
        roleId: userRoleMemberships.roleId,
      }).from(organizationMemberships)
        .innerJoin(tenants, eq(organizationMemberships.tenantId, tenants.id))
        .leftJoin(userRoleMemberships, and(
          eq(userRoleMemberships.tenantId, organizationMemberships.tenantId),
          eq(userRoleMemberships.userId, organizationMemberships.userId),
        ))
        .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, 'active'), eq(tenants.status, 'active')))
        .orderBy(asc(tenants.createdAt), asc(tenants.id));

      const organizations = new Map<string, {
        id: string;
        slug: string;
        name: string;
        status: string;
        createdAt: Date;
        roleIds: string[];
      }>();
      for (const row of rows) {
        const organization = organizations.get(row.id) ?? {
          id: row.id,
          slug: row.slug,
          name: row.name,
          status: row.status,
          createdAt: row.createdAt,
          roleIds: [],
        };
        if (row.roleId && !organization.roleIds.includes(row.roleId)) organization.roleIds.push(row.roleId);
        organizations.set(row.id, organization);
      }
      return [...organizations.values()];
    },

    async addMember(tenantId: string, userId: string, roleId = 'member'): Promise<void> {
      try {
        await handle.db.transaction(async (tx) => {
          await tx.insert(organizationMemberships).values({ tenantId, userId });
          await tx.insert(userRoleMemberships).values({ tenantId, userId, roleId });
        });
      } catch (error) {
        if (uniqueConstraint(error)) throw new MembershipConflictError('User is already a member of this organization');
        throw error;
      }
    },

    async selectForSession(input: { sessionId: string; userId: string; currentTenantId: string; tenantId: string }): Promise<boolean> {
      return handle.db.transaction(async (tx) => {
        const [membership] = await tx.select({ userId: organizationMemberships.userId }).from(organizationMemberships)
          .innerJoin(tenants, eq(organizationMemberships.tenantId, tenants.id))
          .where(and(
            eq(organizationMemberships.tenantId, input.tenantId),
            eq(organizationMemberships.userId, input.userId),
            eq(organizationMemberships.status, 'active'),
            eq(tenants.status, 'active'),
          )).limit(1);
        if (!membership) return false;

        const [session] = await tx.update(sessions).set({ tenantId: input.tenantId })
          .where(and(
            eq(sessions.tenantId, input.currentTenantId),
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, input.userId),
            isNull(sessions.revokedAt),
          )).returning();
        return Boolean(session);
      });
    },
  };
}