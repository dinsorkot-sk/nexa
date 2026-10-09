import {
  ActionDefinitionSchema, AutomationDefinitionSchema, DashboardDefinitionSchema, ReportDefinitionSchema, WorkflowDefinitionSchema,
  NotificationActionConfigSchema, WebhookActionConfigSchema,
  EntityCreateInputSchema, EntityUpdateInputSchema, FieldCreateInputSchema, FieldUpdateInputSchema,
  HealthCheckSchema, ModuleCreateInputSchema, ModuleStatusSchema, ModuleTransitionInputSchema,
  ModuleUpdateInputSchema, RelationCreateInputSchema, RelationUpdateInputSchema,
  RecordCreateInputSchema, RecordQuerySchema, RecordUpdateInputSchema,
  LoginInputSchema, SignupInputSchema,
} from '@nexa/meta';
import {
  createDb, createTenantContext, SYSTEM_TENANT_ID, DefinitionConflictError, DefinitionNotFoundError,
  RecordConflictError, tenantRepository, definitionRepository, automationRepository, packageRepository, auditRepository, ModuleConflictError,
  ModuleNotFoundError, moduleRepository, authRepository, identityRepository, AuthConflictError,
} from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { validateRecordData } from '../../../packages/engine/entity/index';
import { parseQuery } from '../../../packages/engine/query/index';
import { hasPlatformPermission } from '../../../packages/engine/permission/index';
import { evaluateTransition } from '../../../packages/engine/workflow/transitions';
import { planAction } from '../../../packages/engine/workflow/actions';
import { selectAutomations } from '../../../packages/engine/automation/index';
import { runReport } from '../../../packages/engine/report/index';
import { isUpgrade } from '../../../packages/engine/pkg/index';
import { deliverWebhook } from '../../../integrations/webhook/src/index';
import { sendNotification } from '../../../integrations/email/src/index';
import { digestSessionToken, generateSessionToken, hashPassword, verifyPassword } from '../../../packages/auth/src/index';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

export interface AppDependencies {
  db?: DbHandle;
  /** Injected in tests so webhook deliveries never touch the network. */
  webhookTransport?: Parameters<typeof deliverWebhook>[2];
  /** Injected in tests so notification deliveries stay in-process. */
  emailTransport?: Parameters<typeof sendNotification>[1];
}
type Principal = { userId: string; tenantId: string; name: string | null; roleIds: string[]; sessionId: string };
const sessionCookie = 'nexa_session';
function errorResponse(code: string, message: string, status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503, details?: unknown) {
  return { error: { code, message, status, ...(details === undefined ? {} : { details }) } };
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono().basePath('/v1');
  app.use('*', logger());
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use('*', cors({
    origin: (origin) => allowedOrigins.includes(origin) ? origin : '',
    credentials: true,
  }));
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
  /**
   * Fires automations for an event after the triggering request commits.
   * Never throws: failures are recorded per-run as the delivery log.
   */
  async function dispatchAutomations(
    tenantId: string,
    moduleId: string,
    event: { type: 'event' | 'record' | 'workflow'; eventType?: string; entityId?: string; recordId?: string; operation?: 'created' | 'updated' | 'deleted'; workflowId?: string; transitionId?: string; payload?: Record<string, unknown> },
    actorId?: string,
  ) {
    const ctx = createTenantContext(tenantId);
    const defs = definitionRepository(dependencies.db!, ctx);
    const runs = automationRepository(dependencies.db!, ctx);
    const [automations, actions] = await Promise.all([defs.listAutomations(moduleId), defs.listActions(moduleId)]);
    const matched = selectAutomations(automations, { ...event, moduleId, actorId });
    for (const automation of matched) {
      const run = await runs.start({ moduleId, automationId: automation.id, triggerType: automation.trigger.type, recordId: event.recordId });
      let lastError: string | undefined;
      for (let attempt = 1; attempt <= automation.retry.maxAttempts + 1; attempt += 1) {
        try {
          for (const ref of automation.actions) {
            const action = actions.find((candidate) => candidate.id === ref.actionId);
            if (!action) continue;
            if (action.kind === 'webhook') {
              const config = WebhookActionConfigSchema.parse(action.config);
              await deliverWebhook(config, { event: event, automationId: automation.id, actorId }, dependencies.webhookTransport);
            } else if (action.kind === 'notification') {
              const config = NotificationActionConfigSchema.parse(action.config);
              await sendNotification(config, dependencies.emailTransport);
            }
            // Other action kinds are skipped until their phase; the run still records success for the supported ones.
          }
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          if (attempt <= automation.retry.maxAttempts) await runs.retry(run.id, attempt + 1, lastError);
        }
      }
      await runs.finish(run.id, lastError === undefined ? 'succeeded' : 'failed', lastError);
    }
  }

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

  const withTenant = async (c: Context, permissionOrCallback: 'module:read' | 'module:write' | 'definition:read' | 'definition:write' | 'record:read' | 'record:write' | 'workflow:transition' | 'action:execute' | 'automation:manage' | 'report:read' | 'report:manage' | ((db: DbHandle, tenantId: string, principal: Principal) => Promise<Response>), maybeCallback?: (db: DbHandle, tenantId: string, principal: Principal) => Promise<Response>): Promise<Response> => {
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
  const withDefinitions = (c: Context, permissionOrCallback: 'definition:read' | 'definition:write' | 'record:read' | 'record:write' | 'workflow:transition' | 'action:execute' | 'automation:manage' | 'report:read' | 'report:manage' | ((repo: ReturnType<typeof definitionRepository>, moduleId: string, tenantId: string, principal: Principal) => Promise<Response>), maybeCallback?: (repo: ReturnType<typeof definitionRepository>, moduleId: string, tenantId: string, principal: Principal) => Promise<Response>) => withTenant(c, typeof permissionOrCallback === 'function'
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
  app.get('/modules/:moduleId/workflows', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listWorkflows(moduleId))));
  app.post('/modules/:moduleId/workflows', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = WorkflowDefinitionSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createWorkflow(moduleId, parsed.data, principal.userId), 201);
  }));
  app.get('/modules/:moduleId/actions', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listActions(moduleId))));
  app.get('/modules/:moduleId/automations', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listAutomations(moduleId))));
  app.get('/modules/:moduleId/automations/:id/runs', async (c) => withDefinitions(c, async (repo, moduleId, tenantId) => {
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
  app.get('/modules/:moduleId/reports', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listReports(moduleId))));
  app.post('/modules/:moduleId/reports', async (c) => withDefinitions(c, 'report:manage', async (repo, moduleId, _tenantId, principal) => {
    const parsed = ReportDefinitionSchema.safeParse({ ...(await c.req.json().catch(() => undefined)), moduleId });
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createReport(moduleId, parsed.data, principal.userId), 201);
  }));
  app.post('/modules/:moduleId/reports/:id/run', async (c) => withDefinitions(c, 'report:read', async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const report = await defs.getReport(moduleId, c.req.param('id'));
    if (!report) return missingDefinition(c, 'Report');
    const fields = await defs.listFields(moduleId, report.entityId);
    const repo = tenantRepository(dependencies.db!, createTenantContext(tenantId));
    // Pull up to 1000 rows through the bounded, tenant-scoped record query.
    const pages: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await repo.listScopedRecords(moduleId, report.entityId, { limit: 100, offset, fields });
      pages.push(...page.items.map((item) => ({ id: item.id, data: item.data })));
      if (page.items.length < 100) break;
    }
    const groups = runReport(report, pages);
    return c.json({
      reportId: report.id,
      rowCount: pages.length,
      groups: groups.map((group) => ({ key: group.key, rowCount: group.rowCount, aggregates: group.aggregates })),
    });
  }));
  app.patch('/modules/:moduleId/reports/:id', async (c) => withDefinitions(c, 'report:manage', async (repo, moduleId, _tenantId, principal) => {
    const parsed = await c.req.json().catch(() => undefined);
    if (!parsed) return invalid(c, 'Body required');
    return c.json(await repo.updateReport(moduleId, c.req.param('id'), parsed as Record<string, unknown>, principal.userId));
  }));
  app.delete('/modules/:moduleId/reports/:id', async (c) => withDefinitions(c, 'report:manage', async (repo, moduleId, _tenantId, principal) => {
    await repo.deleteReport(moduleId, c.req.param('id'), principal.userId);
    return c.body(null, 204);
  }));
  app.get('/modules/:moduleId/dashboards', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listDashboards(moduleId))));
  app.get('/modules/:moduleId/dashboards/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const dashboard = await repo.getDashboard(moduleId, c.req.param('id'));
    return dashboard ? c.json(dashboard) : missingDefinition(c, 'Dashboard');
  }));
  app.post('/modules/:moduleId/dashboards', async (c) => withDefinitions(c, 'report:manage', async (repo, moduleId, _tenantId, principal) => {
    const parsed = DashboardDefinitionSchema.safeParse({ ...(await c.req.json().catch(() => undefined)), moduleId });
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createDashboard(moduleId, parsed.data, principal.userId), 201);
  }));
  app.patch('/modules/:moduleId/dashboards/:id', async (c) => withDefinitions(c, 'report:manage', async (repo, moduleId, _tenantId, principal) => {
    const parsed = await c.req.json().catch(() => undefined);
    if (!parsed) return invalid(c, 'Body required');
    return c.json(await repo.updateDashboard(moduleId, c.req.param('id'), parsed as Record<string, unknown>, principal.userId));
  }));
  app.delete('/modules/:moduleId/dashboards/:id', async (c) => withDefinitions(c, 'report:manage', async (repo, moduleId, _tenantId, principal) => {
    await repo.deleteDashboard(moduleId, c.req.param('id'), principal.userId);
    return c.body(null, 204);
  }));
  app.get('/modules/:moduleId/package', async (c) => withDefinitions(c, async (_repo, moduleId, tenantId) => {
    try {
      return c.json(await packageRepository(dependencies.db!, createTenantContext(tenantId)).exportPackage(moduleId));
    } catch (error) {
      return error instanceof ModuleNotFoundError || (error instanceof Error && error.message.startsWith('Module not found'))
        ? c.json(errorResponse('MODULE_NOT_FOUND', error.message, 404), 404)
        : c.json(errorResponse('EXPORT_FAILED', error instanceof Error ? error.message : 'Export failed', 500), 500);
    }
  }));
  app.post('/modules/:moduleId/package/upgrade', async (c) => withTenant(c, 'module:write', async (db, tenantId, principal) => {
    const body = await c.req.json().catch(() => undefined);
    if (!body || typeof body !== 'object') return invalid(c, 'Package payload required');
    const pkgPkgs = await import('@nexa/meta');
    const parsed = pkgPkgs.ModulePackageSchema.safeParse(body);
    if (!parsed.success) return invalid(c, parsed.error.message);
    const pkg = parsed.data;
    if (pkg.manifest.moduleId !== c.req.param('moduleId')) return invalid(c, 'Package moduleId does not match the URL');
    const modulesRepo = moduleRepository(db, createTenantContext(tenantId));
    const current = await modulesRepo.get(pkg.manifest.moduleId);
    if (!current) return c.json(errorResponse('MODULE_NOT_FOUND', `Module not found: ${pkg.manifest.moduleId}`, 404), 404);
    if (!isUpgrade(current.version, pkg.manifest.version)) {
      return c.json(errorResponse('VERSION_NOT_UPGRADE', `Incoming version ${pkg.manifest.version} must be greater than current ${current.version}`, 409), 409);
    }
    const repo = packageRepository(db, createTenantContext(tenantId));
    try {
      const updated = await repo.upgradePackage(pkg, principal.userId);
      return c.json({ upgraded: true, module: updated }, 200);
    } catch (error) {
      if (error instanceof DefinitionConflictError) return c.json(errorResponse('PACKAGE_CONFLICT', error.message, 409), 409);
      if (error instanceof ModuleConflictError) return c.json(errorResponse('MODULE_CONFLICT', error.message, 409), 409);
      throw error;
    }
  }));
  app.post('/modules/:moduleId/actions', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = ActionDefinitionSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createAction(moduleId, parsed.data, principal.userId), 201);
  }));
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
  app.post('/modules/:moduleId/entities/:entityId/records', async (c) => withDefinitions(c, async (defs, moduleId, tenantId, principal) => {
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
    const record = await repo.createScopedRecord(moduleId, entityId, data, principal.userId, fields.filter((field) => field.options.unique).map((field) => field.id));
    await dispatchAutomations(tenantId, moduleId, { type: 'record', entityId, recordId: record.id, operation: 'created', payload: { data } }, principal.userId);
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
  app.patch('/modules/:moduleId/entities/:entityId/records/:recordId', async (c) => withDefinitions(c, async (defs, moduleId, tenantId, principal) => {
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
    const updated = await repo.updateScopedRecord(moduleId, entityId, c.req.param('recordId'), data, parsed.data.version ?? existing.version, principal.userId, fields.filter((field) => field.options.unique).map((field) => field.id));
    if (updated) await dispatchAutomations(tenantId, moduleId, { type: 'record', entityId, recordId: updated.id, operation: 'updated', payload: { data } }, principal.userId);
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

  app.post('/modules/:moduleId/entities/:entityId/records/:recordId/transitions/:transitionId', async (c) => withDefinitions(c, 'workflow:transition', async (defs, moduleId, tenantId, principal) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    const entity = await defs.getEntity(moduleId, entityId);
    if (!entity) return missingDefinition(c, 'Entity');
    const workflow = (await defs.listWorkflows(moduleId)).find((candidate) => candidate.entityId === entityId);
    if (!workflow) return missingDefinition(c, 'Workflow');
    const parsed = RecordUpdateInputSchema.pick({ version: true }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return invalid(c, parsed.error.message);
    const fields = await defs.listFields(moduleId, entityId);
    const repo = tenantRepository(dependencies.db!, createTenantContext(tenantId));
    const existing = await repo.getScopedRecord(moduleId, entityId, c.req.param('recordId'));
    if (!existing) return missingRecord(c);
    const currentState = String(existing.data[workflow.stateFieldId] ?? workflow.states.find((state) => state.initial)?.id ?? '');
    const data = { ...existing.data, [workflow.stateFieldId]: currentState };
    const decision = evaluateTransition(workflow, c.req.param('transitionId'), currentState, principal.roleIds, data);
    if (!decision.ok) {
      const status = decision.rejection.code === 'FORBIDDEN' ? 403 : decision.rejection.code === 'TRANSITION_NOT_FOUND' ? 404 : 409;
      return c.json(errorResponse(decision.rejection.code, decision.rejection.message, status), status);
    }
    const nextData = { ...existing.data, [workflow.stateFieldId]: decision.nextStateId };
    const updated = await repo.runInTransaction(async (tx) => {
      const record = await repo.updateScopedRecord(moduleId, entityId, existing.id, nextData, parsed.data.version ?? existing.version, principal.userId, fields.filter((field) => field.options.unique).map((field) => field.id), tx);
      if (!record) return undefined;
      await repo.appendEvent({ eventType: 'workflow.transitioned', moduleId, entityId, recordId: record.id, actorId: principal.userId, payload: { workflowId: workflow.id, transitionId: decision.transition.id, from: currentState, to: decision.nextStateId } }, tx);
      return record;
    });
    if (updated) {
      // Execute the transition's actions after the commit; delivery failures never fail the transition.
      const allActions = await defs.listActions(moduleId);
      for (const ref of decision.transition.actions) {
        const action = allActions.find((candidate) => candidate.id === ref.actionId);
        if (!action) continue;
        try {
          if (action.kind === 'webhook') {
            await deliverWebhook(WebhookActionConfigSchema.parse(action.config), { event: 'workflow.transitioned', transitionId: decision.transition.id, recordId: updated.id }, dependencies.webhookTransport);
          } else if (action.kind === 'notification') {
            await sendNotification(NotificationActionConfigSchema.parse(action.config), dependencies.emailTransport);
          }
          // Other kinds are handled by their own surfaces until their phase.
        } catch (error) {
          console.error(`Transition action "${action.id}" failed:`, error);
        }
      }
      await dispatchAutomations(tenantId, moduleId, { type: 'workflow', entityId, recordId: updated.id, workflowId: workflow.id, transitionId: decision.transition.id, payload: { from: currentState, to: decision.nextStateId } }, principal.userId);
    }
    return updated ? c.json(redactHidden(updated, fields)) : missingRecord(c);
  }));

  app.post('/modules/:moduleId/entities/:entityId/records/:recordId/actions/:actionId', async (c) => withDefinitions(c, 'action:execute', async (defs, moduleId, tenantId, principal) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    const entity = await defs.getEntity(moduleId, entityId);
    if (!entity) return missingDefinition(c, 'Entity');
    const action = await defs.getAction(moduleId, c.req.param('actionId'));
    if (!action) return missingDefinition(c, 'Action');
    const plan = planAction(action.kind, action.config);
    if (!plan.ok) return c.json(errorResponse(plan.rejection.code, plan.rejection.message, 422), 422);
    const parsed = RecordUpdateInputSchema.pick({ version: true }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return invalid(c, parsed.error.message);
    const fields = await defs.listFields(moduleId, entityId);
    const repo = tenantRepository(dependencies.db!, createTenantContext(tenantId));
    const existing = await repo.getScopedRecord(moduleId, entityId, c.req.param('recordId'));
    if (!existing) return missingRecord(c);
    const result = await repo.runInTransaction(async (tx) => {
      if (plan.kind === 'updateRecord') {
        const data = validateRecordData(entity, fields, { ...existing.data, ...plan.set }, { mode: 'update', existing: existing.data });
        await repo.assertReferences(moduleId, fields.filter((field) => field.type === 'reference'), data);
        const record = await repo.updateScopedRecord(moduleId, entityId, existing.id, data, parsed.data.version ?? existing.version, principal.userId, fields.filter((field) => field.options.unique).map((field) => field.id), tx);
        if (!record) return undefined;
        await repo.appendEvent({ eventType: 'action.executed', moduleId, entityId, recordId: record.id, actorId: principal.userId, payload: { actionId: action.id, kind: plan.kind } }, tx);
        return record;
      }
      const record = await repo.getScopedRecord(moduleId, entityId, existing.id);
      if (!record) return undefined;
      await repo.appendEvent({ eventType: plan.eventType, moduleId, entityId, recordId: record.id, actorId: principal.userId, payload: { actionId: action.id, ...plan.payload } }, tx);
      return record;
    });
    if (result && plan.kind === 'emitEvent') {
      await dispatchAutomations(tenantId, moduleId, { type: 'event', entityId, recordId: result.id, eventType: (plan as { eventType: string }).eventType, payload: { actionId: action.id } }, principal.userId);
    }
    return result ? c.json(redactHidden(result, fields)) : missingRecord(c);
  }));

  app.get('/audit', async (c) => withTenant(c, 'definition:read', async (_db, tenantId) => {
    const audit = auditRepository(dependencies.db!, createTenantContext(tenantId));
    const limit = Number(c.req.query('limit') ?? '');
    const result = await audit.listAuditLog({
      action: c.req.query('action'),
      entityId: c.req.query('entityId'),
      recordId: c.req.query('recordId'),
      actorId: c.req.query('actorId'),
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      offset: Number.isFinite(Number(c.req.query('offset') ?? '')) && Number(c.req.query('offset')) > 0 ? Number(c.req.query('offset')) : undefined,
    });
    return c.json(result);
  }));
  app.get('/events', async (c) => withTenant(c, 'definition:read', async (_db, tenantId) => {
    const audit = auditRepository(dependencies.db!, createTenantContext(tenantId));
    const limit = Number(c.req.query('limit') ?? '');
    const result = await audit.listEvents({
      eventType: c.req.query('eventType'),
      moduleId: c.req.query('moduleId'),
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    });
    return c.json(result);
  }));
  app.get('/operations/stats', async (c) => withTenant(c, 'definition:read', async (_db, tenantId) => {
    const audit = auditRepository(dependencies.db!, createTenantContext(tenantId));
    const sinceParam = c.req.query('since');
    const since = sinceParam ? new Date(sinceParam) : undefined;
    return c.json(await audit.operationsStats(since && !Number.isNaN(since.getTime()) ? since : undefined));
  }));
  app.get('/modules/:moduleId/entities/:entityId/records/:recordId/activity', async (c) => withDefinitions(c, async (defs, moduleId, tenantId) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    if (!(await defs.getEntity(moduleId, entityId))) return missingDefinition(c, 'Entity');
    const fields = await defs.listFields(moduleId, entityId);
    const repo = tenantRepository(dependencies.db!, createTenantContext(tenantId));
    const record = await repo.getScopedRecord(moduleId, entityId, c.req.param('recordId'));
    if (!record) return missingRecord(c);
    const limitParam = Number(c.req.query('limit') ?? '');
    const activity = await repo.listRecordActivity(entityId, record.id, { limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined });
    const hiddenIds = new Set(fields.filter((field) => field.options.hidden).map((field) => field.id));
    const actorIds = [...new Set(activity.items.map((entry) => entry.actorId).filter((id): id is string => Boolean(id)))];
    const actors = await identityRepository(dependencies.db!).listUsersByIds(tenantId, actorIds);
    const actorNames = new Map(actors.map((user) => [user.id, user.displayName || user.email]));
    return c.json({
      items: activity.items.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorId: entry.actorId,
        actorName: entry.actorId ? actorNames.get(entry.actorId) ?? 'Unknown user' : 'System',
        occurredAt: entry.occurredAt,
        changes: Object.fromEntries(Object.entries(entry.changes ?? {}).map(([key, value]) => [key, hiddenIds.size && key === 'before' || key === 'after' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([fieldId]) => !hiddenIds.has(fieldId))) : value])),
      })),
      total: activity.total,
    });
  }));

  return app;
}
const productionDb = createDb();
export const app = createApp({ db: productionDb });
export const routes = app;
export type AppType = typeof routes;
export default app;
