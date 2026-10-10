import { Hono } from 'hono';
import { OrganizationSelectInputSchema, LoginInputSchema, SignupInputSchema } from '@nexa/meta';
import { authRepository, createTenantContext, identityRepository, OrganizationConflictError, organizationRepository, AuthConflictError } from '@nexa/db';
import { digestSessionToken, generateSessionToken, hashPassword, verifyPassword } from '../../../../packages/auth/src/index';
import { cookieValue, clearSessionCookie, sessionCookie, setSessionCookie } from '../middleware/session';
import { errorResponse, principals, type AppDependencies } from '../shared';

export function authRoutes(dependencies: AppDependencies) {
  const app = new Hono();

  app.post('/auth/signup', async (c) => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    if (process.env.NODE_ENV === 'production') {
      return c.json(errorResponse('SIGNUP_DISABLED', 'Organization signup is disabled until email verification is configured', 503), 503);
    }
    const parsed = SignupInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json(errorResponse('INVALID_INPUT', parsed.error.message, 400), 400);
    const passwordHash = await hashPassword(parsed.data.password);
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
      const { tenant, user } = await organizationRepository(dependencies.db).provisionForOwner({
        ...parsed.data.organization,
        email: parsed.data.email,
        passwordHash,
        displayName: parsed.data.displayName,
        sessionDigest: digestSessionToken(token),
        expiresAt,
      });
      setSessionCookie(c, token, expiresAt);
      return c.json({
        user: { id: user.id, tenantId: tenant.id, email: user.email, displayName: user.displayName, status: user.status, createdAt: user.createdAt.toISOString() },
        organization: { id: tenant.id, slug: tenant.slug, name: tenant.name, roleIds: ['owner'] },
      }, 201);
    } catch (error) {
      if (error instanceof AuthConflictError) return c.json(errorResponse('AUTH_CONFLICT', error.message, 409), 409);
      if (error instanceof OrganizationConflictError) return c.json(errorResponse('ORGANIZATION_CONFLICT', error.message, 409), 409);
      throw error;
    }
  });
  app.post('/auth/login', async (c) => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    const parsed = LoginInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json(errorResponse('INVALID_INPUT', parsed.error.message, 400), 400);
    const identity = identityRepository(dependencies.db);
    const user = await identity.findIdentityByEmail(parsed.data.email);
    if (!user || user.status !== 'active' || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return c.json(errorResponse('INVALID_CREDENTIALS', 'Email or password is incorrect', 401), 401);
    }
    const organizationRepo = organizationRepository(dependencies.db);
    const organizations = await organizationRepo.listForUser(user.id);
    if (!organizations.length) return c.json(errorResponse('INVALID_CREDENTIALS', 'Email or password is incorrect', 401), 401);
    if (!parsed.data.organizationId && organizations.length > 1) {
      return c.json(errorResponse('ORGANIZATION_REQUIRED', 'Select an organization to continue', 409, organizations.map(({ id, slug, name, roleIds }) => ({ id, slug, name, roleIds }))), 409);
    }
    const organization = parsed.data.organizationId
      ? organizations.find(({ id }) => id === parsed.data.organizationId)
      : organizations[0];
    if (!organization) return c.json(errorResponse('INVALID_CREDENTIALS', 'Email or password is incorrect', 401), 401);
    const roleIds = await identity.listRoleIds(organization.id, user.id);
    if (!roleIds.length) return c.json(errorResponse('INVALID_CREDENTIALS', 'Email or password is incorrect', 401), 401);
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await authRepository(dependencies.db, createTenantContext(organization.id)).createSession(user.id, digestSessionToken(token), expiresAt);
    setSessionCookie(c, token, expiresAt);
    return c.json({ user: { id: user.id, tenantId: organization.id, email: user.email, displayName: user.displayName, status: user.status, createdAt: user.createdAt.toISOString() } });
  });
  app.get('/auth/me', (c) => {
    const principal = principals.get(c);
    if (!principal) return c.json(errorResponse('AUTH_REQUIRED', 'Authentication is required', 401), 401);
    return c.json({ userId: principal.userId, tenantId: principal.tenantId, name: principal.name, roleIds: principal.roleIds });
  });
  app.get('/auth/organizations', async (c) => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    const principal = principals.get(c);
    if (!principal) return c.json(errorResponse('AUTH_REQUIRED', 'Authentication is required', 401), 401);
    return c.json(await organizationRepository(dependencies.db).listForUser(principal.userId));
  });
  app.post('/auth/organizations/select', async (c) => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    const principal = principals.get(c);
    if (!principal) return c.json(errorResponse('AUTH_REQUIRED', 'Authentication is required', 401), 401);
    const parsed = OrganizationSelectInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json(errorResponse('INVALID_INPUT', parsed.error.message, 400), 400);
    const selected = await organizationRepository(dependencies.db).selectForSession({
      sessionId: principal.sessionId,
      userId: principal.userId,
      currentTenantId: principal.tenantId,
      tenantId: parsed.data.tenantId,
    });
    if (!selected) return c.json(errorResponse('FORBIDDEN', 'Organization membership is required', 403), 403);
    return c.json({ tenantId: parsed.data.tenantId });
  });
  app.post('/auth/logout', async (c) => {
    const principal = principals.get(c);
    const token = cookieValue(c.req.header('cookie'), sessionCookie);
    if (principal && token && dependencies.db) await authRepository(dependencies.db, createTenantContext(principal.tenantId)).revokeSession(digestSessionToken(token));
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  return app;
}
