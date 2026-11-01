import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { greet } from '@nexa/core';
import { logger, runWithCorrelationId } from './logging';
import { getTenantContext } from '@nexa/core/db';
import { createPlatformDb } from './platform-db';
import { tenantMiddleware } from './tenant-middleware';
import { lookupTenant, provisionTenant } from './tenants';
import { registerUser, loginUser } from './auth';
import { createCrudRoutes } from './crud-routes';
import { createModuleRoutes } from './module-routes';
import { createWorkflowRoutes } from './workflow-routes';

const db = createPlatformDb();

const app = new Hono();

app.use('*', async (c, next) => {
  const incoming = c.req.header('x-correlation-id');
  const id = incoming && incoming.length > 0 ? incoming : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  c.header('x-correlation-id', id);
  await runWithCorrelationId(id, () => next());
});

app.get('/health', (c) => c.json({ ok: true }));

app.get('/greet/:name', (c) => {
  const name = c.req.param('name');
  const message = greet({ id: '1', email: 'a@b.com', name, passwordHash: '', createdAt: new Date().toISOString() });
  return c.json({ message });
});

// Auth (public)
app.post('/auth/register', async (c) => {
  const body = await c.req.json<{ email: string; password: string; name?: string }>();
  const user = await registerUser(db, body.email, body.password, body.name ?? null);
  return c.json({ id: user.id, email: user.email, name: user.name }, 201);
});

app.post('/auth/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const result = await loginUser(db, body.email, body.password);
  if (!result) return c.json({ error: 'invalid credentials' }, 401);
  return c.json({ token: result.token, user: { id: result.user.id, email: result.user.email } });
});

// Tenant provisioning (public)
app.post('/tenants', async (c) => {
  const body = await c.req.json<{ slug: string; name: string; dialect?: 'postgres' | 'sqlite' }>();
  const tenant = await provisionTenant(db, { slug: body.slug, name: body.name, dialect: body.dialect ?? 'postgres' });
  return c.json(tenant, 201);
});

// Tenant-scoped routes
app.use('/api/*', tenantMiddleware((slug) => lookupTenant(db, slug)));

app.get('/api/me', (c) => {
  const ctx = getTenantContext();
  return c.json({ tenant: ctx?.tenant ?? null });
});

app.route('/api', createCrudRoutes());
app.route('/api/modules', createModuleRoutes());
app.route('/api/workflow', createWorkflowRoutes());

const port = Number(process.env.PORT ?? 3000);
logger.info('server starting', { port });

serve({ fetch: app.fetch, port }, (info) => {
  logger.info('server listening', { port: info.port });
});