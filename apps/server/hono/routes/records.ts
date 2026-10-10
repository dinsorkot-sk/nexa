import { Hono } from 'hono';
import { RecordCreateInputSchema, RecordQuerySchema, RecordUpdateInputSchema } from '@nexa/meta';
import { createTenantContext, identityRepository, moduleRepository, tenantRepository } from '@nexa/db';
import { parseQuery } from '../../../../packages/engine/query/index';
import { validateRecordData } from '../../../../packages/engine/entity/index';
import { createHelpers, errorResponse, invalid, missingDefinition, missingRecord, redactHidden, requireEnabled, type AppDependencies } from '../shared';

/** Record CRUD, relation links, and record activity. Business rules live in engine/db; this file parses, calls, and maps. */
export function recordRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withDefinitions, enqueueAutomations } = createHelpers(dependencies);

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
    const uniqueFieldIds = fields.filter((field) => field.options.unique).map((field) => field.id);
    // Record and automation job commit together: a crash cannot keep one without the other.
    const record = await repo.runInTransaction(async (tx) => {
      const created = await repo.createScopedRecord(moduleId, entityId, data, principal.userId, uniqueFieldIds, tx);
      await enqueueAutomations(tx, tenantId, moduleId, { type: 'record', entityId, recordId: created.id, operation: 'created', payload: { data } }, principal.userId);
      return created;
    });
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
    const uniqueFieldIds = fields.filter((field) => field.options.unique).map((field) => field.id);
    const updated = await repo.runInTransaction(async (tx) => {
      const written = await repo.updateScopedRecord(moduleId, entityId, c.req.param('recordId'), data, parsed.data.version ?? existing.version, principal.userId, uniqueFieldIds, tx);
      if (written) await enqueueAutomations(tx, tenantId, moduleId, { type: 'record', entityId, recordId: written.id, operation: 'updated', payload: { data } }, principal.userId);
      return written;
    });
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
