import { Hono } from 'hono';
import { InvitationAcceptInputSchema, InvitationCreateInputSchema } from '@nexa/meta';
import { createTenantContext, membershipRepository } from '@nexa/db';
import { createHelpers, errorResponse, invalid, principals, type AppDependencies, type Principal } from '../shared';
import { membershipError } from './members';

export function invitationRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withTenant } = createHelpers(dependencies);

  /** Lists this organization's invitations. Token hashes are never returned. Requires member:manage. */
  app.get('/invitations', async (c) => withTenant(c, 'member:manage', async (db, tenantId) => {
    return c.json(await membershipRepository(db, createTenantContext(tenantId)).listInvitations());
  }));

  /**
   * Creates an invitation. The raw token is returned exactly once; only its hash is stored.
   * Email delivery is not wired in this phase, so the caller is responsible for sharing the token.
   */
  app.post('/invitations', async (c) => withTenant(c, 'member:manage', async (db, tenantId, principal: Principal) => {
    const parsed = InvitationCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    try {
      const invitation = await membershipRepository(db, createTenantContext(tenantId)).createInvitation({
        actorUserId: principal.userId,
        actorRoleIds: principal.roleIds,
        email: parsed.data.email,
        roleId: parsed.data.roleId,
      });
      return c.json({
        id: invitation.id,
        email: invitation.email,
        roleId: invitation.roleId,
        expiresAt: invitation.expiresAt,
        token: invitation.token,
      }, 201);
    } catch (error) {
      const mapped = membershipError(c, error);
      if (mapped) return mapped;
      throw error;
    }
  }));

  /** Revokes a pending invitation. Requires member:manage. */
  app.post('/invitations/:id/revoke', async (c) => withTenant(c, 'member:manage', async (db, tenantId) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return invalid(c, 'id must be a UUID');
    const revoked = await membershipRepository(db, createTenantContext(tenantId)).revokeInvitation(id);
    if (!revoked) return c.json(errorResponse('INVITATION_NOT_FOUND', 'Invitation not found or not pending', 404), 404);
    return c.body(null, 204);
  }));

  /**
   * Accepts an invitation for the signed-in user. Any signed-in user may call this: the token is the
   * capability and the repo checks the account's email matches the invitation. Every failure returns
   * the same INVITATION_NOT_FOUND so the response does not reveal which check failed.
   */
  app.post('/invitations/accept', async (c) => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    const principal = principals.get(c);
    if (!principal) return c.json(errorResponse('AUTH_REQUIRED', 'Authentication is required', 401), 401);
    const parsed = InvitationAcceptInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    try {
      const { roleId } = await membershipRepository(dependencies.db, createTenantContext(parsed.data.tenantId)).acceptInvitation({
        token: parsed.data.token,
        userId: principal.userId,
      });
      return c.json({ tenantId: parsed.data.tenantId, roleId });
    } catch (error) {
      if (error instanceof Error && error.name === 'InvitationError') {
        return c.json(errorResponse('INVITATION_NOT_FOUND', 'Invitation is not valid', 404), 404);
      }
      throw error;
    }
  });

  return app;
}
