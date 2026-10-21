import { Hono } from 'hono';
import {
  ActionDefinitionSchema, EntityCreateInputSchema, EntityUpdateInputSchema, FieldCreateInputSchema, FieldUpdateInputSchema,
  ModulePackageSchema, RelationCreateInputSchema, RelationUpdateInputSchema, WorkflowDefinitionSchema,
} from '@nexa/meta';
import { DefinitionConflictError, ModuleConflictError, ModuleNotFoundError, createTenantContext, moduleRepository, packageRepository } from '@nexa/db';
import { isUpgrade } from '../../../../packages/engine/pkg/index';
import { createHelpers, errorResponse, invalid, missingDefinition, type AppDependencies } from '../shared';

/**
 * The definition kinds a package carries, with the ids of each. A definition
 * id is unique per kind inside a module, so the ids of one kind have to be
 * unique among themselves: the metadata definitions table is keyed by tenant,
 * module, kind and id, and a repeat would surface as a database error.
 */
const packageDefinitionKinds = (pkg: { entities: Array<{ id: string }>; fields: Array<{ id: string }>; relations: Array<{ id: string }>; views: Array<{ id: string }>; forms: Array<{ id: string }>; workflows: Array<{ id: string }>; actions: Array<{ id: string }>; automations: Array<{ id: string }>; reports: Array<{ id: string }>; dashboards: Array<{ id: string }> }) => [
  ['entity', pkg.entities.map((definition) => definition.id)],
  ['field', pkg.fields.map((definition) => definition.id)],
  ['relation', pkg.relations.map((definition) => definition.id)],
  ['view', pkg.views.map((definition) => definition.id)],
  ['form', pkg.forms.map((definition) => definition.id)],
  ['workflow', pkg.workflows.map((definition) => definition.id)],
  ['action', pkg.actions.map((definition) => definition.id)],
  ['automation', pkg.automations.map((definition) => definition.id)],
  ['report', pkg.reports.map((definition) => definition.id)],
  ['dashboard', pkg.dashboards.map((definition) => definition.id)],
] as const;

/** Module-scoped metadata: schema, entities, fields, relations, workflows, actions, package. */
export function definitionRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withTenant, withDefinitions } = createHelpers(dependencies);

  app.get('/modules/:moduleId/schema', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.getModuleSchema(moduleId))));
  app.get('/modules/:moduleId/entities', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listEntities(moduleId))));
  app.get('/modules/:moduleId/workflows', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listWorkflows(moduleId))));
  app.post('/modules/:moduleId/workflows', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = WorkflowDefinitionSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createWorkflow(moduleId, parsed.data, principal.userId), 201);
  }));
  app.get('/modules/:moduleId/actions', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listActions(moduleId))));
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

  app.get('/modules/:moduleId/package', async (c) => withDefinitions(c, async (_repo, moduleId, tenantId) => {
    try {
      return c.json(await packageRepository(dependencies.db!, createTenantContext(tenantId)).exportPackage(moduleId));
    } catch (error) {
      return error instanceof ModuleNotFoundError || (error instanceof Error && error.message.startsWith('Module not found'))
        ? c.json(errorResponse('MODULE_NOT_FOUND', error.message, 404), 404)
        : c.json(errorResponse('EXPORT_FAILED', error instanceof Error ? error.message : 'Export failed', 500), 500);
    }
  }));
  app.post('/modules/:moduleId/package/import', async (c) => withTenant(c, 'module:write', async (db, tenantId, principal) => {
    const body = await c.req.json().catch(() => undefined);
    if (!body || typeof body !== 'object') return invalid(c, 'Package payload required');
    const moduleId = c.req.param('moduleId');
    const now = new Date().toISOString();
    const candidate = body as { manifest?: Record<string, unknown>; module?: Record<string, unknown> };
    // The server owns the identity of what lands: the tenant, the owner, the
    // timestamps, the status and the module id. A package carries the identity
    // of the tenant it was exported from, and that copy is not authoritative.
    const normalized = {
      ...candidate,
      manifest: candidate.manifest ?? {},
      module: {
        ...(candidate.module ?? {}),
        id: moduleId,
        tenantId,
        owner: { id: principal.userId, type: 'user' },
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      },
    };
    const parsed = ModulePackageSchema.safeParse(normalized);
    if (!parsed.success) return invalid(c, parsed.error.message);
    const pkg = parsed.data;
    if (pkg.manifest.moduleId !== moduleId) return invalid(c, 'Package moduleId does not match the URL');
    for (const [kind, ids] of packageDefinitionKinds(pkg)) {
      if (new Set(ids).size !== ids.length) return invalid(c, `Package contains duplicate ${kind} ids`);
    }
    const repo = packageRepository(db, createTenantContext(tenantId));
    try {
      await repo.importPackage(pkg, principal.userId);
    } catch (error) {
      if (error instanceof DefinitionConflictError) return c.json(errorResponse('PACKAGE_CONFLICT', error.message, 409), 409);
      if (error instanceof ModuleConflictError) return c.json(errorResponse('MODULE_CONFLICT', error.message, 409), 409);
      throw error;
    }
    return c.json({ imported: true, module: { ...pkg.module, id: moduleId, tenantId, owner: { id: principal.userId, type: 'user' }, status: 'draft', createdAt: now, updatedAt: now } }, 201);
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

  return app;
}
