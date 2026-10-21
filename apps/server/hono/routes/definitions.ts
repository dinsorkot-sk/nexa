import { Hono } from 'hono';
import {
  ActionDefinitionSchema, EntityCreateInputSchema, EntityUpdateInputSchema, FieldCreateInputSchema, FieldUpdateInputSchema,
  ModulePackageSchema, RelationCreateInputSchema, RelationUpdateInputSchema, ViewCreateInputSchema, ViewUpdateInputSchema,
  FormCreateInputSchema, FormUpdateInputSchema, PermissionCreateInputSchema, PermissionUpdateInputSchema, WorkflowDefinitionSchema,
} from '@nexa/meta';
import { DefinitionConflictError, ModuleConflictError, ModuleNotFoundError, createTenantContext, moduleRepository, packageRepository } from '@nexa/db';
import { isUpgrade, templateToPackage } from '../../../../packages/engine/pkg/index';
import { createHelpers, errorResponse, invalid, missingDefinition, type AppDependencies } from '../shared';
import { isMetadataTemplateId, metadataTemplates, type MetadataTemplateId } from '../templates';

/**
 * Rewrites the module id of the definitions that carry one. A package names
 * the module it was exported from, and the definitions belong to the module
 * they are imported into.
 */
const withModuleId = (definitions: unknown, moduleId: string) => (Array.isArray(definitions)
  ? definitions.map((definition) => (definition && typeof definition === 'object' ? { ...definition, moduleId } : definition))
  : definitions);

/**
 * The definition kinds a package carries, with the ids of each. A definition
 * id is unique per kind inside a module, so the ids of one kind have to be
 * unique among themselves: the metadata definitions table is keyed by tenant,
 * module, kind and id, and a repeat would surface as a database error.
 */
const packageDefinitionKinds = (pkg: { entities: Array<{ id: string }>; fields: Array<{ id: string }>; relations: Array<{ id: string }>; views: Array<{ id: string }>; forms: Array<{ id: string }>; workflows: Array<{ id: string }>; actions: Array<{ id: string }>; automations: Array<{ id: string }>; reports: Array<{ id: string }>; dashboards: Array<{ id: string }>; permissions: Array<{ id: string }> }) => [
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
  ['permission', pkg.permissions.map((definition) => definition.id)],
] as const;

/** Module-scoped metadata: schema, entities, fields, relations, workflows, actions, package. */
export function definitionRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withDefinitions, withPackageAccess } = createHelpers(dependencies);

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
  app.get('/modules/:moduleId/views', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listViews(moduleId, c.req.query('entityId')))));
  app.post('/modules/:moduleId/views', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = ViewCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createView(moduleId, parsed.data, principal.userId), 201);
  }));
  app.get('/modules/:moduleId/views/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const view = await repo.getView(moduleId, c.req.param('id'));
    return view ? c.json(view) : missingDefinition(c, 'View');
  }));
  app.patch('/modules/:moduleId/views/:id', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = ViewUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.updateView(moduleId, c.req.param('id'), parsed.data, principal.userId));
  }));
  app.delete('/modules/:moduleId/views/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    await repo.deleteView(moduleId, c.req.param('id'));
    return c.body(null, 204);
  }));
  app.get('/modules/:moduleId/forms', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listForms(moduleId, c.req.query('entityId')))));
  app.post('/modules/:moduleId/forms', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = FormCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createForm(moduleId, parsed.data, principal.userId), 201);
  }));
  app.get('/modules/:moduleId/forms/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const form = await repo.getForm(moduleId, c.req.param('id'));
    return form ? c.json(form) : missingDefinition(c, 'Form');
  }));
  app.patch('/modules/:moduleId/forms/:id', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = FormUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.updateForm(moduleId, c.req.param('id'), parsed.data, principal.userId));
  }));
  app.delete('/modules/:moduleId/forms/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    await repo.deleteForm(moduleId, c.req.param('id'));
    return c.body(null, 204);
  }));
  app.get('/modules/:moduleId/permissions', async (c) => withDefinitions(c, async (repo, moduleId) => c.json(await repo.listPermissions(moduleId))));
  app.post('/modules/:moduleId/permissions', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = PermissionCreateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.createPermission(moduleId, parsed.data, principal.userId), 201);
  }));
  app.get('/modules/:moduleId/permissions/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    const permission = await repo.getPermission(moduleId, c.req.param('id'));
    return permission ? c.json(permission) : missingDefinition(c, 'Permission');
  }));
  app.patch('/modules/:moduleId/permissions/:id', async (c) => withDefinitions(c, async (repo, moduleId, _tenantId, principal) => {
    const parsed = PermissionUpdateInputSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return invalid(c, parsed.error.message);
    return c.json(await repo.updatePermission(moduleId, c.req.param('id'), parsed.data, principal.userId));
  }));
  app.delete('/modules/:moduleId/permissions/:id', async (c) => withDefinitions(c, async (repo, moduleId) => {
    await repo.deletePermission(moduleId, c.req.param('id'));
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

  app.get('/modules/:moduleId/package', async (c) => withPackageAccess(c, 'export', 'definition:read', async (db, tenantId) => {
    try {
      return c.json(await packageRepository(db, createTenantContext(tenantId)).exportPackage(c.req.param('moduleId')));
    } catch (error) {
      return error instanceof ModuleNotFoundError || (error instanceof Error && error.message.startsWith('Module not found'))
        ? c.json(errorResponse('MODULE_NOT_FOUND', error.message, 404), 404)
        : c.json(errorResponse('EXPORT_FAILED', error instanceof Error ? error.message : 'Export failed', 500), 500);
    }
  }));
  app.post('/modules/:moduleId/from-template', async (c) => withPackageAccess(c, 'import', 'module:write', async (db, tenantId, principal) => {
    const body = await c.req.json().catch(() => undefined);
    if (!body || typeof body !== 'object') return invalid(c, 'Template payload required');
    const requested = body as { templateId?: unknown; name?: unknown };
    if (typeof requested.templateId !== 'string' || !isMetadataTemplateId(requested.templateId)) {
      return invalid(c, `Unknown template: ${String(requested.templateId)}`);
    }
    const templateId = requested.templateId as MetadataTemplateId;
    if (requested.name !== undefined && typeof requested.name !== 'string') return invalid(c, 'Template name must be a string');
    const moduleId = c.req.param('moduleId');
    const now = new Date().toISOString();
    const pkg = templateToPackage(metadataTemplates[templateId], {
      moduleId,
      ...(typeof requested.name === 'string' ? { name: requested.name } : {}),
      tenantId,
      owner: { id: principal.userId, type: 'user' },
      now,
    });
    const repo = packageRepository(db, createTenantContext(tenantId));
    try {
      await repo.importPackage(pkg, principal.userId);
    } catch (error) {
      if (error instanceof DefinitionConflictError) return c.json(errorResponse('PACKAGE_CONFLICT', error.message, 409), 409);
      if (error instanceof ModuleConflictError) return c.json(errorResponse('MODULE_CONFLICT', error.message, 409), 409);
      throw error;
    }
    return c.json({ imported: true, template: templateId, module: pkg.module }, 201);
  }));
  app.post('/modules/:moduleId/package/import', async (c) => withPackageAccess(c, 'import', 'module:write', async (db, tenantId, principal) => {
    const body = await c.req.json().catch(() => undefined);
    if (!body || typeof body !== 'object') return invalid(c, 'Package payload required');
    const moduleId = c.req.param('moduleId');
    const now = new Date().toISOString();
    const candidate = body as { manifest?: Record<string, unknown>; module?: Record<string, unknown> } & Record<string, unknown>;
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
      entities: withModuleId(candidate.entities, moduleId),
      views: withModuleId(candidate.views, moduleId),
      forms: withModuleId(candidate.forms, moduleId),
      workflows: withModuleId(candidate.workflows, moduleId),
      actions: withModuleId(candidate.actions, moduleId),
      automations: withModuleId(candidate.automations, moduleId),
      reports: withModuleId(candidate.reports, moduleId),
      dashboards: withModuleId(candidate.dashboards, moduleId),
      permissions: withModuleId(candidate.permissions, moduleId),
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
  app.post('/modules/:moduleId/package/upgrade', async (c) => withPackageAccess(c, 'update', 'module:write', async (db, tenantId, principal) => {
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
