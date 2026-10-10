import { Hono } from 'hono';
import { MemberRoleUpdateInputSchema } from '@nexa/meta';
import type { Context } from 'hono';
import { createTenantContext, InvitationError, LastOwnerError, MembershipNotFoundError, membershipRepository } from '@nexa/db';
import { createHelpers, errorResponse, invalid, type AppDependencies, type Principal } from '../shared';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maps membership-domain errors to HTTP. Shared with the invitations routes. */
export function membershipError(c: Context, error: unknown) {
  if (error instanceof LastOwnerError) return c.json(errorResponse('LAST_OWNER', error.message, 409), 409);
  if (error instanceof MembershipNotFoundError) return c.json(errorResponse('MEMBER_NOT_FOUND', error.message, 404), 404);
  if (error instanceof InvitationError) return c.json(errorResponse('FORBIDDEN', error.message, 403), 403);
  return undefined;
}

export function memberRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withTenant } = createHelpers(dependencies);

  /** Lists active members of the caller's organization. Requires member:manage (owner, admin). */
  app.get('/members', async (c) => withTenant(c, 'member:manage', async (db, tenantId) => {
    return c.json(await membershipRepository(db, createTenantContext(tenantId)).listMembers());
  }));

  app.patch('/members/:userId', async (c) => withTenant(c, 'member:manage', async (db, tenantId, principal: Principal) => {
    const userId = c.req.param('userId');
    if (!uuid.test(userId)) return invalid(c, 'userId must be a UUID');
    const parsed = MemberRoleUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    try {
      await membershipRepository(db, createTenantContext(tenantId)).changeRole({
        actorRoleIds: principal.roleIds,
        userId,
        roleId: parsed.data.roleId,
      });
      return c.json({ userId, roleId: parsed.data.roleId });
    } catch (error) {
      const mapped = membershipError(c, error);
      if (mapped) return mapped;
      throw error;
    }
  }));

  app.delete('/members/:userId', async (c) => withTenant(c, 'member:manage', async (db, tenantId, principal: Principal) => {
    const userId = c.req.param('userId');
    if (!uuid.test(userId)) return invalid(c, 'userId must be a UUID');
    try {
      await membershipRepository(db, createTenantContext(tenantId)).removeMember({ actorRoleIds: principal.roleIds, userId });
      return c.body(null, 204);
    } catch (error) {
      const mapped = membershipError(c, error);
      if (mapped) return mapped;
      throw error;
    }
  }));

  return app;
}
