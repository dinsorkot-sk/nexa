import { Hono } from 'hono';
import { getTenantContext } from '@nexa/core/db';
import { WorkflowEngine, NotificationCenter, applyReportFilters } from '@nexa/core/db';
import type { MetaWorkflow } from '@nexa/types';

const notifications = new NotificationCenter();

export function createWorkflowRoutes() {
  const r = new Hono();

  // In-memory workflow store per tenant
  const workflows = new Map<string, MetaWorkflow>();
  const instances = new Map<string, { entity: string; recordId: string; state: string }>();

  r.post('/definitions', async (c) => {
    const body = await c.req.json<MetaWorkflow>();
    workflows.set(body.name, body);
    return c.json(body, 201);
  });

  r.get('/definitions', (c) => {
    return c.json({ data: Array.from(workflows.values()) });
  });

  r.post('/transition', async (c) => {
    const body = await c.req.json<{ workflow: string; recordId: string; to: string }>();
    const wf = workflows.get(body.workflow);
    if (!wf) return c.json({ error: 'workflow not found' }, 404);
    const key = `${body.workflow}:${body.recordId}`;
    const inst = instances.get(key) ?? { entity: body.workflow, recordId: body.recordId, state: wf.states[0] };
    const engine = new WorkflowEngine(wf);
    try {
      const next = engine.transition(inst, body.to);
      instances.set(key, next);
      const ctx = getTenantContext();
      notifications.push({ tenantId: ctx?.tenant.id ?? '', userId: null, title: 'Workflow transition', body: `${body.workflow}: ${inst.state} -> ${body.to}` });
      return c.json({ state: next.state });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  r.get('/state/:workflow/:recordId', (c) => {
    const key = `${c.req.param('workflow')}:${c.req.param('recordId')}`;
    const inst = instances.get(key);
    if (!inst) return c.json({ error: 'not found' }, 404);
    return c.json({ state: inst.state });
  });

  // Notifications
  r.get('/notifications', (c) => {
    const ctx = getTenantContext();
    const tid = ctx?.tenant.id ?? '';
    return c.json({ data: notifications.list(tid), unread: notifications.unreadCount(tid) });
  });

  r.post('/notifications/:id/read', (c) => {
    notifications.markRead(c.req.param('id'));
    return c.json({ ok: true });
  });

  // Audit log viewer
  r.get('/audit', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const db = (await import('./tenant-db')).getTenantDb(ctx.namespace);
    const entity = c.req.query('entity');
    let q = db.selectFrom('audit_log').selectAll();
    if (entity) q = q.where('entity', '=', entity);
    const rows = await q.execute();
    return c.json({ data: rows });
  });

  // Report builder
  r.post('/reports', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const body = await c.req.json<{ entity: string; filters?: { field: string; op: string; value: unknown }[] }>();
    const db = (await import('./tenant-db')).getTenantDb(ctx.namespace);
    const entityRow = await db.selectFrom('meta_entity').selectAll().where('name', '=', body.entity).executeTakeFirst();
    if (!entityRow) return c.json({ error: 'entity not found' }, 404);
    const rows = await db.selectFrom(entityRow.table_name as never).selectAll().execute();
    const filtered = applyReportFilters(rows as Record<string, unknown>[], body.filters ?? []);
    return c.json({ data: filtered, total: filtered.length });
  });

  return r;
}