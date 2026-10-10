import { Hono } from 'hono';
import { ModuleCreateInputSchema, ModuleStatusSchema, ModuleTransitionInputSchema, ModuleUpdateInputSchema } from '@nexa/meta';
import { createHelpers, errorResponse, invalid, type AppDependencies } from '../shared';

export function moduleRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withModules } = createHelpers(dependencies);

  app.get('/modules', async (c) => withModules(c, async (repo) => {
    const raw = c.req.query('status');
    const status = raw === undefined ? undefined : ModuleStatusSchema.safeParse(raw);
    if (status && !status.success) return invalid(c, status.error.message);
    return c.json(await repo.list(status?.success ? status.data : undefined));
  }));
  app.post('/modules', async (c) => withModules(c, async (repo) => {
    const parsed = ModuleCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.create(parsed.data), 201);
  }));
  app.get('/modules/:id', async (c) => withModules(c, async (repo) => {
    const module = await repo.get(c.req.param('id'));
    return module ? c.json(module) : c.json(errorResponse('MODULE_NOT_FOUND', 'Module not found', 404), 404);
  }));
  app.patch('/modules/:id', async (c) => withModules(c, async (repo) => {
    const parsed = ModuleUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.update(c.req.param('id'), parsed.data));
  }));
  app.post('/modules/:id/transition', async (c) => withModules(c, async (repo) => {
    const parsed = ModuleTransitionInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.transition(c.req.param('id'), parsed.data.to));
  }));

  return app;
}
