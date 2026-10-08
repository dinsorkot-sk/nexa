import {
  EntityCreateInputSchema, EntityUpdateInputSchema, FieldCreateInputSchema, FieldUpdateInputSchema,
  HealthCheckSchema, ModuleCreateInputSchema, ModuleStatusSchema, ModuleTransitionInputSchema,
  ModuleUpdateInputSchema, RelationCreateInputSchema, RelationUpdateInputSchema,
  RecordCreateInputSchema, RecordQuerySchema, RecordUpdateInputSchema,
  LoginInputSchema, SignupInputSchema,
} from '@nexa/meta';
import {
  createDb, createTenantContext, SYSTEM_TENANT_ID, DefinitionConflictError, DefinitionNotFoundError,
  RecordConflictError, tenantRepository, definitionRepository, ModuleConflictError,
  ModuleNotFoundError, moduleRepository, authRepository, identityRepository, AuthConflictError,
} from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { validateRecordData } from '../../../packages/engine/entity/index';
import { parseQuery } from '../../../packages/engine/query/index';
import { hasPlatformPermission } from '../../../packages/engine/permission/index';
import { digestSessionToken, generateSessionToken, hashPassword, verifyPassword } from '../../../packages/auth/src/index';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

export interface AppDependencies { db?: DbHandle }
type Principal = { userId: string; tenantId: string; name: string | null; roleIds: string[]; sessionId: string };
const sessionCookie = 'nexa_session';
function errorResponse(code: string, message: string, status: 400 | 401 | 403 | 404 | 409 | 422 | 503, details?: unknown) {
  return { error: { code, message, status, ...(details === undefined ? {} : { details }) } };
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono().basePath('/v1');
  app.use('*', logger());
  app.use('*', cors());
  app.onError((error, c) => {
    console.error('API Error:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, 500);
  });

  app.get('/health', (c) => c.json(HealthCheckSchema.parse({ status: 'ok', timestamp: new Date().toISOString(), version: '0.0.1' })));
  app.get('/status', (c) => c.json({ service: 'nexa-platform', version: '0.0.1', framework: 'Nuxt + Hono' }));

  const principals = new WeakMap<object, Principal>();
  const cookieValue = (header: string | undefined, name: string): string | undefined => header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  const setSessionCookie = (c: Context, token: string, expiresAt: Date) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    c.header('Set-Cookie', `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`);
  };
  const clearSessionCookie = (c: Context) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    c.header('Set-Cookie', `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  };
  app.use('*', async (c, next) => {
    const token = cookieValue(c.req.header('cookie'), sessionCookie);
    if (token && dependencies.db) {
      const digest = digestSessionToken(token);
      const identity = identityRepository(dependencies.db);
      const session = await identity.getActiveSession(digest);
      if (session) {
        const user = await identity.getUser(session.tenantId, session.userId);
        if (user?.status === 'active') {
          const roleIds = await identity.listRoleIds(session.tenantId, session.userId);
          principals.set(c, { userId: user.id, tenantId: user.tenantId, name: user.displayName || null, roleIds, sessionId: session.id });
          void authRepository(dependencies.db, createTenantContext(session.tenantId)).touchSession(session.id).catch(() => {});
        }
      }
    }
    await next();
  });

  app.post('/auth/signup', async (c) => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    const parsed = SignupInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json(errorResponse('INVALID_INPUT', parsed.error.message, 400), 400);
    const tenantId = SYSTEM_TENANT_ID;
    const context = createTenantContext(tenantId);
    const auth = authRepository(dependencies.db, context);
    const email = parsed.data.email.trim().toLowerCase();
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      const user = await auth.createUser({ email, passwordHash, displayName: parsed.data.displayName });
      const roles = await auth.listRoles();
      const roleId = roles.length === 0 ? 'admin' : 'member';
      if (!roles.some((role) => role.id === roleId)) await auth.createRole({ id: roleId, name: roleId === 'admin' ? 'Administrator' : 'Member', isSystemRole: true });
      await auth.assignRole(user.id, roleId);
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await auth.createSession(user.id, digestSessionToken(token), expiresAt);
      setSessionCookie(c, token, expiresAt);
      return c.json({ user: { id: user.id, tenantId, email: user.email, displayName: user.displayName, status: user.status, createdAt: user.createdAt.toISOString() } }, 201);
    } catch (error) {
      if (error instanceof AuthConflictError) return c.json(errorResponse('AUTH_CONFLICT', error.message, 409), 409);
      throw error;
    }
  });
  app.post('/auth/login', async (c) => {
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    const parsed = LoginInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json(errorResponse('INVALID_INPUT', parsed.error.message, 400), 400);
    const identity = identityRepository(dependencies.db);
    const rows = await identity.findUserByEmail(parsed.data.email);
    const candidates = await Promise.all(rows.map(async (user) => ({ user, valid: await verifyPassword(parsed.data.password, user.passwordHash) })));
    const match = candidates.find(({ user, valid }) => valid && user.status === 'active');
    if (!match) return c.json(errorResponse('INVALID_CREDENTIALS', 'Email or password is incorrect', 401), 401);
    const roleIds = await identity.listRoleIds(match.user.tenantId, match.user.id);
    if (!roleIds.length) return c.json(errorResponse('INVALID_CREDENTIALS', 'Email or password is incorrect', 401), 401);
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await authRepository(dependencies.db, createTenantContext(match.user.tenantId)).createSession(match.user.id, digestSessionToken(token), expiresAt);
    setSessionCookie(c, token, expiresAt);
    return c.json({ user: { id: match.user.id, tenantId: match.user.tenantId, email: match.user.email, displayName: match.user.displayName, status: match.user.status, createdAt: match.user.createdAt.toISOString() } });
  });
  app.get('/auth/me', (c) => {
    const principal = principals.get(c);
    if (!principal) return c.json(errorResponse('AUTH_REQUIRED', 'Authentication is required', 401), 401);
    return c.json({ userId: principal.userId, tenantId: principal.tenantId, name: principal.name, roleIds: principal.roleIds });
  });
  app.post('/auth/logout', async (c) => {
    const principal = principals.get(c);
    const token = cookieValue(c.req.header('cookie'), sessionCookie);
    if (principal && token && dependencies.db) await authRepository(dependencies.db, createTenantContext(principal.tenantId)).revokeSession(digestSessionToken(token));
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  const withTenant = async (c: Context, permissionOrCallback: 'module:read' | 'module:write' | 'definition:read' | 'definition:write' | 'record:read' | 'record:write' | ((db: DbHandle, tenantId: string, principal: Principal) => Promise<Response>), maybeCallback?: (db: DbHandle, tenantId: string, principal: Principal) => Promise<Response>): Promise<Response> => {
    const permission = typeof permissionOrCallback === 'function'
      ? (c.req.path.includes('/records') ? (c.req.method === 'GET' ? 'record:read' : 'record:write') : (c.req.method === 'GET' ? 'definition:read' : 'definition:write'))
      : permissionOrCallback;
    const callback = typeof permissionOrCallback === 'function' ? permissionOrCallback : maybeCallback!;
    if (!dependencies.db) return c.json(errorResponse('DB_UNAVAILABLE', 'Database is unavailable', 503), 503);
    const principal = principals.get(c);
    if (!principal) return c.json(errorResponse('AUTH_REQUIRED', 'Authentication is required', 401), 401);
    if (!hasPlatformPermission(principal, permission)) return c.json(errorResponse('FORBIDDEN', 'Permission denied', 403), 403);
    try { return await callback(dependencies.db, principal.tenantId, principal); }
    catch (error) {
      if (error instanceof ModuleNotFoundError) return c.json(errorResponse('MODULE_NOT_FOUND', error.message, 404), 404);
      if (error instanceof ModuleConflictError) return c.json(errorResponse('MODULE_CONFLICT', error.message, 409), 409);
      if (error instanceof DefinitionNotFoundError) return c.json(errorResponse('DEFINITION_NOT_FOUND', error.message, 404), 404);
      if (error instanceof DefinitionConflictError) return c.json(errorResponse('DEFINITION_CONFLICT', error.message, 409), 409);
      if (error instanceof RecordConflictError) return c.json(errorResponse('RECORD_CONFLICT', error.message, 409), 409);
      if (error instanceof Error && error.name === 'RecordValidationError') return c.json(errorResponse('VALIDATION_FAILED', error.message, 422, 'issues' in error ? error.issues : undefined), 422);
      if (error instanceof Error && error.name === 'RecordQueryError') return c.json(errorResponse('INVALID_QUERY', error.message, 400, 'issues' in error ? error.issues : undefined), 400);
      if (error instanceof Error && error.name === 'ZodError') return c.json(errorResponse('INVALID_INPUT', error.message, 400), 400);
      throw error;
    }
  };
  const withModules = (c: Context, permissionOrCallback: 'module:read' | 'module:write' | ((repo: ReturnType<typeof moduleRepository>, tenantId: string, principal: Principal) => Promise<Response>), maybeCallback?: (repo: ReturnType<typeof moduleRepository>, tenantId: string, principal: Principal) => Promise<Response>) => withTenant(c, typeof permissionOrCallback === 'function' ? (c.req.method === 'GET' ? 'module:read' : 'module:write') : permissionOrCallback, (db, tenantId, principal) => {
    const repo = moduleRepository(db, createTenantContext(tenantId));
    return typeof permissionOrCallback === 'function' ? permissionOrCallback(repo, tenantId, principal) : maybeCallback!(repo, tenantId, principal);
  });
  const withDefinitions = (c: Context, permissionOrCallback: 'definition:read' | 'definition:write' | 'record:read' | 'record:write' | ((repo: ReturnType<typeof definitionRepository>, moduleId: string, tenantId: string, principal: Principal) => Promise<Response>), maybeCallback?: (repo: ReturnType<typeof definitionRepository>, moduleId: string, tenantId: string, principal: Principal) => Promise<Response>) => withTenant(c, typeof permissionOrCallback === 'function'
    ? (c.req.path.includes('/records') ? (c.req.method === 'GET' ? 'record:read' : 'record:write') : (c.req.method === 'GET' ? 'definition:read' : 'definition:write'))
    : permissionOrCallback, (db, tenantId, principal) => {
      const repo = definitionRepository(db, createTenantContext(tenantId));
      return typeof permissionOrCallback === 'function' ? permissionOrCallback(repo, c.req.param('moduleId') ?? '', tenantId, principal) : maybeCallback!(repo, c.req.param('moduleId') ?? '', tenantId, principal);
    });
  const invalid = (c: Context, message: string) => c.json(errorResponse('INVALID_INPUT', message, 400), 400);
  const missingDefinition = (c: Context, what: string) => c.json(errorResponse('DEFINITION_NOT_FOUND', `${what} not found`, 404), 404);
  const missingRecord = (c: Context) => c.json(errorResponse('RECORD_NOT_FOUND', 'Record not found', 404), 404);
  const redactHidden = <T extends { data: Record<string, unknown> }>(record: T, fields: Array<{ id: string; options: { hidden?: boolean } }>) => ({ ...record, data: Object.fromEntries(Object.entries(record.data).filter(([id]) => !fields.some((field) => field.id === id && field.options.hidden))) });
  const requireEnabled = async (repo: ReturnType<typeof moduleRepository>, moduleId: string) => (await repo.get(moduleId))?.status === 'enabled';

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

  app.get('/modules/:moduleId/schema', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.getModuleSchema(moduleId))));
  app.get('/modules/:moduleId/entities', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listEntities(moduleId))));
  app.post('/modules/:moduleId/entities', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const parsed = EntityCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createEntity(moduleId, parsed.data), 201);
  }));
  app.get('/modules/:moduleId/entities/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const entity = await repo.getEntity(moduleId, c.req.param('id'));
    return entity ? c.json(entity) : missingDefinition(c, 'Entity');
  }));
  app.patch('/modules/:moduleId/entities/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const parsed = EntityUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.updateEntity(moduleId, c.req.param('id'), parsed.data));
  }));
  app.delete('/modules/:moduleId/entities/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    await repo.deleteEntity(moduleId, c.req.param('id'));
    return c.body(null, 204);
  }));
  app.get('/modules/:moduleId/fields', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listFields(moduleId, c.req.query('entityId')))));
  app.post('/modules/:moduleId/entities/:entityId/fields', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const parsed = FieldCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createField(moduleId, c.req.param('entityId'), parsed.data), 201);
  }));
  app.get('/modules/:moduleId/fields/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const field = await repo.getField(moduleId, c.req.param('id'));
    return field ? c.json(field) : missingDefinition(c, 'Field');
  }));
  app.patch('/modules/:moduleId/fields/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const parsed = FieldUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.updateField(moduleId, c.req.param('id'), parsed.data));
  }));
  app.delete('/modules/:moduleId/fields/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    await repo.deleteField(moduleId, c.req.param('id'));
    return c.body(null, 204);
  }));
  app.get('/modules/:moduleId/relations', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listRelations(moduleId))));
  app.post('/modules/:moduleId/relations', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const parsed = RelationCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createRelation(moduleId, parsed.data), 201);
  }));
  app.get('/modules/:moduleId/relations/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const relation = await repo.getRelation(moduleId, c.req.param('id'));
    return relation ? c.json(relation) : missingDefinition(c, 'Relation');
  }));
  app.patch('/modules/:moduleId/relations/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const parsed = RelationUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.updateRelation(moduleId, c.req.param('id'), parsed.data));
  }));
  app.delete('/modules/:moduleId/relations/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    await repo.deleteRelation(moduleId, c.req.param('id'));
    return c.body(null, 204);
  }));

  app.get('/modules/:moduleId/entities/:entityId/records', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    if (!(await defs.getEntity(moduleId, entityId))) return missingDefinition(c, 'Entity');
    const fields = await defs.listFields(moduleId, entityId);
    const parsed = RecordQuerySchema.safeParse({ limit: c.req.query('limit'), offset: c.req.query('offset'), sort: c.req.query('sort'), filter: c.req.query('filter'), search: c.req.query('search') });
    if (!parsed.success) return invalid(c, parsed.error.message);
    const query = parseQuery(parsed.data, fields);
    const result = await tenantRepository(dependencies.db!, createTenantContext(tenantId)).listScopedRecords(moduleId, entityId, { ...query, fields });
    return c.json({ items: result.items.map((item) => redactHidden(item, fields)), total: result.total, limit: query.limit, offset: query.offset });
  }));
  app.post('/modules/:moduleId/entities/:entityId/records', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    const entity = await defs.getEntity(moduleId, entityId);
    if (!entity) return missingDefinition(c, 'Entity');
    const parsed = RecordCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    const fields = await defs.listFields(moduleId, entityId);
    const data = validateRecordData(entity, fields, parsed.data.data, { mode: 'create' });
    const repo = tenantRepository(dependencies.db!, createTenantContext(tenantId));
    await repo.assertReferences(moduleId, fields.filter((field) => field.type === 'reference'), data);
    const record = await repo.createScopedRecord(moduleId, entityId, data, undefined, fields.filter((field) => field.options.unique).map((field) => field.id));
    return c.json(redactHidden(record, fields), 201);
  }));
  app.get('/modules/:moduleId/entities/:entityId/records/:recordId', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    if (!(await defs.getEntity(moduleId, entityId))) return missingDefinition(c, 'Entity');
    const fields = await defs.listFields(moduleId, entityId);
    const record = await tenantRepository(dependencies.db!, createTenantContext(tenantId)).getScopedRecord(moduleId, entityId, c.req.param('recordId'));
    return record ? c.json(redactHidden(record, fields)) : missingRecord(c);
  }));
  app.patch('/modules/:moduleId/entities/:entityId/records/:recordId', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    const entity = await defs.getEntity(moduleId, entityId);
    if (!entity) return missingDefinition(c, 'Entity');
    const parsed = RecordUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    const fields = await defs.listFields(moduleId, entityId);
    const repo = tenantRepository(dependencies.db!, createTenantContext(tenantId));
    const existing = await repo.getScopedRecord(moduleId, entityId, c.req.param('recordId'));
    if (!existing) return missingRecord(c);
    const data = validateRecordData(entity, fields, parsed.data.data, { mode: 'update', existing: existing.data });
    await repo.assertReferences(moduleId, fields.filter((field) => field.type === 'reference'), data);
    const updated = await repo.updateScopedRecord(moduleId, entityId, c.req.param('recordId'), data, parsed.data.version ?? existing.version, undefined, fields.filter((field) => field.options.unique).map((field) => field.id));
    return updated ? c.json(redactHidden(updated, fields)) : missingRecord(c);
  }));
  app.delete('/modules/:moduleId/entities/:entityId/records/:recordId', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    if (!(await defs.getEntity(moduleId, c.req.param('entityId')))) return missingDefinition(c, 'Entity');
    const relations = await defs.listRelations(moduleId);
    const deleted = await tenantRepository(dependencies.db!, createTenantContext(tenantId)).deleteScopedRecord(moduleId, c.req.param('entityId'), c.req.param('recordId'), relations);
    return deleted ? c.body(null, 204) : missingRecord(c);
  }));

  app.get('/modules/:moduleId/entities/:entityId/records/:recordId/relations/:relationId', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const relation = await defs.getRelation(moduleId, c.req.param('relationId'));
    if (!relation) return missingDefinition(c, 'Relation');
    const entityId = c.req.param('entityId');
    if (relation.sourceEntityId !== entityId && relation.targetEntityId !== entityId) return invalid(c, 'Relation does not include this entity');
    const links = await tenantRepository(dependencies.db!, createTenantContext(tenantId)).listRelationTargets(moduleId, entityId, relation, c.req.param('recordId'));
    return links === undefined ? missingRecord(c) : c.json(links);
  }));
  app.post('/modules/:moduleId/entities/:entityId/records/:recordId/relations/:relationId/:targetRecordId', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const relation = await defs.getRelation(moduleId, c.req.param('relationId'));
    if (!relation) return missingDefinition(c, 'Relation');
    if (relation.sourceEntityId !== c.req.param('entityId')) return invalid(c, 'Relation source does not match this entity');
    const link = await tenantRepository(dependencies.db!, createTenantContext(tenantId)).createRelationLink(moduleId, relation, c.req.param('recordId'), c.req.param('targetRecordId'));
    return c.json(link, 201);
  }));
  app.delete('/modules/:moduleId/entities/:entityId/records/:recordId/relations/:relationId/:targetRecordId', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const relation = await defs.getRelation(moduleId, c.req.param('relationId'));
    if (!relation) return missingDefinition(c, 'Relation');
    if (relation.sourceEntityId !== c.req.param('entityId')) return invalid(c, 'Relation source does not match this entity');
    const link = await tenantRepository(dependencies.db!, createTenantContext(tenantId)).unlinkRelation(moduleId, relation, c.req.param('recordId'), c.req.param('targetRecordId'));
    return link ? c.body(null, 204) : missingRecord(c);
  }));

  return app;
}
const productionDb = createDb();
export const app = createApp({ db: productionDb });
export const routes = app;
export type AppType = typeof routes;
export default app;
