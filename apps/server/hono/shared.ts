import type { Context } from 'hono';
import type { ActionDefinition, WebhookActionConfig } from '../../../packages/meta/src/index';
import {
  createTenantContext, DefinitionConflictError, DefinitionNotFoundError,
  RecordConflictError, definitionRepository, automationRepository, ModuleConflictError,
  ModuleNotFoundError, moduleRepository,
} from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { dispatchAutomations as dispatchAutomationEvent } from '../../../packages/engine/automation/dispatch';
import type { AutomationEvent } from '../../../packages/engine/automation/index';
import { hasPlatformPermission, type PlatformPermission } from '../../../packages/engine/permission/index';
import { deliverWebhook } from '../../../integrations/webhook/src/index';
import { sendNotification } from '../../../integrations/email/src/index';
import { NotificationActionConfigSchema, WebhookActionConfigSchema } from '@nexa/meta';

export interface AppDependencies {
  db?: DbHandle;
  /** Injected in tests so webhook deliveries never touch the network. */
  webhookTransport?: Parameters<typeof deliverWebhook>[2];
  /** Injected in tests so notification deliveries stay in-process. */
  emailTransport?: Parameters<typeof sendNotification>[1];
}

export type Principal = { userId: string; tenantId: string; name: string | null; roleIds: string[]; sessionId: string };

/** Principals are keyed by the request context, so sub-apps see what the session middleware set. */
export const principals = new WeakMap<object, Principal>();

export function errorResponse(code: string, message: string, status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503, details?: unknown) {
  return { error: { code, message, status, ...(details === undefined ? {} : { details }) } };
}

export const invalid = (c: Context, message: string) => c.json(errorResponse('INVALID_INPUT', message, 400), 400);
export const missingDefinition = (c: Context, what: string) => c.json(errorResponse('DEFINITION_NOT_FOUND', `${what} not found`, 404), 404);
export const missingRecord = (c: Context) => c.json(errorResponse('RECORD_NOT_FOUND', 'Record not found', 404), 404);
export const redactHidden = <T extends { data: Record<string, unknown> }>(record: T, fields: Array<{ id: string; options: { hidden?: boolean } }>) => ({ ...record, data: Object.fromEntries(Object.entries(record.data).filter(([id]) => !fields.some((field) => field.id === id && field.options.hidden))) });
export const requireEnabled = async (repo: ReturnType<typeof moduleRepository>, moduleId: string) => (await repo.get(moduleId))?.status === 'enabled';

/** Creates the tenant-scoped request wrappers used by every module route. */
export function createHelpers(dependencies: AppDependencies) {
  const withTenant = async (c: Context, permissionOrCallback: PlatformPermission | ((db: DbHandle, tenantId: string, principal: Principal) => Promise<Response>), maybeCallback?: (db: DbHandle, tenantId: string, principal: Principal) => Promise<Response>): Promise<Response> => {
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

  /** Fires automations after the triggering request commits. Delivery kinds are mapped here, not in the engine. */
  const dispatchAutomations = (tenantId: string, moduleId: string, event: AutomationEvent, actorId?: string) => {
    const ctx = createTenantContext(tenantId);
    const defs = definitionRepository(dependencies.db!, ctx);
    const runs = automationRepository(dependencies.db!, ctx);
    return dispatchAutomationEvent({
      listAutomations: (id) => defs.listAutomations(id),
      listActions: (id) => defs.listActions(id),
      runs,
      deliver: async (action: ActionDefinition, context) => {
        if (action.kind === 'webhook') {
          const config: WebhookActionConfig = WebhookActionConfigSchema.parse(action.config);
          await deliverWebhook(config, { event: context.event, automationId: context.automationId, actorId: context.actorId }, dependencies.webhookTransport);
        } else if (action.kind === 'notification') {
          await sendNotification(NotificationActionConfigSchema.parse(action.config), dependencies.emailTransport);
        }
        // Other action kinds are skipped until their phase; the run still records success for the supported ones.
      },
    }, moduleId, event, actorId);
  };

  return { withTenant, withModules, withDefinitions, dispatchAutomations };
}
