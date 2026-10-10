import { Hono } from 'hono';
import { AutomationDefinitionSchema } from '@nexa/meta';
import { automationRepository, createTenantContext } from '@nexa/db';
import { createHelpers, invalid, type AppDependencies } from '../shared';

export function automationRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withDefinitions } = createHelpers(dependencies);

  app.get('/modules/:moduleId/automations', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listAutomations(moduleId))));
  app.get('/modules/:moduleId/automations/:id/runs', async (c) => withDefinitions(c, async (_repo, moduleId, tenantId) => {
    const runs = automationRepository(dependencies.db!, createTenantContext(tenantId));
    return c.json(await runs.list(moduleId, { automationId: c.req.param('id') }));
  }));
  app.post('/modules/:moduleId/automations', async (c) => withDefinitions(c, 'automation:manage', async (repo, moduleId, _tenantId, principal) => {
    const parsed = AutomationDefinitionSchema.safeParse({ ...(await c.req.json().catch(() => undefined)), moduleId });
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createAutomation(moduleId, parsed.data, principal.userId), 201);
  }));
  app.patch('/modules/:moduleId/automations/:id', async (c) => withDefinitions(c, 'automation:manage', async (repo, moduleId, _tenantId, principal) => {
    const parsed = await c.req.json().catch(() => undefined);
    if (!parsed) return invalid(c, 'Body required');
    return c.json(await repo.updateAutomation(moduleId, c.req.param('id'), parsed as Record<string, unknown>, principal.userId));
  }));
  app.delete('/modules/:moduleId/automations/:id', async (c) => withDefinitions(c, 'automation:manage', async (repo, moduleId, _tenantId, principal) => {
    await repo.deleteAutomation(moduleId, c.req.param('id'), principal.userId);
    return c.body(null, 204);
  }));

  return app;
}
