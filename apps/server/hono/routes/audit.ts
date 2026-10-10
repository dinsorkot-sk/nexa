import { Hono } from 'hono';
import { auditRepository, createTenantContext } from '@nexa/db';
import { createHelpers, type AppDependencies } from '../shared';

/** Audit log, event log, and operational stats. All read-only and gated by definition:read. */
export function auditRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withTenant } = createHelpers(dependencies);

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

  return app;
}
