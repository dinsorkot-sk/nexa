import {
  EntityCreateInputSchema,
  EntityUpdateInputSchema,
  FieldCreateInputSchema,
  FieldUpdateInputSchema,
  HealthCheckSchema,
  ModuleCreateInputSchema,
  ModuleStatusSchema,
  ModuleTransitionInputSchema,
  ModuleUpdateInputSchema,
  RelationCreateInputSchema,
  RelationUpdateInputSchema,
} from '@nexa/meta';
import {
  createDb,
  createTenantContext,
  DefinitionConflictError,
  DefinitionNotFoundError,
  definitionRepository,
  ModuleConflictError,
  ModuleNotFoundError,
  moduleRepository,
} from '@nexa/db';
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

  // x-tenant-id is caller-supplied and NOT authentication; it is replaced by authenticated tenant context in Phase 6.
  const withTenant = async (
    c: Context,
    callback: (db: DbHandle, context: ReturnType<typeof createTenantContext>) => Promise<Response>,
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
      return await callback(dependencies.db, context);
    } catch (error) {
      if (error instanceof ModuleNotFoundError) return c.json(errorResponse('MODULE_NOT_FOUND', error.message, 404), 404);
      if (error instanceof ModuleConflictError) return c.json(errorResponse('MODULE_CONFLICT', error.message, 409), 409);
      if (error instanceof DefinitionNotFoundError) return c.json(errorResponse('DEFINITION_NOT_FOUND', error.message, 404), 404);
      if (error instanceof DefinitionConflictError) return c.json(errorResponse('DEFINITION_CONFLICT', error.message, 409), 409);
      if (error instanceof Error && error.name === 'ZodError') return c.json(errorResponse('INVALID_INPUT', error.message, 400), 400);
      throw error;
    }
  };

  const withModules = (
    c: Context,
    callback: (repository: ReturnType<typeof moduleRepository>) => Promise<Response>,
  ): Promise<Response> => withTenant(c, (db, context) => callback(moduleRepository(db, context)));

  const withDefinitions = (
    c: Context,
    callback: (repository: ReturnType<typeof definitionRepository>, moduleId: string) => Promise<Response>,
  ): Promise<Response> => withTenant(c, (db, context) => callback(definitionRepository(db, context), c.req.param('moduleId') ?? ''));

  const invalid = (c: Context, message: string) => c.json(errorResponse('INVALID_INPUT', message, 400), 400);
  const notFound = (c: Context, what: string) => c.json(errorResponse('DEFINITION_NOT_FOUND', `${what} not found`, 404), 404);

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

  // Module schema definitions: entities, fields, relations (editable while the module is draft/review).
  app.get('/modules/:moduleId/schema', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    return c.json(await definitions.getModuleSchema(moduleId));
  }));

  app.get('/modules/:moduleId/entities', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    return c.json(await definitions.listEntities(moduleId));
  }));

  app.post('/modules/:moduleId/entities', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const parsed = EntityCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await definitions.createEntity(moduleId, parsed.data), 201);
  }));

  app.get('/modules/:moduleId/entities/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const entity = await definitions.getEntity(moduleId, c.req.param('id'));
    return entity ? c.json(entity) : notFound(c, 'Entity');
  }));

  app.patch('/modules/:moduleId/entities/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const parsed = EntityUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await definitions.updateEntity(moduleId, c.req.param('id'), parsed.data));
  }));

  app.delete('/modules/:moduleId/entities/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    await definitions.deleteEntity(moduleId, c.req.param('id'));
    return c.body(null, 204);
  }));

  app.get('/modules/:moduleId/fields', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    return c.json(await definitions.listFields(moduleId, c.req.query('entityId')));
  }));

  app.post('/modules/:moduleId/entities/:entityId/fields', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const parsed = FieldCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await definitions.createField(moduleId, c.req.param('entityId'), parsed.data), 201);
  }));

  app.get('/modules/:moduleId/fields/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const field = await definitions.getField(moduleId, c.req.param('id'));
    return field ? c.json(field) : notFound(c, 'Field');
  }));

  app.patch('/modules/:moduleId/fields/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const parsed = FieldUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await definitions.updateField(moduleId, c.req.param('id'), parsed.data));
  }));

  app.delete('/modules/:moduleId/fields/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    await definitions.deleteField(moduleId, c.req.param('id'));
    return c.body(null, 204);
  }));

  app.get('/modules/:moduleId/relations', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    return c.json(await definitions.listRelations(moduleId));
  }));

  app.post('/modules/:moduleId/relations', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const parsed = RelationCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await definitions.createRelation(moduleId, parsed.data), 201);
  }));

  app.get('/modules/:moduleId/relations/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const relation = await definitions.getRelation(moduleId, c.req.param('id'));
    return relation ? c.json(relation) : notFound(c, 'Relation');
  }));

  app.patch('/modules/:moduleId/relations/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    const parsed = RelationUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await definitions.updateRelation(moduleId, c.req.param('id'), parsed.data));
  }));

  app.delete('/modules/:moduleId/relations/:id', async (c) => withDefinitions(c, async (definitions, moduleId) => {
    await definitions.deleteRelation(moduleId, c.req.param('id'));
    return c.body(null, 204);
  }));

  return app;
}

const productionDb = createDb();
export const app = createApp({ db: productionDb });
export const routes = app;
export type AppType = typeof routes;
export default app;
