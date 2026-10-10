import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbHandle } from './client';
import type { TenantContext } from './tenancy';
import { organizationMemberships, roleAssignments, sessions, tenants, userRoleMemberships, users } from './schema';

export class AuthNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthNotFoundError';
  }
}

export class AuthConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConflictError';
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export interface UserRecord {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: string;
  createdAt: Date;
}

export interface IdentityRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: string;
  createdAt: Date;
}

export interface RoleRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  isSystemRole: string;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  tenantId: string;
  userId: string;
  tokenDigest: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/** Read-only helpers used by the auth middleware before a principal is established. */
export function identityRepository(handle: DbHandle) {
  return {
    /** Resolves one global identity before its organization memberships are selected. */
    async findIdentityByEmail(email: string): Promise<IdentityRecord | undefined> {
      const [row] = await handle.db.select().from(users)
        .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).limit(1);
      return row as IdentityRecord | undefined;
    },
    /** Looks up the organizations associated with an email for internal/test tooling. */
    async findUserByEmail(email: string): Promise<UserRecord[]> {
      const rows = await handle.db.select({
        id: users.id,
        tenantId: organizationMemberships.tenantId,
        email: users.email,
        passwordHash: users.passwordHash,
        displayName: users.displayName,
        status: users.status,
        createdAt: users.createdAt,
      }).from(users).innerJoin(organizationMemberships, eq(users.id, organizationMemberships.userId))
        .innerJoin(tenants, eq(organizationMemberships.tenantId, tenants.id))
        .where(and(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`, eq(organizationMemberships.status, 'active'), eq(tenants.status, 'active')));
      return rows as UserRecord[];
    },
    async getActiveSession(tokenDigest: string): Promise<SessionRecord | undefined> {
      const [row] = await handle.db.select().from(sessions).where(and(
        eq(sessions.tokenDigest, tokenDigest),
        sql`${sessions.revokedAt} IS NULL`,
        sql`${sessions.expiresAt} > now()`,
      )).limit(1);
      return row as SessionRecord | undefined;
    },
    async getUser(tenantId: string, userId: string): Promise<UserRecord | undefined> {
      const [row] = await handle.db.select({
        id: users.id,
        tenantId: organizationMemberships.tenantId,
        email: users.email,
        passwordHash: users.passwordHash,
        displayName: users.displayName,
        status: users.status,
        createdAt: users.createdAt,
      }).from(users).innerJoin(organizationMemberships, eq(users.id, organizationMemberships.userId))
        .innerJoin(tenants, eq(organizationMemberships.tenantId, tenants.id))
        .where(and(eq(organizationMemberships.tenantId, tenantId), eq(users.id, userId), eq(organizationMemberships.status, 'active'), eq(tenants.status, 'active'))).limit(1);
      return row as UserRecord | undefined;
    },
    async listUsersByIds(tenantId: string, userIds: string[]): Promise<UserRecord[]> {
      if (!userIds.length) return [];
      const rows = await handle.db.select({
        id: users.id,
        tenantId: organizationMemberships.tenantId,
        email: users.email,
        passwordHash: users.passwordHash,
        displayName: users.displayName,
        status: users.status,
        createdAt: users.createdAt,
      }).from(users).innerJoin(organizationMemberships, eq(users.id, organizationMemberships.userId))
        .innerJoin(tenants, eq(organizationMemberships.tenantId, tenants.id))
        .where(and(eq(organizationMemberships.tenantId, tenantId), inArray(users.id, userIds), eq(organizationMemberships.status, 'active'), eq(tenants.status, 'active')));
      return rows as UserRecord[];
    },
    async listRoleIds(tenantId: string, userId: string): Promise<string[]> {
      const rows = await handle.db.select({ roleId: userRoleMemberships.roleId }).from(userRoleMemberships)
        .where(and(eq(userRoleMemberships.tenantId, tenantId), eq(userRoleMemberships.userId, userId)));
      return rows.map((row) => row.roleId);
    },
    async getSessionByDigest(tokenDigest: string): Promise<SessionRecord | undefined> {
      const [row] = await handle.db.select().from(sessions).where(eq(sessions.tokenDigest, tokenDigest)).limit(1);
      return row as SessionRecord | undefined;
    },
    async getRole(tenantId: string, roleId: string): Promise<RoleRecord | undefined> {
      const [row] = await handle.db.select().from(roleAssignments)
        .where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.id, roleId))).limit(1);
      return row as RoleRecord | undefined;
    },
  };
}

export function authRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;
  return {
    async createUser(input: { email: string; passwordHash: string; displayName?: string }): Promise<UserRecord> {
      try {
        return await handle.db.transaction(async (tx) => {
          const [created] = await tx.insert(users).values({
            email: input.email.trim().toLowerCase(),
            passwordHash: input.passwordHash,
            displayName: input.displayName ?? '',
            status: 'active',
          }).returning();
          await tx.insert(organizationMemberships).values({ tenantId, userId: created.id });
          return { ...created, tenantId } as UserRecord;
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new AuthConflictError('Email already registered');
        throw error;
      }
    },

    async createRole(input: { id: string; name: string; description?: string; isSystemRole?: boolean }): Promise<RoleRecord> {
      const row = {
        tenantId,
        id: input.id,
        name: input.name,
        description: input.description ?? '',
        isSystemRole: input.isSystemRole ? 'true' : 'false',
      };
      try {
        const [created] = await handle.db.insert(roleAssignments).values(row).returning();
        return created as RoleRecord;
      } catch (error) {
        if (isUniqueViolation(error)) throw new AuthConflictError(`Role already exists: ${input.id}`);
        throw error;
      }
    },

    async listRoles(): Promise<RoleRecord[]> {
      const rows = await handle.db.select().from(roleAssignments).where(eq(roleAssignments.tenantId, tenantId));
      return rows as RoleRecord[];
    },

    async removeRole(userId: string, roleId: string): Promise<void> {
      await handle.db.delete(userRoleMemberships).where(and(
        eq(userRoleMemberships.tenantId, tenantId),
        eq(userRoleMemberships.userId, userId),
        eq(userRoleMemberships.roleId, roleId),
      ));
    },
    async assignRole(userId: string, roleId: string): Promise<void> {
      try {
        await handle.db.insert(userRoleMemberships).values({ tenantId, userId, roleId }).onConflictDoNothing();
      } catch (error) {
        if (isUniqueViolation(error)) return;
        throw error;
      }
    },

    async listMemberships(userId: string): Promise<Array<{ roleId: string; userId: string }>> {
      const rows = await handle.db.select().from(userRoleMemberships)
        .where(and(eq(userRoleMemberships.tenantId, tenantId), eq(userRoleMemberships.userId, userId)));
      return rows.map((row) => ({ roleId: row.roleId, userId: row.userId }));
    },

    /** Creates a session row storing only the digest; the raw token never reaches the database. */
    async createSession(userId: string, tokenDigest: string, expiresAt: Date): Promise<SessionRecord> {
      if (tokenDigest.length !== 64 || !/^[0-9a-f]+$/i.test(tokenDigest)) throw new Error('Invalid session token digest');
      if (expiresAt.getTime() <= Date.now()) throw new Error('Session expiry must be in the future');
      const [created] = await handle.db.insert(sessions).values({ tenantId, userId, tokenDigest: tokenDigest.toLowerCase(), expiresAt }).returning();
      return created as SessionRecord;
    },

    async revokeSession(tokenDigest: string): Promise<void> {
      await handle.db.update(sessions).set({ revokedAt: new Date() })
        .where(and(eq(sessions.tenantId, tenantId), eq(sessions.tokenDigest, tokenDigest), sql`${sessions.revokedAt} IS NULL`));
    },

    async revokeAllForUser(userId: string): Promise<void> {
      await handle.db.update(sessions).set({ revokedAt: new Date() })
        .where(and(eq(sessions.tenantId, tenantId), eq(sessions.userId, userId), sql`${sessions.revokedAt} IS NULL`));
    },

    async touchSession(id: string): Promise<void> {
      await handle.db.update(sessions).set({ lastUsedAt: new Date() })
        .where(and(eq(sessions.tenantId, tenantId), eq(sessions.id, id)));
    },
  };
}

export function authNotFound(id: string): AuthNotFoundError {
  return new AuthNotFoundError(`Auth entity not found: ${id}`);
}