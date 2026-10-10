import { Hono } from 'hono';
import { OrganizationCreateInputSchema } from '@nexa/meta';
import { organizationRepository, OrganizationConflictError } from '@nexa/db';
import { errorResponse, invalid, principals, type AppDependencies } from '../shared';

export function organizationRoutes(dependencies: AppDependencies) {
  const app = new Hono();

  /** Creates another organization for the signed-in user. The caller becomes its only owner. */
  app.post('/organizations', async (c) => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    const principal = principals.get(c);
    if (!principal) return c.json(errorResponse('AUTH_REQUIRED', 'Authentication is required', 401), 401);
    const parsed = OrganizationCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    try {
      const tenant = await organizationRepository(dependencies.db).createForUser({
        userId: principal.userId,
        name: parsed.data.name,
        slug: parsed.data.slug,
      });
      return c.json({ id: tenant.id, slug: tenant.slug, name: tenant.name, roleIds: ['owner'] }, 201);
    } catch (error) {
      if (error instanceof OrganizationConflictError) return c.json(errorResponse('ORGANIZATION_CONFLICT', error.message, 409), 409);
      throw error;
    }
  });

  return app;
}
