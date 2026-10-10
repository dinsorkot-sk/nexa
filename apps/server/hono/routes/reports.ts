import { Hono } from 'hono';
import { DashboardDefinitionSchema, ReportDefinitionSchema } from '@nexa/meta';
import { createTenantContext, moduleRepository, tenantRepository } from '@nexa/db';
import { runReport } from '../../../../packages/engine/report/index';
import { createHelpers, errorResponse, invalid, missingDefinition, requireEnabled, type AppDependencies } from '../shared';

export function reportRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withDefinitions } = createHelpers(dependencies);

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

  return app;
}
