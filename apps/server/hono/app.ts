import {
  HealthCheckSchema,
  ModuleCreateInputSchema,
  ModuleStatusSchema,
  ModuleTransitionInputSchema,
  ModuleUpdateInputSchema,
} from '@nexa/meta';
import { createDb, createTenantContext, ModuleConflictError, ModuleNotFoundError, moduleRepository } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

export interface AppDependencies {
  db?: DbHandle;
}

function errorResponse(code: string, message: string, status: 400 | 404 | 409 | 503) {
  return { error: { code, message, status } };
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono().basePath('/v1');
  app.use('*', logger());
  app.use('*', cors());

  app.onError((error, c) => {
    console.error('API Error:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: error.message || 'An unexpected error occurred' } }, 500);
  });

  app.get('/health', (c) => {
    const health = HealthCheckSchema.parse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    });
    return c.json(health);
  });

  app.get('/status', (c) => c.json({
    service: 'nexa-platform',
    version: '0.0.1',
    framework: 'Nuxt + Hono',
  }));

  const withModules = async (
    c: Context,
    callback: (repository: ReturnType<typeof moduleRepository>) => Promise<Response>,
  ): Promise<Response> => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Module registry is unavailable', 503), 503);
    const tenantId = c.req.header('x-tenant-id');
    if (!tenantId) return c.json(errorResponse('TENANT_REQUIRED', 'x-tenant-id header is required', 400), 400);
    let context;
    try {
      context = createTenantContext(tenantId);
    } catch {
      return c.json(errorResponse('INVALID_TENANT', 'x-tenant-id must be a valid UUID', 400), 400);
    }
    try {
      return await callback(moduleRepository(dependencies.db, context));
    } catch (error) {
      if (error instanceof ModuleNotFoundError) return c.json(errorResponse('MODULE_NOT_FOUND', error.message, 404), 404);
      if (error instanceof ModuleConflictError) return c.json(errorResponse('MODULE_CONFLICT', error.message, 409), 409);
      if (error instanceof Error && error.name === 'ZodError') return c.json(errorResponse('INVALID_INPUT', error.message, 400), 400);
      throw error;
    }
  };

  app.get('/modules', async (c) => withModules(c, async (repository) => {
    const rawStatus = c.req.query('status');
    const parsedStatus = rawStatus === undefined ? undefined : ModuleStatusSchema.safeParse(rawStatus);
    if (parsedStatus && !parsedStatus.success) {
      return c.json(errorResponse('INVALID_INPUT', parsedStatus.error.message, 400), 400);
    }
    return c.json(await repository.list(parsedStatus?.success ? parsedStatus.data : undefined));
  }));

  app.post('/modules', async (c) => withModules(c, async (repository) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = ModuleCreateInputSchema.safeParse(body);
    if (!parsed.success) return c.json(errorResponse('INVALID_INPUT', parsed.error.message, 400), 400);
    const module = await repository.create(parsed.data);
    return c.json(module, 201);
  }));

  app.get('/modules/:id', async (c) => withModules(c, async (repository) => {
    const module = await repository.get(c.req.param('id'));
    return module ? c.json(module) : c.json(errorResponse('MODULE_NOT_FOUND', 'Module not found', 404), 404);
  }));

  app.patch('/modules/:id', async (c) => withModules(c, async (repository) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = ModuleUpdateInputSchema.safeParse(body);
    if (!parsed.success) return c.json(errorResponse('INVALID_INPUT', parsed.error.message, 400), 400);
    return c.json(await repository.update(c.req.param('id'), parsed.data));
  }));

  app.post('/modules/:id/transition', async (c) => withModules(c, async (repository) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = ModuleTransitionInputSchema.safeParse(body);
    if (!parsed.success) return c.json(errorResponse('INVALID_INPUT', parsed.error.message, 400), 400);
    return c.json(await repository.transition(c.req.param('id'), parsed.data.to));
  }));

  return app;
}

const productionDb = createDb();
export const app = createApp({ db: productionDb });
export const routes = app;
export type AppType = typeof routes;
export default app;
